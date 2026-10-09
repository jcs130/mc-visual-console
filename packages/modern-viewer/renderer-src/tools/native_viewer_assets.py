"""Export byte-exact, namespaced modpack assets and audit native rendering needs.

This is a source archive, not a baked renderer. No vanilla substitute models,
texture cropping, generated icons, or state-ID remapping is permitted here.
"""
from __future__ import annotations

import argparse
from collections import Counter
from hashlib import sha256, sha1
from io import BytesIO
import json
from pathlib import Path, PurePosixPath
import re
import tempfile
import zipfile


RESOURCE_ID = re.compile(r"^[a-z0-9_.-]+:[a-z0-9_./-]+$")


def resource_id(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("Resource ID must be a string")
    value = value if ":" in value else "minecraft:" + value
    if not RESOURCE_ID.fullmatch(value) or any(p in (".", "..", "") for p in value.split(":", 1)[1].split("/")):
        raise ValueError("Invalid resource ID: " + value)
    return value


def resource_path(value: str, folder: str, suffix: str) -> str:
    namespace, name = resource_id(value).split(":", 1)
    return f"assets/{namespace}/{folder}/{name}{suffix}"


class AssetArchive:
    def __init__(self):
        self.data = {}
        self.sources = []
        self.index = {}
        self.variants = {}
        self.conflicts = []
        self.render_classes = []

    def add(self, content: bytes, label: str, explicit_override=False, depth=0):
        if depth > 4:
            raise ValueError("Embedded archive nesting limit")
        source_hash = sha256(content).hexdigest()
        self.sources.append({"name": label, "sha256": source_hash, "bytes": len(content), "explicitOverride": explicit_override})
        with zipfile.ZipFile(BytesIO(content)) as jar:
            seen = set()
            for info in jar.infolist():
                name = info.filename
                if name.startswith("assets/") and info.orig_filename != name:
                    raise ValueError("Non-canonical asset path: " + info.orig_filename)
                if name in seen and name.startswith("assets/") and not info.is_dir():
                    raise ValueError(f"Duplicate archive entry: {label}: {name}")
                seen.add(name)
                if name.endswith(".class") and re.search(r"(?:Renderer|Visual|Model|ModelLoader)\.class$", name):
                    self.render_classes.append({"source": label, "class": name})
                if not name.startswith("assets/") or info.is_dir():
                    continue
                parts = PurePosixPath(name).parts
                if "\\" in name or any(p in (".", "..", "") for p in name.split("/")) or len(parts) < 2 or ":" in name:
                    raise ValueError("Unsafe asset path: " + name)
                if len(parts) > 2 and not re.fullmatch(r"[a-z0-9_.-]+", parts[1]):
                    raise ValueError("Invalid asset namespace: " + name)
                if info.file_size > 64 * 1024 * 1024:
                    raise ValueError("Asset size limit: " + name)
                data = jar.read(info)
                digest = sha256(data).hexdigest()
                previous = self.index.get(name)
                if previous and previous["sha256"] != digest and not explicit_override:
                    # FML resource priority is not the filename order. Retain the
                    # conflict and forbid treating this export as authoritative.
                    self.conflicts.append({"path": name, "earlier": previous["source"], "later": label})
                history = list(previous.get("overriddenSources", [])) if previous else []
                variants = list(previous.get("variants", [])) if previous else []
                if previous:
                    history.append(previous["source"])
                    if not variants:
                        variants.append({"source": previous["source"], "sha256": previous["sha256"], "bytes": previous["bytes"]})
                    variants.append({"source": label, "sha256": digest, "bytes": len(data)})
                    # Atlases use stacked-resource merge semantics, not simply
                    # last file wins. Preserve every original version so the
                    # native client/adapter can resolve it without data loss.
                    self.variants[previous["sha256"]] = self.data[name]
                    self.variants[digest] = data
                self.data[name] = data
                self.index[name] = {"sha256": digest, "bytes": len(data), "source": label, "overriddenSources": history, "variants": variants}
            if "META-INF/jarjar/metadata.json" in seen:
                metadata = json.loads(jar.read("META-INF/jarjar/metadata.json"))
                for entry in metadata.get("jars", []):
                    nested = entry["path"]
                    if not nested.startswith("META-INF/") or not nested.endswith(".jar") or "\\" in nested or any(p in (".", "..", "") for p in nested.split("/")):
                        raise ValueError("Unsafe embedded JAR path")
                    self.add(jar.read(nested), label + "!" + nested, False, depth + 1)

    def json(self, path: str):
        if path not in self.data:
            return None
        return json.loads(self.data[path])


class ModelAudit:
    def __init__(self, assets: AssetArchive):
        self.assets = assets
        self.cache = {}

    def model(self, model_id: str, stack=()):
        model_id = resource_id(model_id)
        if model_id in stack:
            return {"textures": {}, "elements": [], "issues": ["model_parent_cycle:" + model_id], "chain": []}
        if model_id in self.cache:
            return self.cache[model_id]
        if model_id in ("minecraft:builtin/entity", "minecraft:builtin/generated"):
            issue = "native_item_renderer_required" if model_id.endswith("entity") else "generated_item_geometry_required"
            return {"textures": {}, "elements": [], "issues": [issue], "chain": [model_id]}
        raw = self.assets.json(resource_path(model_id, "models", ".json"))
        if raw is None:
            return {"textures": {}, "elements": [], "issues": ["missing_model:" + model_id], "chain": [model_id]}
        parent = self.model(raw["parent"], (*stack, model_id)) if raw.get("parent") else {"textures": {}, "elements": [], "issues": [], "chain": []}
        result = {"textures": {**parent["textures"], **raw.get("textures", {})},
                  "elements": raw.get("elements", parent["elements"]),
                  "issues": list(parent["issues"]), "chain": [*parent["chain"], model_id]}
        if raw.get("loader"):
            result["issues"].append("native_model_loader_required:" + str(raw["loader"]))
        for key in ("transform", "neoforge_data"):
            if key in raw:
                result["issues"].append("native_model_extension_required:" + key)
        for element in result["elements"]:
            if "neoforge_data" in element or any("neoforge_data" in f for f in element.get("faces", {}).values()):
                result["issues"].append("native_face_data_required")
        self.cache[model_id] = result
        return result

    def texture(self, reference: str, textures: dict):
        seen = set()
        while isinstance(reference, str) and reference.startswith("#"):
            if reference in seen:
                return None
            seen.add(reference)
            reference = textures.get(reference[1:])
        return resource_id(reference) if isinstance(reference, str) else None

    def block(self, block_id: str):
        raw = self.assets.json(resource_path(block_id, "blockstates", ".json"))
        if raw is None:
            return {"id": block_id, "status": "missing_blockstate", "issues": ["missing_blockstate"], "models": [], "textures": []}
        references = set()
        def walk(value):
            if isinstance(value, dict):
                if isinstance(value.get("model"), str):
                    references.add(resource_id(value["model"]))
                for child in value.values():
                    walk(child)
            elif isinstance(value, list):
                for child in value:
                    walk(child)
        walk(raw)
        issues, textures, chains = set(), set(), set()
        if not references:
            issues.add("native_blockstate_definition_required")
        for ref in references:
            model = self.model(ref)
            issues.update(model["issues"])
            chains.update(model["chain"])
            if not model["elements"] and block_id not in ("minecraft:air", "minecraft:cave_air", "minecraft:void_air", "minecraft:structure_void"):
                issues.add("native_or_special_geometry_required")
            for element in model["elements"]:
                for face in element.get("faces", {}).values():
                    resolved = self.texture(face.get("texture"), model["textures"])
                    if resolved is None:
                        issues.add("unresolved_texture_variable")
                    else:
                        textures.add(resolved)
                        if resource_path(resolved, "textures", ".png") not in self.assets.data:
                            issues.add("missing_texture:" + resolved)
            if any(model_id.endswith("water") or model_id.endswith("lava") for model_id in model["chain"]):
                issues.add("native_fluid_geometry_required")
        return {"id": block_id, "status": "native_rendering_required" if issues else "json_model_sources_verified",
                "issues": sorted(issues), "models": sorted(chains), "textures": sorted(textures)}


def read_blocks(path: Path):
    result, names, ids, states = [], set(), set(), set()
    for line in path.read_text(encoding="utf-8").splitlines():
        name, block, base, count = line.split("\t")
        name = resource_id(name)
        block, base, count = int(block), int(base), int(count)
        if name in names or block in ids or block < 0 or base < 0 or count < 1:
            raise ValueError("Invalid native block registry entry")
        current = set(range(base, base + count))
        if states.intersection(current):
            raise ValueError("Overlapping native state-ID ranges")
        names.add(name)
        ids.add(block)
        states.update(current)
        result.append({"id": name, "blockId": block, "stateBase": base, "stateCount": count})
    return result


BASE_PRIORITY_RULE = "neoforge-21.1.248-mods-above-vanilla"
BASE_PRIORITY_SOURCES = {
    "minecraft-1.21.1-client.jar": "499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99",
    "domum-ornamentum-1.0.231-main.jar": "04c0c902bdbcbd48e38bee5a323907ae0b7b7db4ff4a3e4da7c45334b65610a1",
    "neoforge-21.1.248-universal.jar": "90a56f70425711b4e1a4b94ff0c2904ae9f6d74ca6478b3b2152ac794a07b8e5",
}
BASE_PRIORITY_TEXTURES = {
    "oak_planks": ("3a33db67a3ba30537d0890a5cb37c8087ca336be89cbb1393a71c23224e361a8", "3b00412fec87bd07b83825b86de49bcb6c186ca7799f41721a36b04e5d8ed161"),
    "dark_oak_planks": ("2bccdc1ef269b7ae6050d46b70071ead5c3ad4c3a16e3f6baf24fc629752b8bc", "3d04f576678df35491ccc43b0fafddce13e310fa5f363ca13193f8a2f55b285b"),
}
# Exact class audit: ClientPackSource grc e5f833a22b1f144291f64472cb74ec057793920fc96b8b3b21efd90aaa390d41
# creates vanilla with BOTTOM; NeoForge ResourcePackLoader
# 89f699b517eb79e76d48eb7387b31939b38938ac70d68b0764f8db8b0f83ac3b
# creates mod_resources with TOP and expands children after it. FallbackResourceManager
# atv cb84739e30214079af9e1f511fb0857e33c80b5080afca45ab94923613f3c16a searches backwards.
def resolve_audited_base_priority(assets):
    if any(s["explicitOverride"] for s in assets.sources):
        return []
    for name, digest in BASE_PRIORITY_SOURCES.items():
        matches = [s for s in assets.sources if s["name"] == name]
        if len(matches) != 1 or matches[0]["sha256"] != digest:
            return []
    resolved = []
    for name, hashes in BASE_PRIORITY_TEXTURES.items():
        path = f"assets/minecraft/textures/block/{name}.png"
        entry = assets.index.get(path, {})
        variants = entry.get("variants", [])
        if (len(variants) == 2 and [v["source"] for v in variants] == list(BASE_PRIORITY_SOURCES)[:2]
                and tuple(v["sha256"] for v in variants) == hashes
                and entry.get("source") == variants[1]["source"] and entry.get("sha256") == hashes[1]):
            entry["priorityResolution"] = BASE_PRIORITY_RULE
            resolved.append(path)
    assets.conflicts = [c for c in assets.conflicts if c["path"] not in resolved]
    return resolved


def add_vanilla_languages(assets, client_bytes, minecraft_version, version_path, index_path, objects_dir, locales=("zh_cn",)):
    """Import byte-exact Mojang language objects, missing from the client JAR.

    Validate the version's client SHA1, index SHA1/size and object SHA1/size.
    Downloads are intentionally separate from this deterministic exporter.
    """
    version = json.loads(version_path.read_text(encoding="utf-8"))
    if version["id"] != minecraft_version or sha1(client_bytes).hexdigest() != version["downloads"]["client"]["sha1"]:
        raise ValueError("Language metadata and client JAR differ")
    index_bytes = index_path.read_bytes()
    info = version["assetIndex"]
    if sha1(index_bytes).hexdigest() != info["sha1"] or len(index_bytes) != info["size"]:
        raise ValueError("Mojang asset index hash/size differs")
    index = json.loads(index_bytes)
    label = f"minecraft-assets-{info['id']}:{info['sha1']}"
    assets.sources.append({"name": label, "sha256": sha256(index_bytes).hexdigest(), "bytes": len(index_bytes), "explicitOverride": False})
    for locale in locales:
        if not re.fullmatch(r"[a-z]{2}_[a-z]{2}", locale):
            raise ValueError("Invalid language locale")
        obj = index["objects"][f"minecraft/lang/{locale}.json"]
        if not re.fullmatch(r"[a-f0-9]{40}", obj["hash"]) or not 0 < obj["size"] <= 2097152:
            raise ValueError("Invalid language object")
        content = (objects_dir / obj["hash"]).read_bytes()
        if len(content) != obj["size"] or sha1(content).hexdigest() != obj["hash"]:
            raise ValueError("Mojang language object hash/size differs")
        values = json.loads(content)
        if not isinstance(values, dict) or any(not isinstance(v, str) for v in values.values()):
            raise ValueError("Invalid language dictionary")
        path = f"assets/minecraft/lang/{locale}.json"
        if path in assets.index:
            raise ValueError("Language resource already provided")
        assets.data[path] = content
        assets.index[path] = {"sha256": sha256(content).hexdigest(), "bytes": len(content), "source": label,
                              "objectSha1": obj["hash"], "assetIndexSha1": info["sha1"], "overriddenSources": [], "variants": []}


def export(client: Path, lock_file: Path, mods_dir: Path, registry_dir: Path, output: Path, resource_packs=(), platform_jars=(), vanilla_languages=None):
    lock = json.loads(lock_file.read_text(encoding="utf-8"))
    client_bytes = client.read_bytes()
    with zipfile.ZipFile(BytesIO(client_bytes)) as jar:
        if json.loads(jar.read("version.json"))["id"] != lock["minecraftVersion"]:
            raise ValueError("Client and modpack Minecraft versions differ")
    expected = {row["name"]: row["sha256"] for row in lock["artifacts"] if row["kind"] == "mod"}
    expected.update({row["name"]: row["sha256"] for row in lock.get("builtArtifacts", [])})
    installed = {p.name for p in mods_dir.glob("*.jar")}
    if installed != set(expected):
        raise ValueError("Modpack JAR set differs from lock: " + str(sorted(installed.symmetric_difference(expected))))
    if output.exists():
        raise ValueError("Output must be new; preserve previous export and choose a new directory")
    assets = AssetArchive()
    assets.add(client_bytes, client.name)
    if vanilla_languages:
        add_vanilla_languages(assets, client_bytes, lock["minecraftVersion"], **vanilla_languages)
    for platform in platform_jars:
        assets.add(platform.read_bytes(), platform.name)
    for name in sorted(expected):
        content = (mods_dir / name).read_bytes()
        if sha256(content).hexdigest() != expected[name]:
            raise ValueError("Modpack JAR SHA-256 differs from lock: " + name)
        assets.add(content, name)
    for pack in resource_packs:
        assets.add(pack.read_bytes(), pack.name, explicit_override=True)
    resolved_priorities = resolve_audited_base_priority(assets)
    blocks = read_blocks(registry_dir / "blocks.tsv")
    audit = ModelAudit(assets)
    coverage = [dict(row, **audit.block(row["id"])) for row in blocks]
    native_states = registry_dir / "block-states.jsonl"
    if native_states.exists():
        rows = [json.loads(line) for line in native_states.read_text(encoding="utf-8").splitlines()]
        by_name = {row["id"]: row for row in coverage}
        all_ids = set()
        for row in rows:
            block = by_name[row["name"]]
            state_id = row["stateId"]
            if state_id in all_ids or not block["stateBase"] <= state_id < block["stateBase"] + block["stateCount"]:
                raise ValueError("Native state dump and block ranges differ")
            all_ids.add(state_id)
            if row["hasBlockEntity"] or row["renderShape"] != "MODEL":
                if block["id"] not in ("minecraft:air", "minecraft:cave_air", "minecraft:void_air", "minecraft:structure_void"):
                    block["issues"] = sorted(set(block["issues"]) | {"native_block_entity_or_special_renderer_required"})
                    block["status"] = "native_rendering_required"
        if len(all_ids) != sum(row["stateCount"] for row in coverage):
            raise ValueError("Native state dump is incomplete")
    output.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=output.name + "-staging-", dir=output.parent))
    for name, content in assets.data.items():
        dest = stage / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(content)
        if sha256(dest.read_bytes()).hexdigest() != assets.index[name]["sha256"]:
            raise ValueError("Exported asset byte mismatch: " + name)
    for digest, content in assets.variants.items():
        dest = stage / "asset-variants" / (digest + ".bin")
        dest.parent.mkdir(exist_ok=True)
        dest.write_bytes(content)
        if sha256(dest.read_bytes()).hexdigest() != digest:
            raise ValueError("Stacked asset byte mismatch")
    registry_hashes = {}
    for source in registry_dir.iterdir():
        if source.name not in ("blocks.tsv", "items.tsv", "components.tsv", "block-states.jsonl", "entities.tsv"):
            continue
        target = stage / "registry" / source.name
        target.parent.mkdir(exist_ok=True)
        target.write_bytes(source.read_bytes())
        registry_hashes[source.name] = sha256(target.read_bytes()).hexdigest()
    counts = dict(Counter(row["status"] for row in coverage))
    report = {"schemaVersion": 1, "mode": "native-original", "minecraftVersion": lock["minecraftVersion"],
              "modpackLockSha256": sha256(lock_file.read_bytes()).hexdigest(), "clientJarSha256": sha256(client_bytes).hexdigest(),
              "sources": assets.sources, "registryHashes": registry_hashes, "assets": assets.index,
              "counts": {"files": len(assets.data), "blocks": len(blocks), "states": sum(b["stateCount"] for b in blocks), **counts},
              "blockCoverage": coverage, "ambiguousOverrides": assets.conflicts, "auditedBasePriorities": resolved_priorities,
              "nativeRenderClasses": assets.render_classes, "assetIntegrityVerified": True,
              "resourcePriorityVerified": not assets.conflicts, "nativeStatePropertiesExported": native_states.exists(),
              "platformAssetsProvided": bool(platform_jars), "variantContentPath": "asset-variants/{sha256}.bin",
              "exporterSha256": sha256(Path(__file__).read_bytes()).hexdigest(),
              "renderParityVerified": False, "complete": False,
              "policy": {"vanillaSubstitution": False, "proxyStateIds": False, "textureModification": False,
                         "unsupported": "explicit-error", "acceptance": "matched modded Java client scene comparison required"}}
    (stage / "native-assets.json").write_text(json.dumps(report, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    stage.rename(output)
    return {"output": str(output), "counts": report["counts"], "ambiguousOverrides": len(assets.conflicts),
            "assetIntegrityVerified": True, "renderParityVerified": False, "complete": False}


def verify_export(output: Path, require_render_parity=False):
    root = output.resolve(strict=True)
    report = json.loads((root / "native-assets.json").read_text(encoding="utf-8"))
    if report["mode"] != "native-original" or any(report["policy"][name] is not False for name in
            ("vanillaSubstitution", "proxyStateIds", "textureModification")):
        raise ValueError("Approximate rendering inputs are forbidden")
    checked = set()
    def verify(relative, digest, size=None):
        key = (relative, digest)
        if key in checked:
            return
        target = (root / relative).resolve(strict=True)
        if root not in target.parents:
            raise ValueError("Asset verification path escapes export")
        content = target.read_bytes()
        if sha256(content).hexdigest() != digest or (size is not None and len(content) != size):
            raise ValueError("Asset source bytes differ: " + relative)
        checked.add(key)
    for name, entry in report["assets"].items():
        verify(name, entry["sha256"], entry["bytes"])
        for variant in entry.get("variants", []):
            verify("asset-variants/" + variant["sha256"] + ".bin", variant["sha256"], variant["bytes"])
    for name, digest in report["registryHashes"].items():
        verify("registry/" + name, digest)
    if len(report["assets"]) != report["counts"]["files"]:
        raise ValueError("Asset count differs")
    if require_render_parity and not all(report.get(field) is True for field in
            ("assetIntegrityVerified", "resourcePriorityVerified", "nativeStatePropertiesExported", "platformAssetsProvided", "renderParityVerified", "complete")):
        raise ValueError("NATIVE_RENDER_PARITY_UNVERIFIED: source export alone cannot authorize a complete native game view")
    return {"assetIntegrityVerified": True, "filesVerified": len(checked), "renderParityVerified": report["renderParityVerified"],
            "complete": report["complete"], "resourcePriorityVerified": report["resourcePriorityVerified"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client-jar", type=Path)
    parser.add_argument("--modpack-lock", type=Path)
    parser.add_argument("--mods-dir", type=Path)
    parser.add_argument("--registry-dir", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--resource-pack", type=Path, action="append", default=[], help="Explicit resource-pack priority, lowest first")
    parser.add_argument("--platform-jar", type=Path, action="append", default=[], help="Exact client platform JAR, e.g. NeoForge universal")
    parser.add_argument("--minecraft-version-json", type=Path, help="Official version metadata matching the client JAR")
    parser.add_argument("--asset-index", type=Path, help="Original Mojang asset index matching the version metadata")
    parser.add_argument("--asset-objects-dir", type=Path, help="Original language objects, named by SHA1")
    parser.add_argument("--verify", type=Path, help="Verify an existing byte-exact source export")
    parser.add_argument("--require-render-parity", action="store_true", help="Refuse sources without an accepted complete native rendering implementation")
    args = parser.parse_args()
    if args.verify:
        result = verify_export(args.verify, args.require_render_parity)
    else:
        if args.require_render_parity:
            parser.error("Use --require-render-parity with --verify; export never asserts rendering completion")
        if not all((args.client_jar, args.modpack_lock, args.mods_dir, args.registry_dir, args.output)):
            parser.error("Export requires client JAR, modpack lock, mods directory, registry directory and output")
        language_args = (args.minecraft_version_json, args.asset_index, args.asset_objects_dir)
        if any(language_args) and not all(language_args):
            parser.error("Language export requires version metadata, asset index and object directory")
        languages = dict(version_path=args.minecraft_version_json, index_path=args.asset_index, objects_dir=args.asset_objects_dir) if all(language_args) else None
        result = export(args.client_jar, args.modpack_lock, args.mods_dir, args.registry_dir, args.output, args.resource_pack, args.platform_jar, languages)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
