"""Build a download-only .mrpack without bundling mod binaries or game data."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
from urllib.parse import urlparse
from zipfile import ZIP_DEFLATED, ZipFile


def build(profile: Path, output: Path):
    index = json.loads((profile / "modrinth.index.json").read_text(encoding="utf-8"))
    if index.get("formatVersion") != 1 or index.get("game") != "minecraft":
        raise ValueError("Expected a Minecraft Modrinth format v1 profile")
    seen = set()
    for entry in index["files"]:
        path = PurePosixPath(entry["path"])
        if (str(path) != entry["path"] or path.is_absolute() or ".." in path.parts
                or "\\" in str(path) or len(path.parts) != 2
                or path.parts[0] not in {"mods", "resourcepacks", "shaderpacks"}
                or str(path) in seen):
            raise ValueError(f"Unsafe or duplicate profile path: {path}")
        seen.add(str(path))
        for algorithm, length in (("sha1", 40), ("sha512", 128)):
            if not re.fullmatch(f"[0-9a-f]{{{length}}}", entry["hashes"][algorithm]):
                raise ValueError(f"Invalid {algorithm}: {path}")
        if entry["fileSize"] <= 0 or entry["env"] != {"client": "required", "server": "unsupported"}:
            raise ValueError(f"Invalid client-only file: {path}")
        if not entry["downloads"] or any(
            urlparse(url).scheme != "https" or urlparse(url).hostname != "cdn.modrinth.com"
            for url in entry["downloads"]
        ):
            raise ValueError(f"Only official Modrinth CDN downloads are allowed: {path}")
    allowed_overrides = {"options.txt", "config/iris.properties"}
    allowed_overrides.update(entry["path"] + ".txt" for entry in index["files"]
                             if entry["path"].startswith("shaderpacks/"))
    overrides = []
    for path in sorted((profile / "overrides").rglob("*")):
        if path.is_symlink():
            raise ValueError("Symlinks are not profile overrides")
        if path.is_file():
            name = path.relative_to(profile / "overrides").as_posix()
            if name not in allowed_overrides:
                raise ValueError(f"Unexpected override: {name}")
            overrides.append((path, "overrides/" + name))
    output.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation protects existing archives from accidental replacement.
    with ZipFile(output, "x", compression=ZIP_DEFLATED) as archive:
        archive.writestr("modrinth.index.json", json.dumps(index, ensure_ascii=False, indent=2))
        for path, name in overrides:
            archive.write(path, name)
    print(json.dumps({"output": str(output.resolve()), "downloads": len(seen),
                      "sha256": hashlib.sha256(output.read_bytes()).hexdigest()}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("profile", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    build(args.profile.resolve(), args.output.resolve())
