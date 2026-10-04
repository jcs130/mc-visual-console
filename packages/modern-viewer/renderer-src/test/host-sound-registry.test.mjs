import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadViewerSoundRegistry, validateViewerSoundRegistry, VIEWER_SOUND_REGISTRY_LAYOUTS } from '../host/viewer-sound-registry.mjs';
import { viewerSoundPacket } from '../host/viewer-sound-packets.mjs';

const metadata = () => ({ schemaVersion: 1, minecraftVersion: '1.20.6',
  clientJarSha256: VIEWER_SOUND_REGISTRY_LAYOUTS['1.20.6'].clientJarSha256,
  events: Object.fromEntries(Array.from({ length: 1607 }, (_, id) => [id, { name: `minecraft:test.sound_${id}` }])) });
const packet = sound => ({ sound, soundCategory: 'neutral', x: 0, y: 512, z: 0, volume: 1, pitch: 1 });

test('native IDs keep the decoded zero-based Holder index and replace stale Minecraft-data names', () => {
  const value = metadata();
  value.events[325].name = 'minecraft:entity.cod.ambient';
  value.events[515].name = 'minecraft:entity.fish.swim';
  value.events[1450].name = 'minecraft:entity.villager.ambient';
  const registry = validateViewerSoundRegistry(value, '1.20.6');
  for (const [id, name] of [[325, 'entity.cod.ambient'], [515, 'entity.fish.swim'], [1450, 'entity.villager.ambient']]) {
    assert.equal(viewerSoundPacket('sound_effect', packet({ soundId: id }), registry, () => null)?.name, name);
  }
  assert.equal(viewerSoundPacket('sound_effect', packet({ soundId: 0 }), registry, () => null)?.name, 'test.sound_0');
  assert.equal(viewerSoundPacket('sound_effect', packet({ soundId: 1606 }), registry, () => null)?.name, 'test.sound_1606');
  assert.equal(viewerSoundPacket('sound_effect', packet({ soundId: 1607 }), registry, () => null), null);
});

test('exact registry rejects wrong versions, hashes, half tables, gaps and unsafe/duplicate names', () => {
  assert.throws(() => validateViewerSoundRegistry({ ...metadata(), schemaVersion: 2 }, '1.20.6'), /schema/);
  assert.throws(() => validateViewerSoundRegistry({ ...metadata(), minecraftVersion: '1.20.4' }, '1.20.6'), /version/);
  assert.throws(() => validateViewerSoundRegistry({ ...metadata(), clientJarSha256: 'a'.repeat(64) }, '1.20.6'), /hash/);
  const partial = metadata(); delete partial.events[515];
  assert.throws(() => validateViewerSoundRegistry(partial, '1.20.6'), /Incomplete/);
  const gap = metadata(); gap.events[1607] = gap.events[0]; delete gap.events[0];
  assert.throws(() => validateViewerSoundRegistry(gap, '1.20.6'), /continuous/);
  for (const name of ['minecraft:../outside', 'minecraft:ENTITY.COD', 'other:entity.cod.ambient', 'minecraft:', '']) {
    const wrong = metadata(); wrong.events[325].name = name;
    assert.throws(() => validateViewerSoundRegistry(wrong, '1.20.6'), /name/);
  }
  const duplicate = metadata(); duplicate.events[325].name = duplicate.events[515].name;
  assert.throws(() => validateViewerSoundRegistry(duplicate, '1.20.6'), /duplicate/);
  assert.throws(() => validateViewerSoundRegistry(metadata(), '1.21.1'), /Unsupported/);
});

test('unavailable exact metadata disables only numeric audio and reports a concrete diagnostic', async () => {
  const old = { sounds: { 325: { name: 'block.copper_grate.step' } } };
  const missing = await loadViewerSoundRegistry('', '1.20.6', old);
  assert.equal(missing.source, 'unavailable');
  assert.match(missing.diagnostic, /numeric audio disabled: Missing/);
  assert.equal(viewerSoundPacket('sound_effect', packet({ soundId: 325 }), missing.registry, () => null), null);
  assert.equal(viewerSoundPacket('sound_effect', packet({ data: { soundName: 'minecraft:entity.cod.ambient' } }),
    missing.registry, () => null)?.name, 'entity.cod.ambient');
  assert.equal(viewerSoundPacket('named_sound_effect', { ...packet(undefined), soundName: 'entity.cod.ambient' },
    missing.registry, () => null)?.name, 'entity.cod.ambient');
  const legacy = await loadViewerSoundRegistry('', '1.20.4', old);
  assert.equal(legacy.source, 'minecraft-data'); assert.equal(legacy.registry, old);
});

test('host reads complete exported metadata and fails closed on invalid or missing 1.20.6 files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mc-viewer-sound-registry-'));
  try {
    const target = path.join(root, 'public', 'sounds', 'registry.json');
    const absent = await loadViewerSoundRegistry(root, '1.20.6', { sounds: { 0: { name: 'wrong' } } });
    assert.equal(absent.source, 'unavailable'); assert.match(absent.diagnostic, /Missing/);
    await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, JSON.stringify(metadata()));
    const present = await loadViewerSoundRegistry(root, '1.20.6');
    assert.equal(present.source, 'exact-assets'); assert.equal(present.diagnostic, null);
    assert.equal(Object.keys(present.registry.sounds).length, 1607);
    await writeFile(target, 'broken');
    assert.match((await loadViewerSoundRegistry(root, '1.20.6')).diagnostic, /Invalid sound registry JSON/);
    await writeFile(target, JSON.stringify({ ...metadata(), clientJarSha256: '0'.repeat(64) }));
    assert.match((await loadViewerSoundRegistry(root, '1.20.6')).diagnostic, /hash mismatch/);
  } finally {
    assert.equal(path.dirname(root), tmpdir());
    assert.ok(path.basename(root).startsWith('mc-viewer-sound-registry-'));
    await rm(root, { recursive: true, force: true });
  }
});
