"""Publisher boundary tests use real archives and disk state; Docker is external."""
import hashlib
import io
import json
from pathlib import Path
import sqlite3
import signal
import sys
import tarfile
import tempfile
import unittest
from contextlib import closing, redirect_stderr
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from deployment import publisher as p

SHA = "a" * 40


def archive(entries, compressed=True):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w:gz" if compressed else "w") as tar:
        for name, data, kind in entries:
            item = tarfile.TarInfo(name)
            item.type = kind
            item.size = len(data) if kind == tarfile.REGTYPE else 0
            item.linkname = "../../outside" if kind in (tarfile.SYMTYPE, tarfile.LNKTYPE) else ""
            tar.addfile(item, io.BytesIO(data))
    return output.getvalue()


def regular(name, data):
    return name, data, tarfile.REGTYPE


def site(commit=SHA, extra=()):
    return archive([regular("index.html", b"home"), regular("deployment.json", json.dumps({"commit": commit}).encode()), *extra])


def image(tags=None, revision=SHA, user="node", config_path="blobs/sha256/config"):
    config = json.dumps({"config": {"User": user, "Labels": {"org.opencontainers.image.revision": revision}}}).encode()
    manifest = [{"Config": config_path, "RepoTags": tags if tags is not None else ["mystarry-blog:" + SHA], "Layers": ["layer.tar"]}]
    return archive([regular("manifest.json", json.dumps(manifest).encode()), regular(config_path, config), regular("layer.tar", b"layer")])


def oci_image(container_name=None, other_config=False, corrupt_descriptor=False):
    config = json.dumps({"architecture":"amd64", "os":"linux", "config":{"User":"node", "Labels":{"org.opencontainers.image.revision":SHA}}}).encode()
    actual_config = config if not other_config else config.replace(b'"node"', b'"root"')
    config_path = "blobs/sha256/" + hashlib.sha256(config).hexdigest()
    actual_path = "blobs/sha256/" + hashlib.sha256(actual_config).hexdigest()
    layer_path = "blobs/sha256/" + hashlib.sha256(b"layer").hexdigest()
    runtime = json.dumps({"schemaVersion":2,"mediaType":"application/vnd.oci.image.manifest.v1+json", "config":{"digest":"sha256:"+actual_path.split('/')[-1],"size":len(actual_config)},"layers":[{"digest":"sha256:"+layer_path.split('/')[-1],"size":5}]}).encode()
    runtime_path = "blobs/sha256/" + hashlib.sha256(runtime).hexdigest()
    descriptor={"digest":"sha256:"+runtime_path.split('/')[-1],"size":len(runtime),"platform":{"os":"linux","architecture":"amd64"},"annotations":{"org.opencontainers.image.ref.name":SHA,"io.containerd.image.name":container_name or "docker.io/library/mystarry-blog:"+SHA}}
    if corrupt_descriptor: descriptor["digest"]="sha256:"+"f"*64
    manifest=[{"Config":config_path,"RepoTags":["mystarry-blog:"+SHA],"Layers":[layer_path]}]
    entries=[regular("manifest.json",json.dumps(manifest).encode()), regular("index.json",json.dumps({"schemaVersion":2,"manifests":[descriptor]}).encode()), regular(config_path,config),regular(layer_path,b"layer"),regular(runtime_path,runtime)]
    if other_config:entries.append(regular(actual_path,actual_config))
    return archive(entries)


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def test_protocol_is_exact_and_rejects_before_io(self):
        self.assertEqual(p.parse_command("check"), ("check", None, None))
        self.assertEqual(p.parse_command("deploy " + SHA + " " + "b" * 64), ("deploy", SHA, "b" * 64))
        for command in ["", "check extra", "sh", "deploy ../bad " + "b" * 64, "deploy " + SHA.upper() + " " + "b" * 64, "deploy " + SHA + " " + "b" * 64 + ";id"]:
            with self.subTest(command=command), self.assertRaises(p.DeployError):
                p.parse_command(command)

    def test_main_rejects_unknown_command_without_publisher_or_input(self):
        with patch.object(p, "Publisher") as constructor, redirect_stderr(io.StringIO()):
            self.assertEqual(p.main(["sh -c id"], source=object()), 1)
            constructor.assert_not_called()

    def test_check_never_reads_standard_input(self):
        class InputMustNotBeRead:
            def read(self, *args):
                raise AssertionError("check read deployment stream")
        with patch.object(p.Publisher, "check", return_value={"status": "ready", "endpoint": "astro-bento-portfolio:8080"}), patch("builtins.print"):
            self.assertEqual(p.main(["check"], source=InputMustNotBeRead()), 0)

    def test_bundle_consumes_input_and_verifies_digest(self):
        data = archive([regular("site.tar.gz", site()), regular("image.tar.gz", image())], False)
        source = io.BytesIO(data)
        result = p.unpack_bundle(source, hashlib.sha256(data).hexdigest(), self.root)
        self.assertEqual(source.tell(), len(data))
        self.assertEqual(set(result), {"site.tar.gz", "image.tar.gz"})
        self.assertEqual(result["site.tar.gz"].read_bytes(), site())
        with self.assertRaises(p.DeployError):
            p.unpack_bundle(io.BytesIO(data), "0" * 64, self.root / "bad")

    def test_bundle_rejects_extra_duplicate_links_traversal_and_size(self):
        good = [regular("site.tar.gz", site()), regular("image.tar.gz", image())]
        for bad in [regular(".env", b"secret"), regular("../site.tar.gz", b"x"), regular("site.tar.gz", b"duplicate"), ("link", b"", tarfile.SYMTYPE)]:
            data = archive(good + [bad], False)
            with self.subTest(name=bad[0]), self.assertRaises(p.DeployError):
                p.unpack_bundle(io.BytesIO(data), hashlib.sha256(data).hexdigest(), self.root / hashlib.md5(data).hexdigest())
        with self.assertRaises(p.DeployError):
            p.unpack_bundle(io.BytesIO(b"x" * 32), "0" * 64, self.root / "large", max_bytes=16)

    def test_image_accepts_modern_config_path_and_rejects_other_tags_or_root(self):
        path = self.root / "image.tar.gz"
        for payload in [image(), image(config_path="config.json", user="1000:1000")]:
            path.write_bytes(payload)
            p.validate_image_archive(path, SHA)
        for payload in [image(tags=["other:latest"]), image(tags=["mystarry-blog:" + SHA, "other:latest"]), image(revision="b" * 40), image(user="root"), image(user="0"), image(user="node:0")]:
            path.write_bytes(payload)
            with self.assertRaises(p.DeployError):
                p.validate_image_archive(path, SHA)

    def test_image_rejects_missing_layers_legacy_tags_and_extra_oci_images(self):
        path = self.root / "image.tar.gz"
        for extra in [regular("repositories", b'{"other":{"latest":"layer"}}'), regular("index.json", b'{"manifests":[{},{}]}'), regular("../overwrite", b"x")]:
            with tarfile.open(fileobj=io.BytesIO(image()), mode="r:gz") as source:
                members = [regular(member.name, source.extractfile(member).read()) for member in source]
            path.write_bytes(archive(members + [extra]))
            with self.subTest(extra=extra[0]), self.assertRaises(p.DeployError):
                p.validate_image_archive(path, SHA)

    def test_site_and_image_decompression_are_bounded(self):
        path = self.root / "site.tar.gz"
        path.write_bytes(site())
        with patch.object(p, "MAX_SITE_BYTES", 100), self.assertRaises(p.DeployError):
            p.extract_site(path, self.root / "bounded", SHA)
        path.write_bytes(image())
        with patch.object(p, "MAX_IMAGE_BYTES", 100), self.assertRaises(p.DeployError):
            p.validate_image_archive(path, SHA)

    def test_oci_graph_cannot_override_valid_legacy_tag_or_config(self):
        path=self.root / "oci.tar.gz"
        path.write_bytes(oci_image())
        p.validate_image_archive(path,SHA)
        for payload in (oci_image(container_name="docker.io/library/other:latest"),oci_image(other_config=True),oci_image(corrupt_descriptor=True)):
            path.write_bytes(payload)
            with self.assertRaises(p.DeployError):p.validate_image_archive(path,SHA)

    def test_site_rejects_file_size_and_count_limits(self):
        path = self.root / "site.tar.gz"
        path.write_bytes(site())
        with patch.object(p, "MAX_SITE_FILE", 2), self.assertRaises(p.DeployError):
            p.extract_site(path, self.root / "small", SHA)

    def test_site_extracts_files_and_rejects_unsafe_members_or_wrong_commit(self):
        path = self.root / "site.tar.gz"
        path.write_bytes(site(extra=[("assets", b"", tarfile.DIRTYPE), regular("assets/a.txt", b"a")]))
        p.extract_site(path, self.root / "safe", SHA)
        self.assertEqual((self.root / "safe/assets/a.txt").read_bytes(), b"a")
        for index, extra in enumerate([regular("../escape", b"x"), regular("/escape", b"x"), regular("a\\b", b"x"), ("link", b"", tarfile.SYMTYPE), ("hardlink", b"", tarfile.LNKTYPE), regular("index.html", b"duplicate"), regular(".env", b"x")]):
            path.write_bytes(site(extra=[extra]))
            with self.subTest(member=extra[0]), self.assertRaises(p.DeployError):
                p.extract_site(path, self.root / str(index), SHA)
        path.write_bytes(site(commit="b" * 40))
        with self.assertRaises(p.DeployError):
            p.extract_site(path, self.root / "mismatch", SHA)


class FakeDocker:
    """Only subprocess boundary is fake; all publisher state is on real disk."""
    def __init__(self, root, failure=False, backup_failure=False):
        self.root = root
        self.failure = failure
        self.backup_failure = backup_failure
        self.commands = []
        self.active_image = "sha256:" + "1" * 64

    def __call__(self, args, **kwargs):
        self.commands.append(args)
        if args[:2] == ["docker", "ps"]:
            return "other-id\napp-id\nweb-id\n"
        if args[:2] == ["docker", "inspect"]:
            if "--format" in args:
                return "healthy\n"
            if args[-1] == "mystarry-blog-app":
                return json.dumps([{"Image": self.active_image}])
            return json.dumps([{"Id": "other-id", "Name": "/other", "State": {"StartedAt": "unchanged"}}, {"Id": "app-id", "Name": "/mystarry-blog-app", "State": {"StartedAt": "now"}}, {"Id": "web-id", "Name": "/astro-bento-portfolio", "State": {"StartedAt": "now"}}])
        if args[:2] == ["docker", "exec"] and "scripts/backup-guestbook.mjs" in args:
            if self.backup_failure:
                raise p.DeployError("backup operation failed")
            destination = self.root / args[-1].removeprefix("/data/")
            destination = self.root / "data" / destination.relative_to(self.root)
            destination.parent.mkdir(parents=True, exist_ok=True)
            with closing(sqlite3.connect(self.root / "data/guestbook.db")) as source, closing(sqlite3.connect(destination)) as target:
                source.backup(target)
        if args[:2] == ["docker", "exec"] and "--input-type=module" in args:
            return "ok\n"
        if args[0] == "docker-compose" and "up" in args and args[-1] == "app":
            values = p.read_env(self.root / ".env")
            self.active_image = values["PORTFOLIO_IMAGE"]
        if args[:4] == ["docker", "exec", p.WEB, "wget"]:
            if self.failure and "/deployment.json" in args[-1]:
                return json.dumps({"commit": "wrong"})
            return json.dumps({"commit": SHA})
        return ""


class RolloutTests(unittest.TestCase):
    def fixture(self, root):
        (root / "data").mkdir()
        with closing(sqlite3.connect(root / "data/guestbook.db")) as db, db:
            db.execute("CREATE TABLE guestbook (body TEXT)")
            db.execute("INSERT INTO guestbook VALUES ('acceptance marker')")
        old_site = root / "releases/old/site"
        old_site.mkdir(parents=True)
        (root / "current").symlink_to(old_site, target_is_directory=True)
        (root / ".env").write_text("NGINX_IMAGE=nginx:trusted\nPORTFOLIO_IMAGE=mystarry-blog:" + SHA + "\nKEEP=this\n")
        (root / ".app.env").write_text("secret never changed")
        for config in ["docker-compose.yml", "nginx.conf", "nginx-main.conf"]:
            (root / config).write_text("trusted server configuration")
        bundle = archive([regular("site.tar.gz", site()), regular("image.tar.gz", image())], False)
        return old_site, bundle

    def test_health_probes_run_inside_web_without_host_port(self):
        with tempfile.TemporaryDirectory() as temp:
            runner = FakeDocker(Path(temp))
            p.Publisher(root=temp, run=runner, health_timeout=0).healthy(SHA)
            probes = [["docker", "exec", p.WEB, "wget", "-q", "-T", "5", "-O", "-",
                       "http://127.0.0.1:8080" + path]
                      for path in ("/", "/projects/", "/api/guestbook?page=1", "/healthz", "/deployment.json")]
            self.assertEqual(runner.commands[3:], probes)

    def test_health_rejects_wrong_served_commit(self):
        with tempfile.TemporaryDirectory() as temp:
            runner = FakeDocker(Path(temp), failure=True)
            with self.assertRaisesRegex(p.DeployError, "served release revision mismatch"):
                p.Publisher(root=temp, run=runner, health_timeout=0).healthy(SHA)

    def test_check_reports_internal_endpoint_without_legacy_port_constraint(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.fixture(root)
            (root / ".env").write_text("PORT=1234\nNGINX_IMAGE=nginx:trusted\n")
            self.assertEqual(p.Publisher(root=root).check(),
                             {"status": "ready", "endpoint": "astro-bento-portfolio:8080"})

    def test_success_switches_static_and_only_own_services_with_consistent_backup(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            old_site, bundle = self.fixture(root)
            before_db = (root / "data/guestbook.db").read_bytes()
            runner = FakeDocker(root)
            publisher = p.Publisher(root=root, run=runner, health_timeout=0)
            result = publisher.deploy(SHA, hashlib.sha256(bundle).hexdigest(), io.BytesIO(bundle))
            self.assertEqual(result["status"], "succeeded")
            self.assertEqual(result["endpoint"], "astro-bento-portfolio:8080")
            self.assertNotIn("port", result)
            self.assertNotEqual((root / "current").resolve(), old_site)
            self.assertEqual(json.loads((root / "current/deployment.json").read_text())["commit"], SHA)
            self.assertEqual((root / "data/guestbook.db").read_bytes(), before_db)
            self.assertTrue(old_site.is_dir())
            operations = [command for command in runner.commands if command[0] == "docker-compose"]
            self.assertEqual([command[5:] for command in operations], [["stop", "web", "app"], ["rm", "-f", "web", "app"], ["up", "-d", "--no-build", "--no-deps", "app"], ["up", "-d", "--no-build", "--no-deps", "web"]])
            self.assertFalse(list(root.glob(".incoming-*")))

    def test_backup_failure_does_not_load_image_or_switch_services(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            old_site, bundle = self.fixture(root)
            runner = FakeDocker(root, backup_failure=True)
            publisher = p.Publisher(root=root, run=runner, health_timeout=0)
            with self.assertRaises(p.DeployError):
                publisher.deploy(SHA, hashlib.sha256(bundle).hexdigest(), io.BytesIO(bundle))
            self.assertEqual((root / "current").resolve(), old_site)
            self.assertFalse(any(command[0] == "docker-compose" or command[:2] == ["docker", "load"] for command in runner.commands))
            self.assertEqual(json.loads(next((root / "deployments").glob("*.json")).read_text())["rollback"], "not-required")

    def test_failed_rollout_restores_immutable_image_and_static_target_preserving_sqlite(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            old_site, bundle = self.fixture(root)
            before_db = (root / "data/guestbook.db").read_bytes()
            runner = FakeDocker(root, failure=True)
            publisher = p.Publisher(root=root, run=runner, health_timeout=0)
            with self.assertRaises(p.DeployError):
                publisher.deploy(SHA, hashlib.sha256(bundle).hexdigest(), io.BytesIO(bundle))
            self.assertEqual((root / "current").resolve(), old_site)
            self.assertEqual(p.read_env(root / ".env")["PORTFOLIO_IMAGE"], "sha256:" + "1" * 64)
            self.assertEqual(p.read_env(root / ".env")["KEEP"], "this")
            self.assertEqual((root / "data/guestbook.db").read_bytes(), before_db)
            self.assertEqual((root / ".app.env").read_text(), "secret never changed")
            backups = list((root / "data/backups").glob("*.db"))
            self.assertEqual(len(backups), 1)
            with closing(sqlite3.connect(backups[0])) as db:
                self.assertEqual(db.execute("SELECT body FROM guestbook").fetchone()[0], "acceptance marker")
            record = json.loads(next((root / "deployments").glob("*.json")).read_text())
            self.assertEqual(record["status"], "failed")
            self.assertEqual(record["rollback"], "succeeded")
            self.assertFalse(any("down" in command or "prune" in command for command in runner.commands))

    def test_keyboard_interrupt_after_stop_rolls_back_without_touching_data(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            old_site, bundle = self.fixture(root)
            before_db = (root / "data/guestbook.db").read_bytes()
            runner = FakeDocker(root)
            interrupted = False
            def run(args, **kwargs):
                nonlocal interrupted
                if args[0] == "docker-compose" and "up" in args and not interrupted:
                    interrupted = True
                    raise KeyboardInterrupt()
                return runner(args, **kwargs)
            with self.assertRaises(p.DeployError):
                p.Publisher(root, run=run, health_timeout=0).deploy(SHA,hashlib.sha256(bundle).hexdigest(),io.BytesIO(bundle))
            self.assertEqual((root / "current").resolve(), old_site)
            self.assertEqual((root / "data/guestbook.db").read_bytes(),before_db)
            self.assertEqual(p.read_env(root / ".env")["PORTFOLIO_IMAGE"],"sha256:"+"1"*64)

    def test_termination_is_caught_and_repeated_signal_during_rollback_is_ignored(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            old_site,bundle=self.fixture(root)
            runner=FakeDocker(root)
            times=0
            def run(args,**kwargs):
                nonlocal times
                result=runner(args,**kwargs)
                if args[0]=='docker-compose' and 'up' in args and args[-1]=='app':
                    times+=1
                    signal.raise_signal(signal.SIGTERM)
                return result
            previous=signal.getsignal(signal.SIGTERM)
            with p.deployment_signals(),self.assertRaises(p.DeployError):
                p.Publisher(root,run=run,health_timeout=0).deploy(SHA,hashlib.sha256(bundle).hexdigest(),io.BytesIO(bundle))
            self.assertEqual(times,2)
            self.assertEqual(signal.getsignal(signal.SIGTERM),previous)
            self.assertEqual((root/'current').resolve(),old_site)
            record=json.loads(next((root/'deployments').glob('*.json')).read_text())
            self.assertEqual(record['rollback'],'succeeded')


if __name__ == "__main__":
    unittest.main()
