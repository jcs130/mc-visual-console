import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { verifyViewerContentAssets } from '../viewer-content-assets.mjs';

const hash = data => createHash('sha256').update(data).digest('hex');
// Deliberately synthetic bytes for the integrity gate, never a rendered asset.
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'viewer-content-integrity-'));
  const atlas = Buffer.from('test atlas bytes'), texture = Buffer.from('test texture bytes');
  await mkdir(path.join(root, 'public/textures/1.20.6/block'), { recursive: true });
  await writeFile(path.join(root, 'public/particle-content.png'), atlas);
  await writeFile(path.join(root, 'public/textures/1.20.6/block/birch_planks.png'), texture);
  const content = { schemaVersion: 1, minecraftVersion: '1.20.6', clientJarSha256: 'a'.repeat(64),
    mapColors: Array(62).fill(0), shades: [180,220,255,135], particleAtlasSha256: hash(atlas),
    textureHashes: { 'block/birch_planks': hash(texture) },
    particleDefinitions: { dust: ['minecraft:generic_0'] },
    particleSprites: { 'minecraft:generic_0': { uv: [0,0,1,1] } },
    frameModels: { item_frame: { elements: [] }, glow_item_frame: { elements: [] } } };
  const save = () => writeFile(path.join(root, 'public/viewer-content.json'), JSON.stringify(content));
  await save();
  return { root, content, save };
}

test('content packs bind client identity and bytes without claiming complete rendering parity', async () => {
  const { root, content } = await fixture();
  const result = await verifyViewerContentAssets(root, content.clientJarSha256, { required: true });
  assert.equal(result.capabilities.mapPixels, true);
  assert.equal(result.capabilities.mapDecorations, false);
  assert.equal(result.nativeParticlePhysicsParityVerified, false);
  assert.equal(result.javaFramePixelParityVerified, false);
  await assert.rejects(verifyViewerContentAssets(root, 'b'.repeat(64)), /mismatch/);
  await writeFile(path.join(root, 'public/particle-content.png'), 'changed after export');
  await assert.rejects(verifyViewerContentAssets(root, content.clientJarSha256), /atlas_hash_mismatch/);
});

test('missing optional packs remain absent; required packs and unsafe texture paths fail closed', async () => {
  const empty = await mkdtemp(path.join(tmpdir(), 'viewer-content-absent-'));
  assert.equal(await verifyViewerContentAssets(empty, 'a'.repeat(64)), null);
  await assert.rejects(verifyViewerContentAssets(empty, 'a'.repeat(64), { required: true }), /ENOENT/);
  const { root, content, save } = await fixture();
  content.textureHashes['../outside'] = 'a'.repeat(64); await save();
  await assert.rejects(verifyViewerContentAssets(root, content.clientJarSha256), /texture_path_invalid/);
});
