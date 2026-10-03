"""Native-source integrity and unsupported-renderer regression checks."""
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from native_viewer_assets import AssetArchive, ModelAudit, export, read_blocks, resource_path, verify_export


def archive(files):
    out = BytesIO()
    with zipfile.ZipFile(out, 'w') as jar:
        for name, value in files.items():
            jar.writestr(name, json.dumps(value) if isinstance(value, dict) else value)
    return out.getvalue()


class NativeAssetsTest(unittest.TestCase):
    def test_namespace_and_original_bytes_are_preserved(self):
        assets = AssetArchive()
        pixels = bytes(range(256))
        assets.add(archive({'assets/minecraft/textures/block/stone.png': pixels,
                            'assets/create/textures/block/stone.png': pixels[::-1],
                            'assets/create/textures/block/stone.png.mcmeta': {'animation': {'frametime': 3}},
                            'assets/minecraft/gpu_warnlist.json': {}}), 'client.jar')
        self.assertEqual(assets.data['assets/create/textures/block/stone.png'], pixels[::-1])
        self.assertEqual(assets.data['assets/minecraft/textures/block/stone.png'], pixels)
        self.assertEqual(assets.index['assets/create/textures/block/stone.png']['sha256'], sha256(pixels[::-1]).hexdigest())
        self.assertIn('assets/create/textures/block/stone.png.mcmeta', assets.data)
        with self.assertRaises(ValueError):
            resource_path('create:../stone', 'models', '.json')

    def test_archive_path_traversal_and_duplicate_assets_are_rejected(self):
        for path in ['assets/create/../../outside', 'assets/create/./outside']:
            with self.assertRaises(ValueError):
                AssetArchive().add(archive({path: b'no'}), 'bad.jar')
        # Windows ZipInfo normalizes backslashes when creating an archive.
        # Patch both filename headers to exercise a received raw ZIP instead.
        raw = archive({'assets/create/outside': b'no'}).replace(b'assets/create/outside', b'assets/create\\outside')
        with self.assertRaises(ValueError):
            AssetArchive().add(raw, 'bad.jar')
        out = BytesIO()
        with zipfile.ZipFile(out, 'w') as jar:
            jar.writestr('assets/a/file.png', b'a')
            jar.writestr('assets/a/file.png', b'b')
        with self.assertRaises(ValueError):
            AssetArchive().add(out.getvalue(), 'duplicate.jar')

    def test_texture_override_uses_child_namespace_without_replacing_geometry(self):
        assets = AssetArchive()
        faces = {'north': {'texture': '#surface', 'uv': [2, 3, 8, 9], 'rotation': 90}}
        geometry = [{'from': [3, 2, 1], 'to': [12, 14, 15], 'faces': faces,
                     'rotation': {'angle': 22.5, 'axis': 'y', 'origin': [8, 8, 8]}}]
        assets.add(archive({
            'assets/minecraft/models/block/base.json': {'elements': geometry, 'textures': {'surface': 'minecraft:block/stone'}},
            'assets/create/models/block/custom.json': {'parent': 'minecraft:block/base', 'textures': {'surface': '#native', 'native': 'create:block/metal'}},
            'assets/create/blockstates/custom.json': {'variants': {'axis=x': {'model': 'create:block/custom', 'y': 90, 'uvlock': True}}},
            'assets/create/textures/block/metal.png': b'original-pixels',
        }), 'pack.jar')
        audit = ModelAudit(assets)
        self.assertEqual(audit.model('create:block/custom')['elements'], geometry)
        result = audit.block('create:custom')
        self.assertEqual(result['textures'], ['create:block/metal'])
        self.assertEqual(result['status'], 'json_model_sources_verified')

    def test_native_loader_and_builtin_renderer_never_become_plain_json_success(self):
        assets = AssetArchive()
        assets.add(archive({
            'assets/a/models/block/base.json': {'loader': 'a:special', 'elements': []},
            'assets/a/models/block/child.json': {'parent': 'a:block/base'},
            'assets/a/blockstates/custom.json': {'variants': {'': {'model': 'a:block/child'}}},
            'assets/a/models/block/chest.json': {'parent': 'builtin/entity'},
            'assets/a/blockstates/chest.json': {'variants': {'': {'model': 'a:block/chest'}}},
        }), 'mod.jar')
        audit = ModelAudit(assets)
        self.assertIn('native_model_loader_required:a:special', audit.block('a:custom')['issues'])
        self.assertIn('native_item_renderer_required', audit.block('a:chest')['issues'])
        self.assertEqual(audit.block('a:chest')['status'], 'native_rendering_required')

    def test_cycles_and_missing_faces_are_explicit(self):
        assets = AssetArchive()
        assets.add(archive({
            'assets/a/models/block/one.json': {'parent': 'a:block/two'},
            'assets/a/models/block/two.json': {'parent': 'a:block/one'},
            'assets/a/blockstates/cycle.json': {'variants': {'': {'model': 'a:block/one'}}},
            'assets/a/models/block/missing.json': {'elements': [{'faces': {'up': {'texture': '#lost'}}}]},
            'assets/a/blockstates/missing.json': {'variants': {'': {'model': 'a:block/missing'}}},
        }), 'mod.jar')
        audit = ModelAudit(assets)
        self.assertTrue(any(i.startswith('model_parent_cycle:') for i in audit.block('a:cycle')['issues']))
        self.assertIn('unresolved_texture_variable', audit.block('a:missing')['issues'])
        self.assertEqual(audit.block('a:unknown')['status'], 'missing_blockstate')

    def test_ambiguous_mod_overrides_require_proven_order(self):
        assets = AssetArchive()
        path = 'assets/minecraft/textures/block/stone.png'
        assets.add(archive({path: b'base'}), 'client.jar')
        assets.add(archive({path: b'changed'}), 'a.jar')
        self.assertEqual(len(assets.conflicts), 1)
        # A explicitly selected resource pack takes priority. It does not erase
        # the recorded ambiguity between unverified mod resource priorities.
        assets.add(archive({path: b'pack'}), 'selected.zip', explicit_override=True)
        self.assertEqual(assets.data[path], b'pack')
        self.assertEqual(assets.index[path]['overriddenSources'], ['client.jar', 'a.jar'])
        self.assertEqual(len(assets.conflicts), 1)
        self.assertEqual(assets.variants[sha256(b'base').hexdigest()], b'base')
        self.assertEqual(assets.variants[sha256(b'changed').hexdigest()], b'changed')
        self.assertEqual(assets.variants[sha256(b'pack').hexdigest()], b'pack')
        self.assertEqual([v['source'] for v in assets.index[path]['variants']], ['client.jar', 'a.jar', 'selected.zip'])

    def test_embedded_neoforge_and_fabric_style_library_paths_are_preserved(self):
        inner = archive({'assets/library/models/block/test.json': {'elements': []}})
        outer = archive({'META-INF/jarjar/metadata.json': {'jars': [{'path': 'META-INF/jars/library.jar'}]},
                         'META-INF/jars/library.jar': inner,
                         'META-INF/LICENSE.txt': b'license'})
        assets = AssetArchive()
        assets.add(outer, 'mod.jar')
        self.assertIn('assets/library/models/block/test.json', assets.data)
        self.assertEqual(assets.index['assets/library/models/block/test.json']['source'], 'mod.jar!META-INF/jars/library.jar')

    def test_export_binds_real_state_ids_and_does_not_claim_render_parity(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            mods, registry = root / 'mods', root / 'registry'
            mods.mkdir()
            registry.mkdir()
            client = root / 'client.jar'
            client.write_bytes(archive({'version.json': {'id': '1.21.1'},
                                       'assets/minecraft/blockstates/stone.json': {'variants': {'': {'model': 'minecraft:block/stone'}}},
                                       'assets/minecraft/models/block/stone.json': {'elements': [{'faces': {'up': {'texture': '#all'}}}], 'textures': {'all': 'block/stone'}},
                                       'assets/minecraft/textures/block/stone.png': b'pixels'}))
            lock = root / 'lock.json'
            lock.write_text(json.dumps({'minecraftVersion': '1.21.1', 'artifacts': []}))
            (registry / 'blocks.tsv').write_text('minecraft:stone\t51\t93001\t1\n')
            (registry / 'block-states.jsonl').write_text(json.dumps({'stateId': 93001, 'name': 'minecraft:stone', 'renderShape': 'MODEL', 'hasBlockEntity': False, 'properties': {}}) + '\n')
            result = export(client, lock, mods, registry, root / 'output')
            report = json.loads((root / 'output' / 'native-assets.json').read_text())
            self.assertTrue(result['assetIntegrityVerified'])
            self.assertFalse(result['renderParityVerified'])
            self.assertFalse(result['complete'])
            self.assertEqual(report['blockCoverage'][0]['stateBase'], 93001)
            self.assertFalse(report['policy']['vanillaSubstitution'])
            self.assertTrue(report['nativeStatePropertiesExported'])
            self.assertTrue(verify_export(root / 'output')['assetIntegrityVerified'])
            with self.assertRaisesRegex(ValueError, 'NATIVE_RENDER_PARITY_UNVERIFIED'):
                verify_export(root / 'output', require_render_parity=True)
            (root / 'output' / 'assets/minecraft/textures/block/stone.png').write_bytes(b'fake-vanilla-proxy')
            with self.assertRaisesRegex(ValueError, 'Asset source bytes differ'):
                verify_export(root / 'output')
            (mods / 'unlocked.jar').write_bytes(b'unexpected')
            with self.assertRaises(ValueError):
                export(client, lock, mods, registry, root / 'other-output')
            self.assertFalse((root / 'other-output').exists())
            (registry / 'blocks.tsv').write_text('minecraft:stone\t1\t8\t2\nminecraft:dirt\t2\t9\t1\n')
            with self.assertRaises(ValueError):
                read_blocks(registry / 'blocks.tsv')


if __name__ == '__main__':
    unittest.main()
