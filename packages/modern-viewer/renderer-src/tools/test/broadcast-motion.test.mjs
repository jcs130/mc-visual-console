import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoundedCameraMotion, toJavaCameraAngles } from '../../host/broadcast-motion.mjs';
const probe = () => ({ known: true, clear: true, visible: true });
const options = { scope: 'world', kind: 'orbit_arc', position: [0, 3, 6], focus: [0, 1, 0], arcDegrees: 60, durationMs: 8000, probe };
const distance = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));

test('orbit actually moves around a fixed focus, holds horizon and reaches a finite endpoint', () => {
  const motion = new BoundedCameraMotion(options), start = motion.result().pose;
  const middle = motion.advance(motion.durationMs / 2); const end = motion.advance(motion.durationMs);
  assert.equal(end.phase, 'completed'); assert.deepEqual(end.pose.focus, options.focus); assert.deepEqual(end.pose.up, [0, 1, 0]);
  assert.ok(distance(start.position, middle.pose.position) > 1); assert.ok(Math.abs(distance(start.position, start.focus) - distance(end.pose.position, end.pose.focus)) < 1e-8);
  assert.ok(distance(end.pose.position, motion.advance(1000000).pose.position) < 1e-8);
});

test('identical elapsed times match at 24 and 60 fps; initial and final velocities ease to zero', () => {
  const run = fps => { const m = new BoundedCameraMotion(options); for (let t = 0; t < 4000; t += 1000 / fps) m.advance(t); return m.advance(4000).pose; };
  assert.deepEqual(run(24), run(60));
  const m = new BoundedCameraMotion(options), start = m.result().pose.position, first = m.advance(10).pose.position;
  const penultimate = m.advance(m.durationMs - 10).pose.position, end = m.advance(m.durationMs).pose.position;
  assert.ok(distance(start, first) < .00001); assert.ok(distance(penultimate, end) < .00001);
});

test('duration stretches to respect translation and angular speed limits instead of snapping', () => {
  const m = new BoundedCameraMotion({ ...options, durationMs: 1000, maxSpeed: 1, maxTurnDegrees: 15 });
  assert.ok(m.durationMs > 1000); let previous = m.result().pose.position;
  for (let t = 20; t <= m.durationMs; t += 20) { const next = m.advance(t).pose.position; assert.ok(distance(previous, next) / .02 <= 1.001); previous = next; }
});

test('unknown geometry or occluded focus fails full-path preflight', () => {
  assert.throws(() => new BoundedCameraMotion({ ...options, probe: () => ({ clear: true, visible: true }) }), /UNVERIFIED_MOTION_PATH/);
  assert.throws(() => new BoundedCameraMotion({ ...options, probe: pose => ({ known: true, clear: true, visible: pose.position[0] > -2 }) }), /UNVERIFIED_MOTION_PATH/);
});

test('new obstacle checks swept path even with a large frame gap, then holds the last valid pose', () => {
  let wall = false;
  const m = new BoundedCameraMotion({ scope: 'world', kind: 'truck', position: [0, 3, 6], focus: [0, 1, 0], endPosition: [4, 3, 6],
    probe: pose => ({ known: true, clear: !(wall && pose.position[0] > 1.5 && pose.position[0] < 2.5), visible: true }) });
  m.advance(1000); const prior = m.result().pose; wall = true;
  assert.equal(m.advance(m.durationMs).phase, 'blocked'); assert.deepEqual(m.result().pose, prior);
  wall = false; assert.equal(m.advance(m.durationMs).phase, 'blocked');
});

test('scope changes, cancellation and reverse clocks never restart a motion', () => {
  for (const mode of ['scope', 'cancel', 'clock']) {
    const m = new BoundedCameraMotion(options); m.advance(1000);
    if (mode === 'scope') m.advance(2000, { scope: 'other' });
    if (mode === 'cancel') m.cancel();
    if (mode === 'clock') m.advance(999);
    const terminal = m.result(); assert.notEqual(terminal.phase, 'running'); assert.deepEqual(m.advance(5000), terminal);
  }
});

test('dolly, pedestal, pan and hold have distinct script constraints', () => {
  assert.throws(() => new BoundedCameraMotion({ ...options, kind: 'push_in', endPosition: [0, 4, 9] }), /PUSH_MUST_APPROACH/);
  assert.throws(() => new BoundedCameraMotion({ ...options, kind: 'push_in', endPosition: [1, 2, 3] }), /DOLLY_MUST_FOLLOW_RAY/);
  assert.throws(() => new BoundedCameraMotion({ ...options, kind: 'pan', endPosition: [1, 3, 6], endFocus: [1, 1, 0] }), /PAN_MUST_NOT_DOLLY/);
  assert.throws(() => new BoundedCameraMotion({ ...options, kind: 'pedestal', endPosition: [1, 4, 6] }), /PEDESTAL_MUST_BE_VERTICAL/);
  assert.throws(() => new BoundedCameraMotion({ ...options, kind: 'hold', endFocus: [1, 1, 0] }), /HOLD_MUST_NOT_MOVE/);
  const push = new BoundedCameraMotion({ ...options, kind: 'push_in', endPosition: [0, 2, 3] });
  assert.deepEqual(push.advance(push.durationMs).pose.position, [0, 2, 3]);
});

test('pan keeps pitch through its middle, while a near-vertical ambiguous horizon is refused', () => {
  const m = new BoundedCameraMotion({ ...options, kind: 'pan', endFocus: [6, 1, 6] });
  const before = toJavaCameraAngles(m.result().pose), middle = toJavaCameraAngles(m.advance(m.durationMs / 2).pose);
  assert.ok(Math.abs(before.pitch - middle.pitch) < 1e-8);
  assert.throws(() => new BoundedCameraMotion({ ...options, kind: 'hold', position: [0, 3, 0], focus: [0, 1, 0] }), /UNVERIFIED_MOTION_PATH/);
});

test('native pitch sign is positive down; canonical focus stays independent of backend conventions', () => {
  assert.deepEqual(toJavaCameraAngles({ position: [0, 0, 0], focus: [0, -1, 1] }), { yaw: -0, pitch: 45 });
  assert.deepEqual(toJavaCameraAngles({ position: [0, 0, 0], focus: [-1, 0, 0] }), { yaw: 90, pitch: -0 });
});
