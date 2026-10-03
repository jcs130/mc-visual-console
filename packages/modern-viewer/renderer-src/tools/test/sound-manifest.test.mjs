import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { expandMinecraftSounds } from '../minecraft-viewer-sound-manifest.mjs';

const hash = 'a'.repeat(40);
const entries = names => Object.fromEntries(names.map(name => [`minecraft/sounds/${name}.ogg`, { hash }]));
test('all variants and weighted event references retain file modifiers and streaming', () => {
  const source = {
    base: { sounds: ['one', 'two', 'three', { name: 'four', volume: 0.4, pitch: 2.4, weight: 7, stream: true, attenuation_distance: 32 }], subtitle: 'example.subtitle' },
    nested: { sounds: [{ name: 'minecraft:base', type: 'event', volume: 0.5, pitch: 0.5, weight: 2 }] },
    silent: { sounds: [] },
  };
  const result = expandMinecraftSounds(source, entries(['one', 'two', 'three', 'four']));
  assert.equal(result.events.base.length, 4);
  assert.equal(result.events.nested.length, 4);
  assert.deepEqual(result.events.nested[3], {
    file: 'four.ogg', volume: 0.2, pitch: 1.2, weight: 14, stream: true, preload: false, attenuationDistance: 32,
  });
  assert.equal(Object.keys(result.files).length, 4);
  assert.deepEqual(result.events.silent, []);
  assert.equal(result.eventMetadata.base.subtitle, 'example.subtitle');
});
test('invalid, missing and cyclic references fail instead of silently exporting an incomplete set', () => {
  assert.throws(() => expandMinecraftSounds({ a: { sounds: [{ name: 'b', type: 'event' }] } }, {}), /Unknown sound event/);
  assert.throws(() => expandMinecraftSounds({ a: { sounds: [{ name: 'a', type: 'event' }] } }, {}), /Cyclic/);
  assert.throws(() => expandMinecraftSounds({ a: { sounds: ['../outside'] } }, {}), /Invalid sound path/);
  assert.throws(() => expandMinecraftSounds({ a: { sounds: ['missing'] } }, {}), /resource missing/);
  assert.throws(() => expandMinecraftSounds({ a: { sounds: [{ name: 'one', weight: 0 }] } }, entries(['one'])), /weight/);
});

test('offline exporter validates the version index and every referenced audio hash', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mc-viewer-sounds-'));
  const assets = path.join(root, 'assets');
  const output = path.join(root, 'out');
  const sha1 = value => createHash('sha1').update(value).digest('hex');
  const object = async bytes => {
    const digest = sha1(bytes);
    const target = path.join(assets, 'objects', digest.slice(0, 2), digest);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
    return { hash: digest, target };
  };
  const audio = await object(Buffer.from('test audio fixture, not a distributed Minecraft sound'));
  const source = await object(Buffer.from(JSON.stringify({ 'music.game': { sounds: [{ name: 'music/test', stream: true }] },
    'music.creative': { sounds: [{ name: 'music.game', type: 'event' }] } })));
  const index = Buffer.from(JSON.stringify({ objects: { 'minecraft/sounds.json': { hash: source.hash },
    'minecraft/sounds/music/test.ogg': { hash: audio.hash } } }));
  await mkdir(path.join(assets, 'indexes'), { recursive: true });
  await writeFile(path.join(assets, 'indexes', 'fixture.json'), index);
  const versionPath = path.join(root, 'version.json');
  await writeFile(versionPath, JSON.stringify({ id: '1.20.6', assetIndex: { id: 'fixture', sha1: sha1(index) } }));
  const cli = new URL('../export-minecraft-viewer-sounds.mjs', import.meta.url);
  const run = () => spawnSync(process.execPath, [fileURLToPath(cli), versionPath, assets, output], { encoding: 'utf8' });
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  const manifest = JSON.parse(await readFile(path.join(output, 'public/sounds/manifest.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.assetIndexSha1, sha1(index));
  assert.equal(manifest.events['music.creative'][0].stream, true);
  assert.equal(sha1(await readFile(path.join(output, 'public/sounds/music/test.ogg'))), audio.hash);
  await writeFile(audio.target, 'corrupted');
  const corrupted = run();
  assert.notEqual(corrupted.status, 0);
  assert.match(corrupted.stderr, /音效内容校验失败/);
  await writeFile(path.join(assets, 'indexes', 'fixture.json'), 'corrupted');
  assert.match(run().stderr, /资源索引与 1.20.6/);
});
