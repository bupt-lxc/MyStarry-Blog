#!/usr/bin/env python3
"""Root-owned forced-SSH publisher. No artifact-supplied commands or configuration.

Invocation: publisher.py "$SSH_ORIGINAL_COMMAND". Standard input is an outer tar.
Only the stdlib is required on the Ubuntu server (Python 3.10 or later).
"""
from contextlib import contextmanager
from datetime import datetime, timezone
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile
import time
import uuid

ROOT = Path("/home/ubuntu/astro-bento-portfolio")
PROJECT = "astro-bento"
APP = "mystarry-blog-app"
WEB = "astro-bento-portfolio"
ENDPOINT = WEB + ":8080"
MAX_BUNDLE_BYTES = 512 * 1024 * 1024
MAX_SITE_BYTES = 1024 * 1024 * 1024
MAX_IMAGE_BYTES = 4 * 1024 * 1024 * 1024
MAX_SITE_FILE = 128 * 1024 * 1024
MAX_METADATA_BYTES = 4 * 1024 * 1024


class DeployError(Exception):
    """A safe, public deployment error; never includes subprocess output."""


class BoundedTarInfo(tarfile.TarInfo):
    # tarfile otherwise reads extension headers before yielding a member.
    def _proc_pax(self, tar):
        if self.size > 65536:
            raise DeployError("oversized tar metadata")
        return super()._proc_pax(tar)

    def _proc_gnulong(self, tar):
        if self.size > 4096:
            raise DeployError("oversized tar path metadata")
        return super()._proc_gnulong(tar)

    def _proc_sparse(self, *_args):
        raise DeployError("sparse archives are not supported")

    _proc_gnusparse_00 = _proc_sparse
    _proc_gnusparse_01 = _proc_sparse
    _proc_gnusparse_10 = _proc_sparse


def parse_command(command):
    if command == "check":
        return "check", None, None
    match = re.fullmatch(r"deploy ([0-9a-f]{40}) ([0-9a-f]{64})", command)
    if not match:
        raise DeployError("unsupported deployment command")
    return "deploy", match[1], match[2]


class LimitedReader:
    """Bound decompressed reads too, including tar headers and padding."""
    def __init__(self, source, limit):
        self.source, self.remaining = source, limit

    def read(self, size=-1):
        size = min(size if size >= 0 else 1024 * 1024, self.remaining + 1)
        data = self.source.read(size)
        self.remaining -= len(data)
        if self.remaining < 0:
            raise DeployError("archive exceeds size limit")
        return data


def safe_name(member, allow_dot=False):
    name = member.name
    if allow_dot and name == "." and member.isdir():
        return None
    parts = name.rstrip("/").split("/")
    if (not name or len(name) > 1024 or "\\" in name or "\x00" in name
            or name.startswith("/") or any(part in ("", ".", "..") for part in parts)
            or ":" in parts[0] or any(ord(char) < 32 for char in name)):
        raise DeployError("unsafe archive path")
    if not (member.isfile() or member.isdir()) or member.issparse():
        raise DeployError("archive contains unsupported member")
    return PurePosixPath(*parts).as_posix()


@contextmanager
def tar_stream(path, expanded_limit):
    try:
        with gzip.open(path, "rb") as source:
            reader = LimitedReader(source, expanded_limit)
            with tarfile.open(fileobj=reader, mode="r|", tarinfo=BoundedTarInfo) as tar:
                yield tar
            # Force gzip CRC/trailer verification even if tar stopped at EOF blocks.
            while reader.read(1024 * 1024):
                pass
    except (tarfile.TarError, OSError, EOFError, ValueError) as exc:
        raise DeployError("invalid compressed archive") from exc


def copy_member(tar, member, destination):
    source = tar.extractfile(member)
    if source is None:
        raise DeployError("missing archive content")
    with source, destination.open("xb") as output:
        shutil.copyfileobj(source, output, 1024 * 1024)
    destination.chmod(0o644)


def unpack_bundle(source, expected_digest, destination, max_bytes=MAX_BUNDLE_BYTES):
    """Read all input before processing/output, avoiding SSH pipe backpressure."""
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    bundle = destination / "bundle.tar"
    digest = hashlib.sha256()
    total = 0
    with bundle.open("xb") as output:
        while True:
            chunk = source.read(min(1024 * 1024, max_bytes - total + 1))
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise DeployError("release bundle exceeds size limit")
            digest.update(chunk)
            output.write(chunk)
    if digest.hexdigest() != expected_digest:
        raise DeployError("release bundle digest mismatch")
    allowed = {"site.tar.gz", "image.tar.gz"}
    result = {}
    try:
        with tarfile.open(bundle, mode="r|", tarinfo=BoundedTarInfo) as tar:
            for member in tar:
                name = safe_name(member)
                if name not in allowed or name in result or not member.isfile() or member.size > max_bytes:
                    raise DeployError("release bundle must contain exactly site.tar.gz and image.tar.gz")
                target = destination / name
                copy_member(tar, member, target)
                result[name] = target
        if set(result) != allowed:
            raise DeployError("release bundle is incomplete")
    except (tarfile.TarError, OSError, ValueError) as exc:
        raise DeployError("invalid release bundle") from exc
    return result


def read_json(data):
    try:
        return json.loads(data)
    except (ValueError, TypeError, UnicodeError) as exc:
        raise DeployError("invalid archive metadata") from exc


def validate_image_archive(path, commit):
    """Inspect without loading; supports Docker 29 blobs/sha256 config paths."""
    seen, metadata, count = set(), {}, 0
    with tar_stream(path, MAX_IMAGE_BYTES) as tar:
        for member in tar:
            name = safe_name(member, allow_dot=True)
            if name is None:
                continue
            count += 1
            if count > 100000 or name in seen or member.size > MAX_IMAGE_BYTES:
                raise DeployError("invalid image archive limits or duplicate path")
            seen.add(name)
            # Only small JSON metadata is retained; layers are streamed past.
            if member.isfile() and (name.endswith(".json") or name.startswith("blobs/sha256/") or name == "repositories") and member.size <= MAX_METADATA_BYTES:
                metadata[name] = tar.extractfile(member).read()
                if sum(map(len, metadata.values())) > 32 * 1024 * 1024:
                    raise DeployError("excessive image metadata")
    manifest = read_json(metadata.get("manifest.json", b""))
    expected_tag = "mystarry-blog:" + commit
    if not isinstance(manifest, list) or len(manifest) != 1 or not isinstance(manifest[0], dict) or manifest[0].get("RepoTags") != [expected_tag]:
        raise DeployError("image archive has unexpected repository tags")
    config_path = manifest[0].get("Config")
    if not isinstance(config_path, str) or config_path not in metadata:
        raise DeployError("missing image config")
    config = read_json(metadata[config_path])
    runtime = config.get("config", {}) if isinstance(config, dict) else {}
    if not isinstance(runtime, dict):
        raise DeployError("invalid image runtime config")
    labels = runtime.get("Labels") or {}
    if runtime.get("User") not in {"node", "1000", "node:node", "1000:1000", "node:1000", "1000:node"} or not isinstance(labels, dict) or labels.get("org.opencontainers.image.revision") != commit:
        raise DeployError("image must be non-root and match release revision")
    layers = manifest[0].get("Layers")
    if not isinstance(layers, list) or not layers or any(not isinstance(layer, str) or layer not in seen for layer in layers):
        raise DeployError("missing image layers")
    if "repositories" in metadata:
        repositories = read_json(metadata["repositories"])
        if not isinstance(repositories, dict) or set(repositories) != {"mystarry-blog"} or not isinstance(repositories["mystarry-blog"], dict) or set(repositories["mystarry-blog"]) != {commit}:
            raise DeployError("legacy image metadata has unexpected tags")
    if "index.json" in metadata:
        index = read_json(metadata["index.json"])
        validate_oci_graph(index, metadata, config_path, layers, expected_tag, commit)


def validate_oci_graph(index, metadata, config_path, legacy_layers, expected_tag, commit):
    """Bind Docker's OCI view to the already validated legacy manifest.

    CI disables provenance and builds exactly linux/amd64, so a second platform
    or attestation is unnecessary and rejected rather than ambiguously loaded.
    """
    def one_descriptor(value):
        if not isinstance(value, dict) or not isinstance(value.get("manifests"), list) or len(value["manifests"]) != 1:
            raise DeployError("image OCI index must contain one image")
        return value["manifests"][0]

    def blob(descriptor):
        if not isinstance(descriptor, dict) or not re.fullmatch(r"sha256:[0-9a-f]{64}", str(descriptor.get("digest", ""))):
            raise DeployError("invalid OCI descriptor")
        key = "blobs/sha256/" + descriptor["digest"][7:]
        raw = metadata.get(key)
        if raw is None or len(raw) != descriptor.get("size") or hashlib.sha256(raw).hexdigest() != descriptor["digest"][7:]:
            raise DeployError("OCI metadata digest mismatch")
        return key, raw

    def visit(descriptor, depth=0):
        if depth > 8 or not isinstance(descriptor, dict):
            raise DeployError("invalid OCI graph")
        annotations = descriptor.get("annotations", {})
        if not isinstance(annotations, dict):
            raise DeployError("invalid OCI annotations")
        if annotations.get("org.opencontainers.image.ref.name", commit) not in {expected_tag, commit}:
            raise DeployError("image OCI index has unexpected tag")
        if annotations.get("io.containerd.image.name", expected_tag) not in {expected_tag, "docker.io/library/" + expected_tag}:
            raise DeployError("image OCI index has unexpected containerd tag")
        platform = descriptor.get("platform")
        if platform is not None and (not isinstance(platform, dict) or platform.get("os") != "linux" or platform.get("architecture") != "amd64"):
            raise DeployError("only linux/amd64 images are accepted")
        _, raw = blob(descriptor)
        node = read_json(raw)
        if not isinstance(node, dict):
            raise DeployError("invalid OCI manifest")
        if "manifests" in node:
            return visit(one_descriptor(node), depth + 1)
        _, actual_config = blob(node.get("config"))
        if actual_config != metadata[config_path]:
            raise DeployError("OCI and legacy image configs differ")
        config = read_json(actual_config)
        if config.get("os") != "linux" or config.get("architecture") != "amd64":
            raise DeployError("only linux/amd64 images are accepted")
        oci_layers = node.get("layers")
        if not isinstance(oci_layers, list) or any(not isinstance(layer, dict) or not re.fullmatch(r"sha256:[0-9a-f]{64}", str(layer.get("digest", ""))) for layer in oci_layers):
            raise DeployError("invalid OCI layers")
        if ["blobs/sha256/" + layer["digest"][7:] for layer in oci_layers] != legacy_layers:
            raise DeployError("OCI and legacy image layers differ")

    visit(one_descriptor(index))


def extract_site(path, destination, commit):
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=False, mode=0o755)
    seen = set()
    with tar_stream(path, MAX_SITE_BYTES) as tar:
        for member in tar:
            name = safe_name(member, allow_dot=True)
            if name is None:
                continue
            if name in seen or len(seen) >= 50000 or member.size > MAX_SITE_FILE:
                raise DeployError("invalid static archive limits or duplicate path")
            if any(part.startswith(".") for part in PurePosixPath(name).parts) or name.endswith((".db", ".db-wal", ".db-shm", ".sqlite", ".sqlite3")):
                raise DeployError("static archive contains private data path")
            seen.add(name)
            target = destination / name
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True, mode=0o755)
            else:
                target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
                copy_member(tar, member, target)
    metadata = destination / "deployment.json"
    revision = read_json(metadata.read_bytes()) if metadata.is_file() and metadata.stat().st_size <= MAX_METADATA_BYTES else None
    if not isinstance(revision, dict) or revision.get("commit") != commit:
        raise DeployError("static release revision mismatch")


def read_env(path):
    result = {}
    for line in Path(path).read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        key, separator, value = stripped.partition("=")
        if not separator or key in result:
            raise DeployError("invalid trusted environment file")
        result[key] = value.strip().strip("\"'")
    return result


def atomic_write(path, content, mode=0o600):
    path = Path(path)
    existing = path.stat() if path.exists() else None
    fd, temporary = tempfile.mkstemp(prefix=".publisher-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temporary, (existing.st_mode & 0o777) if existing else mode)
        if existing and hasattr(os, "chown"):
            os.chown(temporary, existing.st_uid, existing.st_gid)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def update_image(path, image):
    lines = Path(path).read_text().splitlines(keepends=True)
    replacement = "PORTFOLIO_IMAGE=" + image + "\n"
    found = False
    for index, line in enumerate(lines):
        if line.strip().startswith("PORTFOLIO_IMAGE="):
            lines[index], found = replacement, True
    if not found:
        if lines and not lines[-1].endswith("\n"):
            lines[-1] += "\n"
        lines.append(replacement)
    atomic_write(path, "".join(lines))


@contextmanager
def file_lock(path):
    with Path(path).open("a+b") as handle:
        if os.name == "nt":
            import msvcrt
            handle.write(b"\0")
            handle.flush()
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            if os.name == "nt":
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


@contextmanager
def deployment_signals(ignore=False):
    """Turn catchable session termination into rollback; shield recovery itself."""
    saved = {}
    def interrupted(_signum, _frame):
        raise DeployError("deployment interrupted")
    try:
        for name in ("SIGTERM", "SIGHUP", "SIGINT"):
            signum = getattr(signal, name, None)
            if signum is not None:
                saved[signum] = signal.getsignal(signum)
                signal.signal(signum, signal.SIG_IGN if ignore else interrupted)
        yield
    finally:
        for signum, handler in saved.items():
            signal.signal(signum, handler)


def execute(args, *, cwd, timeout=120):
    try:
        result = subprocess.run(args, cwd=cwd, stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                check=True, text=True, timeout=timeout,
                                env={"PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", "LANG": "C.UTF-8"})
        return result.stdout
    except (subprocess.SubprocessError, OSError) as exc:
        raise DeployError("external deployment operation failed") from exc


class Publisher:
    def __init__(self, root=ROOT, run=execute, health_timeout=120):
        self.root, self.run, self.health_timeout = Path(root), run, health_timeout

    def command(self, *args, timeout=120):
        return self.run(list(args), cwd=self.root, timeout=timeout)

    def compose(self, *args):
        return self.command("docker-compose", "-p", PROJECT, "-f", str(self.root / "docker-compose.yml"), *args)

    def check(self):
        for name in ("docker-compose.yml", "nginx.conf", "nginx-main.conf", ".env", ".app.env"):
            if not (self.root / name).is_file():
                raise DeployError("server deployment configuration is incomplete")
        values = read_env(self.root / ".env")
        nginx = values.get("NGINX_IMAGE", "nginx:1.25-alpine")
        if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._/@:-]{0,255}", nginx):
            raise DeployError("invalid trusted nginx image")
        current = self.root / "current"
        if not current.is_symlink() or not current.resolve().is_relative_to((self.root / "releases").resolve()) or not current.resolve().is_dir():
            raise DeployError("server current release is invalid")
        return {"status": "ready", "endpoint": ENDPOINT}

    def other_containers(self):
        ids = self.command("docker", "ps", "-aq").split()
        if not ids:
            return {}
        result = read_json(self.command("docker", "inspect", *ids))
        return dict(sorted((item["Name"], [item["Id"], item["State"]["StartedAt"]]) for item in result if item["Name"].lstrip("/") not in {APP, WEB}))

    def original_nginx(self):
        path = Path("/home/lxc/awards/backend/nginx.conf")
        return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None

    def recreate(self):
        self.compose("stop", "web", "app")
        self.compose("rm", "-f", "web", "app")
        self.compose("up", "-d", "--no-build", "--no-deps", "app")
        self.compose("up", "-d", "--no-build", "--no-deps", "web")

    def set_current(self, target):
        temporary = self.root / (".current-" + uuid.uuid4().hex)
        try:
            temporary.symlink_to(target, target_is_directory=True)
            if os.name == "nt" and (self.root / "current").is_symlink():
                # Windows cannot replace a directory symlink; production is POSIX.
                (self.root / "current").unlink()
            os.replace(temporary, self.root / "current")
        finally:
            if temporary.is_symlink():
                temporary.unlink()

    def healthy(self, commit=None):
        deadline = time.monotonic() + self.health_timeout
        while True:
            try:
                for container in (APP, WEB):
                    health = self.command("docker", "inspect", "--format", "{{.State.Health.Status}}", container).strip()
                    if health != "healthy":
                        raise DeployError("container health not ready")
                break
            except DeployError:
                if time.monotonic() >= deadline:
                    raise DeployError("deployment health timed out")
                time.sleep(min(3, max(0, deadline - time.monotonic())))
        self.command("docker", "exec", WEB, "nginx", "-t")
        for path in ("/", "/projects/", "/api/guestbook?page=1", "/healthz"):
            self.command("docker", "exec", WEB, "wget", "-q", "-T", "5", "-O", "-", "http://127.0.0.1:8080" + path, timeout=10)
        if commit:
            revision = read_json(self.command("docker", "exec", WEB, "wget", "-q", "-T", "5", "-O", "-", "http://127.0.0.1:8080/deployment.json", timeout=10))
            if not isinstance(revision, dict) or revision.get("commit") != commit:
                raise DeployError("served release revision mismatch")

    def deploy(self, commit, digest, source):
        # Validate even for direct library callers, before filesystem mutation.
        parse_command("deploy " + commit + " " + digest)
        self.check()
        with file_lock(self.root / ".publisher.lock"):
            release_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ-") + commit + "-" + uuid.uuid4().hex[:8]
            release = self.root / "releases" / release_id
            record_path = self.root / "deployments" / (release_id + ".json")
            record_path.parent.mkdir(mode=0o700, exist_ok=True)
            record = {"commit": commit, "release": release_id, "status": "validating", "rollback": "not-required"}
            mutated = False
            old_target = os.readlink(self.root / "current")
            try:
                # Private temporary directory cleanup never touches releases or DB.
                with tempfile.TemporaryDirectory(prefix=".incoming-", dir=self.root) as temporary:
                    files = unpack_bundle(source, digest, Path(temporary))
                    validate_image_archive(files["image.tar.gz"], commit)
                    release.mkdir(mode=0o755)
                    extract_site(files["site.tar.gz"], release / "site", commit)
                    others, nginx_hash = self.other_containers(), self.original_nginx()
                    inspected = read_json(self.command("docker", "inspect", APP))
                    old_image = inspected[0]["Image"]
                    if not re.fullmatch(r"sha256:[0-9a-f]{64}", old_image):
                        raise DeployError("cannot capture immutable rollback image")
                    backup = "/data/backups/deploy-" + release_id + ".db"
                    self.command("docker", "exec", APP, "node", "scripts/backup-guestbook.mjs", backup)
                    integrity = "import {createClient} from '@libsql/client';const c=createClient({url:'file:'+process.argv[1]});try{const r=await c.execute('PRAGMA integrity_check');if(r.rows.length!==1||r.rows[0][0]!=='ok')process.exitCode=1;else console.log('ok')}finally{c.close()}"
                    if self.command("docker", "exec", APP, "node", "--input-type=module", "-e", integrity, backup).strip() != "ok":
                        raise DeployError("database backup integrity check failed")
                    nginx = read_env(self.root / ".env").get("NGINX_IMAGE", "nginx:1.25-alpine")
                    self.command("docker", "run", "--rm", "--read-only", "--network", "astro-bento_default", "--tmpfs", "/var/cache/nginx", "--tmpfs", "/var/run", "--tmpfs", "/tmp", "-v", str(self.root / "nginx.conf") + ":/etc/nginx/conf.d/default.conf:ro", "-v", str(self.root / "nginx-main.conf") + ":/etc/nginx/nginx.conf:ro", "-v", str(release / "site") + ":/usr/share/nginx/html:ro", "--entrypoint", "nginx", nginx, "-t")
                    self.command("docker", "load", "--platform", "linux/amd64", "--input", str(files["image.tar.gz"]), timeout=300)
                    record.update({"old_current": old_target, "old_image": old_image, "backup": backup, "status": "switching"})
                    atomic_write(record_path, json.dumps(record) + "\n")
                    mutated = True
                    self.set_current(str(release / "site"))
                    update_image(self.root / ".env", "mystarry-blog:" + commit)
                    self.recreate()
                    self.healthy(commit)
                    if self.other_containers() != others or self.original_nginx() != nginx_hash:
                        raise DeployError("other project preservation check failed")
                    record["status"] = "succeeded"
            except BaseException as exc:
                record["status"] = "failed"
                record["error"] = str(exc) if isinstance(exc, DeployError) else "unexpected publisher failure"
                if mutated:
                    try:
                        with deployment_signals(ignore=True):
                            self.set_current(old_target)
                            update_image(self.root / ".env", old_image)
                            self.recreate()
                            self.healthy()
                            if self.other_containers() != others or self.original_nginx() != nginx_hash:
                                raise DeployError("rollback preservation check failed")
                        record["rollback"] = "succeeded"
                    except Exception:
                        record["rollback"] = "failed"
                atomic_write(record_path, json.dumps(record) + "\n")
                raise DeployError("deployment failed; rollback " + record["rollback"]) from exc
            atomic_write(record_path, json.dumps(record) + "\n")
            return {"status": "succeeded", "commit": commit, "endpoint": ENDPOINT}


def main(argv=None, source=None):
    argv = sys.argv[1:] if argv is None else argv
    try:
        if len(argv) != 1:
            raise DeployError("exactly one original SSH command is required")
        action, commit, digest = parse_command(argv[0])
        publisher = Publisher()
        with deployment_signals():
            result = publisher.check() if action == "check" else publisher.deploy(commit, digest, source or sys.stdin.buffer)
        print(json.dumps(result, sort_keys=True), flush=True)
        return 0
    except DeployError as exc:
        print(json.dumps({"status": "error", "message": str(exc)}), file=sys.stderr, flush=True)
        return 1
    except Exception:
        print('{"status":"error","message":"deployment operation failed"}', file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
