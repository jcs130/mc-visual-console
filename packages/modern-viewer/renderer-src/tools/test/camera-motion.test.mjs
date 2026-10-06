import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function harness(first = false) {
  let now = 0;
  class Vec3 { constructor(x, y, z) { Object.assign(this, { x, y, z }); } }
  const context = { isFirstPersonView: first, performance: { now: () => now }, Vec3,
    document: { hidden: false }, requestAnimationFrame: () => 1 };
  const source = readFileSync(new URL('../minecraft-viewer-motion.js', import.meta.url), 'utf8');
  const sample = runInNewContext(`${source}\ncortiCameraPose`, context);
  const packet = (x, overrides = {}) => ({ pos: new Vec3(x, 64, 0), yaw: 0, pitch: 0, ...overrides });
  return { sample, packet, tick: ms => { now += ms; } };
}

for (const first of [true, false]) {
  test(`${first ? 'first-person' : 'observer'} camera interpolates 20 Hz walking at display cadence`, () => {
    const { sample, packet, tick } = harness(first);
    sample(packet(0), true);
    const outputs = [];
    for (let frame = 1; frame <= 60; frame += 1) {
      tick(1000 / 60);
      outputs.push(sample(packet(Math.floor(frame / 3) * 0.2), false).pos.x);
    }
    const steps = outputs.slice(1).map((x, i) => x - outputs[i]);
    assert.ok(steps.every(step => step >= 0 && step < 0.13));
    assert.ok(steps.filter(step => step > 0.001).length > 50, 'motion continues between network samples');
    assert.ok(outputs.at(-1) > 3.4);
  });
}

test('observer focus changes and teleports snap instead of sweeping across the map', () => {
  const { sample, packet, tick } = harness();
  sample(packet(0, { cameraTarget: 'self' }), true);
  tick(16);
  assert.equal(sample(packet(4, { cameraTarget: 'npc:8' }), false).pos.x, 4);
  tick(16);
  assert.equal(sample(packet(6, { cameraTarget: 'npc:8', teleport: true }), false).pos.x, 6);
});

test('first-person rotation takes the short path across the yaw boundary', () => {
  const { sample, packet, tick } = harness(true);
  sample(packet(0, { yaw: Math.PI - 0.02 }), true);
  tick(16);
  const next = sample(packet(0, { yaw: -Math.PI + 0.02 }), false);
  assert.ok(next.yaw > Math.PI - 0.02 && next.yaw < Math.PI + 0.02);
});

test('built observer camera continues between packets without re-streaming chunks or refreshing panels', () => {
  const clientSource = readFileSync(new URL('../../src/modern-viewer/client.js', import.meta.url), 'utf8');
  const builder = readFileSync(new URL('../build-minecraft-viewer-client.mjs', import.meta.url), 'utf8');
  const adaptation = builder.slice(builder.indexOf('const adaptedClient ='), builder.indexOf('const changedClient ='));
  const potionRenderAnchor = '  worldView.emit(isMove ? "entityMoved" : "entity",\n    isMove ? normalized : rendererEntityEquipment(normalized, globalThis.mcData?.itemsByName));';
  const adapted = runInNewContext(`${adaptation}\nadaptedClient`, { clientSource, potionRenderAnchor });
  const start = adapted.indexOf('function applyPosition(');
  const end = adapted.indexOf('\nfunction focusEntityById(', start);
  let now = 0;
  const camera = [], chunks = [], callbacks = [];
  let guardChecks = 0, panels = 0;
  class Vec3 { constructor(x, y, z) { Object.assign(this, { x, y, z }); } }
  const context = {
    Vec3, performance: { now: () => now }, document: { hidden: false },
    rendererReady: true, latestPosition: { pos: new Vec3(0, 64, 0), yaw: 0, pitch: 0 },
    usesWorldAvatar: true, isFirstPersonView: false, isDungeonView: true,
    orbitInitialized: true, orbitYaw: 2.35, orbitPitch: -0.82, orbitDistance: 16,
    focusedCharacterId: null, pendingPlayerEntity: null,
    viewer: { updateCamera: (pos, yaw, pitch, options) => camera.push({ x: pos.x, yaw, pitch, options }) },
    worldView: { emit: (event, data) => chunks.push({ event, data }) },
    resolveObserverTargetPosition: () => ({ position: context.latestPosition.pos }),
    applyOrbitCameraOffset() {}, scheduleDungeonOcclusionCheck() {}, publishCameraDataset() {},
    refreshChunkLoadingGuards: () => { guardChecks += 1; },
    scheduleNpcPanelRender: () => { panels += 1; },
    requestAnimationFrame: callback => { callbacks.push(callback); return callbacks.length; },
  };
  const motion = readFileSync(new URL('../minecraft-viewer-motion.js', import.meta.url), 'utf8');
  const apply = runInNewContext(`${motion}\n${adapted.slice(start, end)}\napplyPosition`, context);
  apply(true);
  now = 50;
  context.latestPosition = { pos: new Vec3(1, 64, 0), yaw: 0, pitch: 0 };
  apply(false);
  now += 16; callbacks.shift()();
  now += 16; callbacks.shift()();
  assert.ok(camera[1].x > 0 && camera[1].x < 1);
  assert.ok(camera[2].x > camera[1].x && camera[3].x > camera[2].x);
  assert.ok(camera.every(frame => frame.yaw === 2.35 && frame.options.instant === true));
  assert.equal(chunks.length, 2);
  assert.equal(chunks[1].data.pos.x, 1, 'chunk streaming uses the authoritative position');
  assert.equal(context.latestPosition.pos.x, 1);
  assert.equal(guardChecks, 2);
  assert.equal(panels, 2);
});
