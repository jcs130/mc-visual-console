import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { verifyAssetPack, prepareAssetPack } from '../../../../../tools/prepare-viewer-assets.mjs';
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

test('shared pack copies the verified bytes and records version and source receipt', async t => {
  const f = await fixture(t);
  const receipt = await prepareAssetPack({ ...f, id: 'java-1.20.6', buildJava: false });
  assert.deepEqual(await fs.readFile(path.join(f.outputDirectory, 'public/resource.bin')), f.bytes);
  assert.equal(receipt.minecraftVersion, '1.20.6');
  assert.equal(JSON.parse(await fs.readFile(path.join(f.outputDirectory, 'viewer-assets.json'))).packs[0].fileCount, 1);
});

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
  await assert.rejects(prepareAssetPack({ ...f, id: 'java-1.20.6', outputDirectory: f.pack, buildJava: false }), /OVERLAPS_SOURCE/);
  await fs.mkdir(path.join(f.outputDirectory, 'public'), { recursive: true });
  await fs.writeFile(path.join(f.outputDirectory, 'public/asset-source.json'), JSON.stringify({ minecraftVersion: '1.21.1' }));
  await assert.rejects(prepareAssetPack({ ...f, id: 'java-1.20.6', buildJava: false }), /VERSION_MISMATCH/);
  f.manifest.files['../outside.bin'] = f.manifest.files['public/resource.bin'];
  delete f.manifest.files['public/resource.bin'];
  await f.save();
  await assert.rejects(verifyAssetPack('java-1.20.6', f.assetRoot), /PATH_INVALID/);
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
