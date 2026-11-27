import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { createBatRig, poseBat } from '../../src/modern-viewer/bat-motion.js';
import { nearbyTorches, torchTip } from '../../src/modern-viewer/torch-effects.js';
import { AtlasAnimationClock } from '../../src/modern-viewer/resource-packs/atlas-animation.js';

test('bat alternates independent wing tips then hangs without carrying flight offsets into rest', () => {
  const rig = createBatRig(new THREE.MeshBasicMaterial());
  const right = rig.bones.get('right_wing'), tip = rig.bones.get('right_wing_tip');
  assert.equal(tip.parent, right);
  poseBat(rig, false, .125);
  assert.ok(right.rotation.y < -.9);
  poseBat(rig, false, .25);
  assert.ok(right.rotation.y > .8);
  poseBat(rig, true, 2);
  const rest = right.rotation.y;
  assert.equal(rig.bones.get('head').rotation.x, Math.PI);
  poseBat(rig, true, 2.25);
  assert.equal(right.rotation.y, rest);
  poseBat(rig, false, 3);
  assert.equal(rig.bones.get('head').rotation.x, 0);
  assert.equal(rig.bones.get('right_wing').position.z, 0);
});

test('negative chunk coordinates, wall tip and a redstone torch switching off', () => {
  const state = { lit: true, facing: 'east' };
  const column = { getBlockStateId: p => p.x === 15 && p.y === 1 && p.z === 0 ? 7 : 0,
    getBlock: () => ({ getProperties: () => state }) };
  const grid = { columns: new Map([['-16,0', column]]), minY: 0, maxY: 4 };
  const registry = { blocksByStateId: { 7: { name: 'redstone_wall_torch' } } };
  assert.deepEqual(nearbyTorches(grid, registry, -1, 1, 0), [{ type: 'redstone_torch', x: -.77, y: 1.92, z: .5 }]);
  state.lit = false;
  assert.deepEqual(nearbyTorches(grid, registry, -1, 1, 0), []);
  assert.equal(torchTip('soul_torch', {}, 0, 5, 0).y, 5.7);
  grid.columns.clear();
  assert.deepEqual(nearbyTorches(grid, registry, -1, 1, 0), []);
});

test('shipped Java 1.21.11 animation manifest updates both water tiles without writing block frames into inventory icons', async () => {
  const manifest = JSON.parse(await readFile(new URL('../../../asset-packs/java-1.21.11/public/atlas-animations.json', import.meta.url)));
  assert.equal(manifest.minecraftVersion, '1.21.11');
  const clock = new AtlasAnimationClock(manifest.sprites);
  const water = new Map();
  for (let i=0;i<64;i++) clock.tick(i, ({row,target,frame}) => {
    if (row.id.startsWith('minecraft:block/')) assert.equal(target.atlas,'blocks');
    if (row.id.includes('block/water_')) {
      if (!water.has(row.id)) water.set(row.id,new Set());
      water.get(row.id).add(frame.index);
    }
  });
  for (const id of ['water_still','water_flow']) assert.ok(water.get('minecraft:block/'+id).size >= 16);
});
