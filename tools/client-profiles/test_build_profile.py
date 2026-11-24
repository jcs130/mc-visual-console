"""The optional HUD preset must not broaden the private-config allowlist."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile


spec = importlib.util.spec_from_file_location("profile_builder", Path(__file__).with_name("build-profile.py"))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class ProfilePresetTests(unittest.TestCase):
    def make_profile(self, root, *, mod=True, name="config/RPG-HUD", value=b"Version=1.0\nH:hud_type=default\n"):
        files = [{"path": "mods/[1.21.1][NeoForge] RPG-HUD 3.13.jar",
                  "hashes": {"sha1": "a" * 40, "sha512": "b" * 128},
                  "fileSize": 220970, "env": {"client": "required", "server": "unsupported"},
                  "downloads": ["https://cdn.modrinth.com/example.jar"]}] if mod else []
        (root / "modrinth.index.json").write_text(json.dumps({"formatVersion": 1, "game": "minecraft",
            "dependencies": {"minecraft": "1.21.1", "neoforge": "21.1.265"}, "files": files}), encoding="utf-8")
        preset = root / "overrides" / name
        preset.parent.mkdir(parents=True)
        preset.write_bytes(value)

    def test_exact_public_preset_is_included(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.make_profile(root)
            builder.build(root, root / "pack.mrpack")
            with ZipFile(root / "pack.mrpack") as archive:
                self.assertEqual(archive.read("overrides/config/RPG-HUD"), b"Version=1.0\nH:hud_type=default\n")

    def test_preset_requires_the_matching_mod(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.make_profile(root, mod=False)
            with self.assertRaises(ValueError):
                builder.build(root, root / "pack.mrpack")

    def test_unrelated_or_private_configuration_is_rejected(self):
        for name, value in [("config/RPG-HUD", b"password=secret\n"),
                            ("config/private.json", b"{}"), ("servers.dat", b"x")]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                self.make_profile(root, name=name, value=value)
                with self.assertRaises(ValueError):
                    builder.build(root, root / "pack.mrpack")


if __name__ == "__main__":
    unittest.main()
