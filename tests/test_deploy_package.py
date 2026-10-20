import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

MODULE = Path(__file__).resolve().parents[1] / "deployment/package_release.py"


class PackageTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location("package_release", MODULE)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.client = self.root / "client"
        self.client.mkdir()
        (self.client / "index.html").write_text("中文首页", encoding="utf-8")
        (self.client / "_astro").mkdir()
        (self.client / "_astro/app.js").write_text("console.log('ok')")

    def test_bundle_has_only_static_and_image_archives(self):
        image = self.root / "image.tar.gz"
        image.write_bytes(b"docker archive test fixture")
        artifact = self.root / "release.tar"
        self.module.create_bundle(self.client, image, artifact)
        with tarfile.open(artifact) as outer:
            self.assertEqual(outer.getnames(), ["site.tar.gz", "image.tar.gz"])
            self.assertEqual(outer.extractfile("image.tar.gz").read(), image.read_bytes())
            with tarfile.open(fileobj=io.BytesIO(outer.extractfile("site.tar.gz").read()), mode="r:gz") as site:
                self.assertEqual(set(site.getnames()), {"index.html", "_astro/app.js"})
                self.assertEqual(site.extractfile("index.html").read().decode(), "中文首页")

    def test_accidental_private_files_block_packaging(self):
        for name in (".env", "guestbook.db", "data.sqlite", "guestbook.db-wal"):
            with self.subTest(name=name):
                private = self.client / name
                private.write_text("private test fixture")
                try:
                    with self.assertRaises(ValueError):
                        self.module.create_site_archive(self.client, self.root / "site.tar.gz")
                finally:
                    private.unlink()

    def test_bad_commit_rejected_before_docker(self):
        for commit in ("master", "a" * 39, "A" * 40, "a" * 40 + ";id"):
            with self.assertRaises(ValueError):
                self.module.validate_commit(commit)


if __name__ == "__main__":
    unittest.main()
