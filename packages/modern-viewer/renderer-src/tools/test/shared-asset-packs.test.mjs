import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { listAssetPackIds, loadAssetPack, verifyAssetPack, prepareAssetPack, prepareSoundAssetPack } from '../../../../../tools/prepare-viewer-assets.mjs';
import { verifyViewerContentAssets } from '../viewer-content-assets.mjs';

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'viewer-asset-pack-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const assetRoot = path.join(directory, 'packs'), pack = path.join(assetRoot, 'java-1.20.6');
  const bytes = Buffer.from('original-resource\n');
  await fs.mkdir(path.join(pack, 'public'), { recursive: true });
  await fs.writeFile(path.join(pack, 'public/resource.bin'), bytes);
  const manifest = { schemaVersion: 1, id: 'java-1.20.6', kind: 'java', minecraftVersion: '1.20.6',
    fileCount: 1, bytes: bytes.length, files: { 'public/resource.bin': {
      bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } } };
  const save = () => fs.writeFile(path.join(pack, 'pack.json'), JSON.stringify(manifest));
  await save();
  return { directory, assetRoot, pack, bytes, manifest, save, outputDirectory: path.join(directory, 'output') };
}

test('pack discovery excludes provenance-only catalogs and includes corrupt manifests for validation', async t => {
  const f = await fixture(t);
  const catalog = path.join(f.assetRoot, 'bedrock-1.21.1');
  await fs.mkdir(catalog);
  await fs.writeFile(path.join(catalog, 'model-catalog.json'), '{}');
  await fs.writeFile(path.join(catalog, 'build-contract.json'), '{}');
  const broken = path.join(f.assetRoot, 'broken-pack');
  await fs.mkdir(broken);
  await fs.writeFile(path.join(broken, 'pack.json'), '{}');
  assert.deepEqual(await listAssetPackIds(f.assetRoot), ['broken-pack', f.manifest.id]);
  await assert.rejects(loadAssetPack('broken-pack', f.assetRoot), /MANIFEST_INVALID/);
  await assert.rejects(loadAssetPack('bedrock-1.21.1', f.assetRoot), { code: 'ENOENT' });
  await fs.unlink(path.join(broken, 'pack.json'));
  await fs.mkdir(path.join(broken, 'pack.json'));
  await assert.rejects(listAssetPackIds(f.assetRoot), /MANIFEST_INVALID/);
});

test('all discovered committed packs have valid manifests', async () => {
  const ids = await listAssetPackIds();
  assert.ok(ids.length > 0);
  for (const id of ids) assert.equal((await loadAssetPack(id)).manifest.id, id);
});

test('shared pack copies the verified bytes and records version and source receipt', async t => {
  const f = await fixture(t);
  const receipt = await prepareAssetPack({ ...f, id: 'java-1.20.6', sounds: false, buildJava: false });
  assert.deepEqual(await fs.readFile(path.join(f.outputDirectory, 'public/resource.bin')), f.bytes);
  assert.equal(receipt.minecraftVersion, '1.20.6');
  assert.equal(JSON.parse(await fs.readFile(path.join(f.outputDirectory, 'viewer-assets.json'))).packs[0].fileCount, 1);
});

test('native packs can select version-matched original audio without Java proxy building', async t => {
  const f=await fixture(t);f.manifest.kind='native';await f.save();
  const audio=path.join(f.assetRoot,'java-1.20.6-sounds');await fs.mkdir(audio)
  const bytes=Buffer.from('offline audio pack fixture');await fs.writeFile(path.join(audio,'sound-fixture.bin'),bytes)
  await fs.writeFile(path.join(audio,'pack.json'),JSON.stringify({schemaVersion:1,id:'java-1.20.6-sounds',kind:'sounds',minecraftVersion:'1.20.6',
    fileCount:1,bytes:bytes.length,files:{'sound-fixture.bin':{bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}}}))
  const receipt=await prepareAssetPack({...f,id:f.manifest.id,sounds:true,buildJava:false})
  assert.deepEqual(receipt.packs.map(p=>p.id),['java-1.20.6','java-1.20.6-sounds'])
  assert.deepEqual(await fs.readFile(path.join(f.outputDirectory,'sound-fixture.bin')),bytes)
})

test('missing or corrupt original resources fail before creating a deployment', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.pack, 'public/resource.bin'), 'different-resource');
  await assert.rejects(prepareAssetPack({ ...f, id: 'java-1.20.6', buildJava: false }), /HASH_MISMATCH/);
  await assert.rejects(fs.stat(f.outputDirectory), { code: 'ENOENT' });
  await fs.unlink(path.join(f.pack, 'public/resource.bin'));
  await assert.rejects(verifyAssetPack('java-1.20.6', f.assetRoot), { code: 'ENOENT' });
});

test('a pack cannot traverse its directory or overwrite another version or source tree', async t => {
  const f = await fixture(t);
  await assert.rejects(prepareAssetPack({ ...f, id: 'java-1.20.6', outputDirectory: f.pack, sounds: false, buildJava: false }), /OVERLAPS_SOURCE/);
  await fs.mkdir(path.join(f.outputDirectory, 'public'), { recursive: true });
  await fs.writeFile(path.join(f.outputDirectory, 'public/asset-source.json'), JSON.stringify({ minecraftVersion: '1.21.1' }));
  await assert.rejects(prepareAssetPack({ ...f, id: 'java-1.20.6', sounds: false, buildJava: false }), /VERSION_MISMATCH/);
  f.manifest.files['../outside.bin'] = f.manifest.files['public/resource.bin'];
  delete f.manifest.files['public/resource.bin'];
  await f.save();
  await assert.rejects(verifyAssetPack('java-1.20.6', f.assetRoot), /PATH_INVALID/);
});

async function audioFixture(f) {
  const audio = path.join(f.assetRoot, 'java-1.20.6-sounds');
  const bytes = Buffer.from('audio fixture, not original game content');
  await fs.mkdir(path.join(audio, 'public/sounds/music'), { recursive: true });
  const catalog = Buffer.from(JSON.stringify({ minecraftVersion: '1.20.6', events: {} }));
  const files = { 'public/sounds/music/fixture.ogg': bytes, 'public/sounds/manifest.json': catalog };
  for (const [relative, data] of Object.entries(files)) await fs.writeFile(path.join(audio, relative), data);
  await fs.writeFile(path.join(audio, 'pack.json'), JSON.stringify({ schemaVersion: 1, id: 'java-1.20.6-sounds', kind: 'sounds',
    minecraftVersion: '1.20.6', fileCount: 2, bytes: bytes.length + catalog.length,
    files: Object.fromEntries(Object.entries(files).map(([relative, data]) => [relative, {
      bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') }])) }));
  return { audio, bytes };
}

test('ordinary preparation includes the full matched audio pack by default', async t => {
  const f = await fixture(t), audio = await audioFixture(f);
  const receipt = await prepareAssetPack({ ...f, id: 'java-1.20.6', buildJava: false });
  assert.deepEqual(receipt.packs.map(p => p.id), ['java-1.20.6', 'java-1.20.6-sounds']);
  assert.deepEqual(await fs.readFile(path.join(f.outputDirectory, 'public/sounds/music/fixture.ogg')), audio.bytes);
});

test('default audio omissions and corrupt audio fail before any visual deployment', async t => {
  const f = await fixture(t);
  await assert.rejects(prepareAssetPack({ ...f, id: 'java-1.20.6', buildJava: false }), { code: 'ENOENT' });
  await assert.rejects(fs.stat(f.outputDirectory), { code: 'ENOENT' });
  const audio = await audioFixture(f);
  await fs.writeFile(path.join(audio.audio, 'public/sounds/music/fixture.ogg'), 'corrupt');
  await assert.rejects(prepareAssetPack({ ...f, id: 'java-1.20.6', buildJava: false }), /HASH_MISMATCH/);
  await assert.rejects(fs.stat(f.outputDirectory), { code: 'ENOENT' });
});

test('direct builds can restore matched audio, preserve private music and reject a different version', async t => {
  const f = await fixture(t), audio = await audioFixture(f);
  await fs.mkdir(path.join(f.outputDirectory, 'public/sounds/custom'), { recursive: true });
  await fs.writeFile(path.join(f.outputDirectory, 'public/sounds/custom/private.ogg'), 'private');
  const receipt = await prepareSoundAssetPack({ ...f, minecraftVersion: '1.20.6' });
  assert.equal(receipt.fileCount, 2);
  assert.deepEqual(await fs.readFile(path.join(f.outputDirectory, 'public/sounds/music/fixture.ogg')), audio.bytes);
  assert.equal(await fs.readFile(path.join(f.outputDirectory, 'public/sounds/custom/private.ogg'), 'utf8'), 'private');
  await fs.writeFile(path.join(f.outputDirectory, 'public/asset-source.json'), JSON.stringify({ minecraftVersion: '1.21.1' }));
  await assert.rejects(prepareSoundAssetPack({ ...f, minecraftVersion: '1.20.6' }), /VERSION_MISMATCH/);
});

test('the committed Java pack contains baked states and every original icon, texture and render input', async () => {
  const { directory, manifest } = await verifyAssetPack('java-1.20.6');
  for (const relative of ['public/blocksStates/1.20.6.json', 'public/textures/1.20.6.png',
    'public/minecraft-assets/painting/kebab.png', 'render-assets/painting-records.json',
    'public/viewer-content.json', 'public/particle-content.png']) {
    assert.ok(manifest.files[relative], 'Missing clean-build input: ' + relative);
  }
  const source = JSON.parse(await fs.readFile(path.join(directory, 'public/asset-source.json'), 'utf8'));
  for (const [prefix, hashes] of [['public/icons/', source.iconHashes], ['public/textures/1.20.6/', source.textureHashes], ['render-assets/', source.renderAssetHashes]]) {
    for (const [relative, expected] of Object.entries(hashes)) assert.equal(manifest.files[prefix + relative]?.sha256, expected, 'Missing or changed source resource: ' + relative);
  }
  const content = await verifyViewerContentAssets(directory, source.clientJarSha256, { required: true });
  assert.equal(content.manifestSha256, manifest.source.viewerContent.manifestSha256);
  assert.equal(content.particleAtlasSha256, manifest.source.viewerContent.particleAtlasSha256);
  assert.equal(content.capabilities.itemFrameMaps, true);
  assert.equal(content.capabilities.serverParticleProtocol, true);
  assert.equal(content.nativeParticlePhysicsParityVerified, false);
});
