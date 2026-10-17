import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { PaperYsmPlayers, createPaperYsmActor, installPaperYsmRenderGuard } from '../../src/modern-viewer/paper-ysm.js';

const require = createRequire(import.meta.url);
const native = readFileSync(require.resolve('minecraft-renderer/dist/minecraft-renderer.js'), 'utf8');
const match = native.match(/for\(let (\w+) of (\w+)\.children\?\?\[\]\)\1\.name!=="nametag"&&\(\1\.visible=!(\w+)\);/);
assert.ok(match, 'pinned native body visibility contract changed');
const nativeVisibility = runInNewContext(`(function(${match[2]},${match[3]}){${match[0]}})`);

async function fixture() {
  const uuid = '00000000-0000-3000-8000-000000000001';
  const entity = { id: 3, uuid, equipment: [] };
  const rendered = new THREE.Group(), wrapper = new THREE.Group(), vanilla = new THREE.Group(), tag = new THREE.Group();
  wrapper.name = 'mesh'; tag.name = 'nametag'; wrapper.add(vanilla, tag); rendered.add(wrapper);
  const encode = value => ({ base64: Buffer.from(JSON.stringify(value)).toString('base64') });
  const bundle = { schemaVersion: 1, format: 'ysm-bedrock-original', modelId: 'visibility-fixture', assetSha256: 'fixture',
    model: 'm', animation: 'a', textures: { main: 't' }, files: {
      'ysm.json': encode({ spec: 2, properties: { free: true } }),
      m: encode({ format_version: '1.12.0', 'minecraft:geometry': [{ description: { texture_width: 16, texture_height: 16 },
        bones: [{ name: 'Head', pivot: [0, 24, 0], cubes: [{ origin: [-4, 20, -4], size: [8, 8, 8], uv: [0, 0] }] }] }] }),
      a: encode({ format_version: '1.8.0', animations: { idle: { loop: true, bones: {} } } }), t: { base64: '' },
    } };
  const players = new PaperYsmPlayers({ entity: () => entity, rendered: () => rendered,
    createActor: (bundle, texture, opts) => createPaperYsmActor(bundle, texture, { ...opts, loadTexture: async () => new THREE.Texture() }) });
  players.asset(bundle);
  players.state({ schemaVersion: 1, source: 'freesia_worker', playerUuid: uuid, entityId: 3, epoch: 1,
    modelId: bundle.modelId, assetSha256: bundle.assetSha256, texture: 'main', available: true, renderAvailable: true });
  players.tick(0); await new Promise(resolve => setImmediate(resolve)); players.tick(1);
  assert.equal(players.stats().rendered, 1);
  const render = function () { nativeVisibility(wrapper, false); return 17; };
  const world = { entities: { render } };
  return { players, world, render, entity, rendered, vanilla, tag };
}

test('native updates after the animation tick reveal the old body; the render guard suppresses it before drawing', async () => {
  const f = await fixture();
  let guard;
  try {
    assert.equal(f.vanilla.visible, false);
    f.world.entities.render();
    assert.equal(f.vanilla.visible, true, 'reproduce the actual native visibility reset between animation and draw');
    guard = installPaperYsmRenderGuard(f.world, f.players);
    for (let i = 0; i < 120; i++) {
      assert.equal(f.world.entities.render(), 17);
      assert.equal(f.vanilla.visible, false, `draw ${i}`);
      assert.equal(f.tag.visible, true);
      assert.equal(f.rendered.getObjectByName('paper-ysm-player').visible, true);
    }
    f.players.clear();
    f.world.entities.render();
    assert.equal(f.vanilla.visible, true, 'removing the custom model restores the native body');
  } finally { guard?.dispose(); f.players.clear(); }
  assert.equal(f.world.entities.render, f.render);
});

test('a reused entity ID cannot suppress a different player body', async () => {
  const f = await fixture(), guard = installPaperYsmRenderGuard(f.world, f.players);
  try {
    f.entity.uuid = '00000000-0000-3000-8000-000000000002';
    f.world.entities.render();
    assert.equal(f.vanilla.visible, true);
  } finally { guard.dispose(); f.players.clear(); }
});
