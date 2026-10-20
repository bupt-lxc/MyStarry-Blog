"""Create the two-file deployment protocol; no runtime secrets are required."""
import argparse
import gzip
import hashlib
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile


def validate_commit(commit):
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("Expected a full lowercase Git commit SHA")
    return commit


def create_site_archive(client, destination):
    client = Path(client).resolve(strict=True)
    if not (client / "index.html").is_file():
        raise ValueError("The pre-rendered homepage is missing")
    files = []
    for path in sorted(client.rglob("*")):
        relative = path.relative_to(client)
        if path.is_symlink():
            raise ValueError("Static output contains a symbolic link")
        if any(part.startswith(".") or part in ("node_modules", "__pycache__") for part in relative.parts):
            raise ValueError("Static output contains a private path")
        if path.name.endswith((".db", ".db-wal", ".db-shm", ".sqlite", ".sqlite3")):
            raise ValueError("Static output contains a database")
        if path.is_file():
            files.append((path, relative.as_posix()))
    with tarfile.open(destination, "w:gz") as archive:
        for path, relative in files:
            archive.add(path, arcname=relative, recursive=False)


def create_bundle(client, image_archive, destination):
    with tempfile.TemporaryDirectory(prefix="mystarry-package-") as temporary:
        site = Path(temporary) / "site.tar.gz"
        create_site_archive(client, site)
        with tarfile.open(destination, "w") as bundle:
            bundle.add(site, arcname="site.tar.gz", recursive=False)
            bundle.add(image_archive, arcname="image.tar.gz", recursive=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--commit", required=True, type=validate_commit)
    parser.add_argument("--client", type=Path, default=Path("dist/client"))
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="mystarry-image-") as temporary:
        image = Path(temporary) / "image.tar.gz"
        process = subprocess.Popen(["docker", "save", f"mystarry-blog:{args.commit}"], stdout=subprocess.PIPE)
        try:
            with gzip.open(image, "wb", compresslevel=3) as compressed:
                while True:
                    chunk = process.stdout.read(1024 * 1024)
                    if not chunk:
                        break
                    compressed.write(chunk)
            if process.wait() != 0:
                raise RuntimeError("Docker image export failed")
        finally:
            process.stdout.close()
            if process.poll() is None:
                process.terminate()
                process.wait()
        create_bundle(args.client, image, args.output)
    with args.output.open("rb") as stream:
        digest = hashlib.sha256()
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    print(f"{digest.hexdigest()}  {args.output}")


if __name__ == "__main__":
    main()
