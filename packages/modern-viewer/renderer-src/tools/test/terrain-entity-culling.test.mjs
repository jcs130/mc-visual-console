import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { hiddenBelowOpaqueFloor } from '../../src/modern-viewer/terrain-entity-culling.js';

const camera = new Vector3(0, 75, 10);
const box = new Box3(new Vector3(-1, 48, -1), new Vector3(1, 51, 1));
const cache = { isOpaqueFullBlock: (x, y, z) => y === 63 };
test('the whole entity is hidden only behind a complete opaque layer below the current floor', () => {
  assert.equal(hiddenBelowOpaqueFloor(box, camera, 64, cache), true);
  assert.equal(hiddenBelowOpaqueFloor(box, camera, 64, { isOpaqueFullBlock: () => false }), false);
  assert.equal(hiddenBelowOpaqueFloor(box, camera, 64, {}), false);
  assert.equal(hiddenBelowOpaqueFloor(box, camera, NaN, cache), false);
  assert.equal(hiddenBelowOpaqueFloor(box, new Vector3(0, 50, 10), 64, cache), false);
  assert.equal(hiddenBelowOpaqueFloor(new Box3(new Vector3(-1, 62, -1), new Vector3(1, 65, 1)), camera, 64, cache), false);
});
test('a hole between the corner rays still reveals the entity', () => {
  const large = new Box3(new Vector3(-8, 45, -8), new Vector3(8, 49, 8));
  assert.equal(hiddenBelowOpaqueFloor(large, camera, 64, cache), true);
  const hole = { isOpaqueFullBlock: (x,y,z) => y === 63 && !(x === 0 && z === 5) };
  assert.equal(hiddenBelowOpaqueFloor(large, camera, 64, hole), false);
});
test('negative coordinates and world-origin shifts use the same physical terrain', () => {
  const offset = new Vector3(-512, -128, -512);
  const translated = box.clone().translate(offset);
  assert.equal(hiddenBelowOpaqueFloor(translated, camera.clone().add(offset), -64,
    { isOpaqueFullBlock: (x,y,z) => y === -65 }), true);
});
