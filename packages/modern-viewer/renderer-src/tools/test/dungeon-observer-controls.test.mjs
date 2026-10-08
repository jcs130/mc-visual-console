import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextDungeonCamera, interpolateDungeonCamera, installDungeonObserverControls } from '../../src/modern-viewer/dungeon-observer-controls.js';
const limits = { min: 8, max: 24, yaw: Math.PI * .75, pitch: -.82, distance: 16 };
const initial = { yaw: limits.yaw, pitch: limits.pitch, distance: limits.distance };

test('observer zoom clamps, tilt toggles, and reset restores the framing', () => {
  let pose = initial;
  for (let n = 0; n < 40; n++) pose = nextDungeonCamera(pose, 'near', limits);
  assert.equal(pose.distance, limits.min);
  for (let n = 0; n < 40; n++) pose = nextDungeonCamera(pose, 'far', limits);
  assert.equal(pose.distance, limits.max);
  pose = nextDungeonCamera(pose, 'tilt', limits);
  assert.ok(pose.pitch < initial.pitch);
  pose = nextDungeonCamera(pose, 'tilt', limits);
  assert.equal(pose.pitch, initial.pitch);
  pose = nextDungeonCamera(pose, 'left', limits);
  assert.equal(pose.yaw, initial.yaw + Math.PI / 2);
  assert.deepEqual(nextDungeonCamera(pose, 'reset', limits), initial);
  assert.deepEqual(initial, { yaw: limits.yaw, pitch: limits.pitch, distance: limits.distance });
});

test('rotation interpolates across the angular boundary by the short path', () => {
  const from = { ...initial, yaw: Math.PI - .1 }, to = { ...initial, yaw: -Math.PI + .1 };
  const middle = interpolateDungeonCamera(from, to, .5);
  assert.ok(Math.abs(middle.yaw - Math.PI) < 1e-9);
  assert.deepEqual(interpolateDungeonCamera(initial, { ...initial, distance: 8 }, 1), { ...initial, distance: 8 });
});

test('rapid button clicks retain the requested destination and disposal cancels pending animation', () => {
  const elements = [];
  const create = () => {
    const node = { attributes: {}, children: [], setAttribute(k, v) { this.attributes[k] = v; },
      addEventListener(_event, fn) { this.click = fn; }, append(child) { this.children.push(child); }, remove() { this.removed = true; } };
    elements.push(node); return node;
  };
  const document = { createElement: create, body: { append() {} } }, pending = new Map();
  let pose = initial, id = 0;
  const controller = installDungeonObserverControls({ getPose: () => pose, setPose: next => { pose = next; }, document, limits,
    requestFrame: fn => { pending.set(++id, fn); return id; }, cancelFrame: key => pending.delete(key) });
  const click = label => elements.find(e => e.attributes['aria-label'] === label).click();
  const frame = now => { const list = [...pending.values()]; pending.clear(); list.forEach(fn => fn(now)); };
  click('向左旋转镜头'); frame(0); frame(100);
  click('向左旋转镜头'); frame(110); frame(330);
  assert.ok(Math.abs(Math.abs(pose.yaw - initial.yaw) - Math.PI) < 1e-9);
  click('复位观察镜头'); frame(340); frame(560);
  assert.ok(Math.abs((pose.yaw - initial.yaw) % (Math.PI * 2)) < 1e-9);
  click('拉近镜头');
  controller.dispose();
  assert.equal(pending.size, 0);
  assert.equal(elements[0].removed, true);
});
