"""Export original TLM 1.5.3 Bedrock resources; never installs or changes entities."""
import argparse, base64, hashlib, json, re, zipfile
from pathlib import Path

JAR_SHA = 'f6db04195820c8508704277ea76d63723804ff236a7b780369ba59ebe5cd9c27'
PREFIX = 'assets/touhou_little_maid/tlm_custom_pack/touhou_little_maid-1.0.0/assets/'
RESOURCE = re.compile(r'^[a-z0-9_.-]+:[a-z0-9_./-]+$')
sha = lambda b: hashlib.sha256(b).hexdigest()

def resource_path(value):
    if not isinstance(value, str) or not RESOURCE.fullmatch(value) or '..' in value or '//' in value:
        raise ValueError('TLM_RESOURCE_PATH_INVALID')
    namespace, name = value.split(':')
    return PREFIX + namespace + '/' + name

def export(jar, output):
    raw = jar.read_bytes()
    if sha(raw) != JAR_SHA:
        raise ValueError('TLM_SOURCE_JAR_MISMATCH')
    output.mkdir(parents=True, exist_ok=False)
    assets = output / 'assets'; assets.mkdir()
    catalog = {'schemaVersion': 1, 'format': 'tlm-bedrock-catalog', 'jarSha256': JAR_SHA,
               'source': 'TouhouLittleMaid 1.5.3 NeoForge 1.21.1',
               'license': 'CC-BY-NC-SA-4.0', 'upstream': 'https://github.com/TartaricAcid/TouhouLittleMaid', 'models': {}}
    with zipfile.ZipFile(jar) as archive:
        names = set(archive.namelist())
        for pack_path in sorted(n for n in names if n.startswith(PREFIX) and n.endswith('/maid_model.json')):
            pack = json.loads(archive.read(pack_path))
            for definition in pack.get('model_list', []):
                model_id = definition['model_id']
                namespace, name = model_id.split(':')
                geometry = resource_path(definition.get('model', f'{namespace}:models/entity/{name}.json'))
                texture = definition.get('texture', f'{namespace}:textures/entity/{name}.png')
                variants = [(model_id, texture)] + [(model_id + '_' + hashlib.md5(t.encode()).hexdigest(), t) for t in definition.get('extra_textures', [])]
                for selected_id, selected_texture in variants:
                    texture_path = resource_path(selected_texture)
                    if selected_id in catalog['models']:
                        raise ValueError('TLM_DUPLICATE_MODEL')
                    entry = {'modelId': selected_id, 'definitionId': model_id}
                    if geometry not in names or texture_path not in names:
                        catalog['models'][selected_id] = {**entry, 'available': False, 'reason': 'TLM_ORIGINAL_RESOURCE_MISSING'}
                        continue
                    model = json.loads(archive.read(geometry))
                    if model.get('format_version') not in ['1.10.0', '1.12.0']:
                        catalog['models'][selected_id] = {**entry, 'available': False, 'reason': 'TLM_GEOMETRY_FORMAT_UNSUPPORTED'}
                        continue
                    files = {}
                    for original in [pack_path, geometry, texture_path]:
                        data = archive.read(original)
                        files[original] = {'sha256': sha(data), 'bytes': len(data), 'base64': base64.b64encode(data).decode()}
                    bundle = {'schemaVersion': 1, 'format': 'tlm-bedrock-original', 'jarSha256': JAR_SHA,
                              **entry, 'pack': pack_path, 'model': geometry, 'texture': texture_path,
                              'files': files, 'license': catalog['license'], 'upstream': catalog['upstream']}
                    data = json.dumps(bundle, ensure_ascii=False, separators=(',', ':')).encode()
                    if len(data) > 4 * 1024 * 1024:
                        raise ValueError('TLM_BUNDLE_LIMIT')
                    digest = sha(data)
                    (assets / (digest + '.json')).write_bytes(data)
                    catalog['models'][selected_id] = {**entry, 'available': True, 'bundleSha256': digest, 'bytes': len(data)}
    (output / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return {'models': len(catalog['models']), 'available': sum(r['available'] for r in catalog['models'].values()),
            'catalogSha256': sha((output / 'catalog.json').read_bytes()), 'installed': False}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--jar', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(export(args.jar, args.output)))
