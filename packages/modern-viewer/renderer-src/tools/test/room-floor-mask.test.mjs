import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { RoomFloorMask } from '../../src/modern-viewer/room-floor-mask.js';
import { createCutawayUniforms, cutawayMask, setRoomFloorMask } from '../../src/modern-viewer/room-visibility.js';
import { inUpperCutawayRegion } from '../../src/modern-viewer/self-avatar-camera-visibility.js';

const avatar = { x: 0.3, y: 64.3, z: 0.3 };
test('tower walls bound the connected floor, including its roof and one wall cell', () => {
  const cache = { revision: 1, isSolidBlock: (x, y, z) => y === 63 || y === 65 && (Math.abs(x) === 12 || Math.abs(z) === 12) };
  const controller = new RoomFloorMask(cache);
  const mask = controller.update(avatar, 32);
  assert.equal(mask.contains({ x: 10, z: 10 }), true, 'the floor extends beyond the old six-block circle');
  assert.equal(mask.contains({ x: 12, z: 0 }), true, 'upper wall rim is removed');
  assert.equal(mask.contains({ x: 14, z: 0 }), false, 'separate room behind the wall stays intact');
  assert.equal(controller.update(avatar, 32), mask, 'unchanged frames reuse the mask');
  cache.revision++;
  assert.notEqual(controller.update(avatar, 32), mask, 'changed chunks invalidate the floor region');
});

test('cliff columns remain opaque even when their height falls inside a wide indoor reveal', () => {
  const cache = { revision: 1, isSolidBlock: (x, y, z) => y === 63 || x >= 4 && x <= 20 && Math.abs(z) <= 10 && y === 65 };
  const mask = new RoomFloorMask(cache).update(avatar, 32);
  assert.equal(mask.contains({ x: 3, z: 0 }), true);
  assert.equal(mask.contains({ x: 4, z: 0 }), false, 'the cliff face is retained with the rock behind it');
  assert.equal(mask.contains({ x: 10, z: 0 }), false, 'mountain interior is excluded');
  const settings = { camera: new Vector3(0, 80, 16), target: new Vector3(0, 65, 0),
    right: new Vector3(1, 0, 0), up: new Vector3(0, 1, 0), forward: new Vector3(0, -1, -1).normalize(),
    footY: 64.05, cutoffY: 65.95, roomRadius: 32, covered: true, floorMask: mask };
  assert.equal(cutawayMask(new Vector3(10, 80, 0), settings), 0);
  assert.equal(cutawayMask(new Vector3(2, 72, 0), settings), 1);
  const region = { center: avatar, camera: { x: 0, z: 16 }, radius: 32, corridorRadius: 0, hitAlong: 1, halfSpan: 0, roomMask: mask };
  assert.equal(inUpperCutawayRegion({ x: 10, z: 0 }, region), false, 'uphill entities follow the same floor boundary');
});

test('an overhang beyond a ledge is excluded when there is no floor to reveal', () => {
  const cache = { revision: 1, isSolidBlock: (x, y, z) => y === 63 && Math.abs(x) < 3 && Math.abs(z) < 3 };
  const mask = new RoomFloorMask(cache).update(avatar, 32);
  assert.equal(mask.contains({ x: 2, z: 2 }), true);
  assert.equal(mask.contains({ x: 10, z: 0 }), false);
});

test('room texture reuses its allocation and shares bytes with CPU entity visibility', () => {
  const controller = new RoomFloorMask({ revision: 1, isSolidBlock: () => false });
  const uniforms = createCutawayUniforms();
  const first = controller.update(avatar, 16);
  setRoomFloorMask(uniforms, first);
  const texture = uniforms.u_lanternRoomMask.value;
  const moved = controller.update({ ...avatar, x: -128.2, z: -256.7 }, 16);
  setRoomFloorMask(uniforms, moved);
  assert.equal(uniforms.u_lanternRoomMask.value, texture);
  assert.equal(texture.image.data, moved.data);
  assert.equal(moved.contains({ x: -128.2, z: -256.7 }), true);
  assert.equal(moved.contains({ x: 0, z: 0 }), false);
  assert.equal(uniforms.u_lanternRoomMaskEnabled.value, 1);
});
