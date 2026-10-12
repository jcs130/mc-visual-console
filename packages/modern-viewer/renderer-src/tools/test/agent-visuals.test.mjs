import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentVisualState } from '../../src/modern-viewer/agent-visual-state.js';
import { AGENT_VISUAL_COLORS, normalizeAgentVisualUpdate, normalizeVisualMarkers, visualPoints } from '../../src/modern-viewer/agent-visual-protocol.js';
import { drawVisualMarkers, frameVisualMarkers, routeMapProjection, drawVisualScene } from '../../src/modern-viewer/agent-visual-drawing.js';
import { resolveObsCamera, horizontalFov } from '../../src/modern-viewer/obs-camera.js';
import { PerspectiveCamera, Vector3, Group } from 'three';
import { createAgentWorldProjector } from '../../src/modern-viewer/agent-visual-projection.js';
const subject = { playerUuid: '00000000-0000-0000-0000-000000000001', playerName: 'ag_test', entityId: 1 };
const p = (x, z = x) => ({ x, y: 64, z });
const intent = { goal: '收集小麦', step: '先去田边', summary: '公开说明，不是内部思维链', status: 'acting', remainingMs: 1000 };
const frame = (extra = {}) => ({ schemaVersion: 1, subject, available: true, epoch: 'stream-1', sequence: 1, ttlMs: 3500,
  intent, markers: [], candidates: [], trail: [], route: null, input: { controls: ['forward'] }, ...extra });
function context() {
  const calls = [], ctx = { calls, save() {}, restore() {}, beginPath() { calls.push(['begin']); }, moveTo(...p) { calls.push(['move', ...p]); },
    lineTo(...p) { calls.push(['line', ...p]); }, stroke() { calls.push(['stroke', this.strokeStyle]); }, fill() { calls.push(['fill', this.fillStyle]); },
    arc(...p) { calls.push(['arc', ...p]); }, closePath() {}, setLineDash(p) { calls.push(['dash', p]); },
    fillRect(...p) { calls.push(['rect', this.fillStyle, ...p]); }, fillText(...p) { calls.push(['text', ...p]); }, measureText(t) { return { width: t.length * 8 }; },
    translate(...p) { calls.push(['translate', ...p]); } };
  return ctx;
}
test('semantic palette distinguishes route, actual trail, candidate, attack, gather and interaction', () => {
  assert.equal(new Set(Object.values(AGENT_VISUAL_COLORS)).size, Object.keys(AGENT_VISUAL_COLORS).length);
  const markers = normalizeVisualMarkers(['path', 'attack', 'gather', 'interact'].map(role => ({ id: role, kind: 'line', role, points: [p(0), p(1)], flow: true })));
  assert.deepEqual(markers.map(m => m.color), ['#4ee6b1', '#ff697b', '#ffbe55', '#c59aff']);
  assert.deepEqual(normalizeVisualMarkers(markers), markers, 'normalized drawing primitives round trip');
});
test('schema accepts explicit public explanation, alternatives and point/line/area/label primitives', () => {
  const update = normalizeAgentVisualUpdate({ intent, candidates: [{ id: 'safe', label: '沿路绕行', points: [p(0), p(3)] }],
    markers: [{ id: 'target', kind: 'point', position: p(3), role: 'gather' },
      { id: 'area', kind: 'area', points: [p(0), p(2), p(3, 0)], label: '采集区' },
      { id: 'screen', kind: 'label', space: 'screen', position: { x: .5, y: .1 }, label: '<b>纯文本</b>' }],
    hiddenReasoning: 'must not be copied', credentials: 'must not be copied' });
  assert.equal(update.ok, true); assert.equal(update.value.hiddenReasoning, undefined); assert.equal(update.value.credentials, undefined);
  assert.deepEqual(normalizeVisualMarkers(update.value.markers), update.value.markers);
});
test('invalid geometry, duplicate IDs, excessive vertices/candidates and executable/remote media are rejected atomically', () => {
  for (const markers of [[{ id: 'a', kind: 'line', points: [p(0), { x: NaN }] }],
    [{ id: 'a', kind: 'point', position: p(0) }, { id: 'a', kind: 'point', position: p(1) }],
    Array.from({ length: 49 }, (_, i) => ({ id: String(i), kind: 'point', position: p(i) })),
    Array.from({ length: 9 }, (_, i) => ({ id: String(i), kind: 'line', points: Array.from({ length: 128 }, (_, x) => p(x)) }))]) {
    assert.equal(normalizeAgentVisualUpdate({ intent, markers }).ok, false);
  }
  for (const src of ['https://evil.test/a.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PHNjcmlwdD4=', `data:image/png;base64,${'AAAA'.repeat(180000)}`]) {
    assert.equal(normalizeAgentVisualUpdate({ presentation: { id: 'a', kind: 'image', src } }).ok, false);
  }
  assert.equal(normalizeAgentVisualUpdate({ candidates: Array.from({ length: 5 }, () => ({ points: [p(0), p(1)] })) }).ok, false);
  assert.equal(normalizeAgentVisualUpdate({ presentation: { id: 'x', kind: 'html', html: '<script>alert(1)</script>' } }).ok, false);
});
test('long path sampling retains its real endpoint and candidates are never confused with a chosen route', () => {
  const points = Array.from({ length: 1000 }, (_, x) => p(x));
  const sampled = visualPoints(points); assert.equal(sampled.length, 128); assert.deepEqual(sampled.at(-1), p(999));
  const markers = frameVisualMarkers({ route: { points: [p(0), p(1)] }, candidates: [{ id: 'c', label: '候选', points: [p(0), p(3)] }],
    trail: [p(0), p(2)], input: { operations: [{ id: 1, kind: 'attack', from: p(0), target: p(4) }] }, markers: [] });
  assert.equal(markers.find(m => m.role === 'candidate').dashed, true); assert.equal(markers.find(m => m.role === 'path').flow, true);
  assert.equal(markers.find(m => m.role === 'attack').color, AGENT_VISUAL_COLORS.attack);
});
test('camera projections split at hidden vertices and never fill a partially behind-camera area', () => {
  const ctx = context(), markers = normalizeVisualMarkers([{ id: 'line', kind: 'line', points: [p(0), p(1), p(2)] },
    { id: 'area', kind: 'area', points: [p(0), p(1), p(2)] }]);
  drawVisualMarkers(ctx, markers, { project: v => v.x === 1 ? null : { x: v.x * 10, y: 20 }, width: 300, height: 150 });
  assert.equal(ctx.calls.some(row => row[0] === 'line'), false); assert.equal(ctx.calls.some(row => row[0] === 'fill'), false);
});
test('north-up route projection includes alternatives and puts north above south', () => {
  const markers = normalizeVisualMarkers([{ id: 'l', kind: 'line', points: [p(0, -5), p(5, 5)] }]);
  const project = routeMapProjection(markers, p(0), 300, 156);
  assert.ok(project(p(0, -5)).y < project(p(0, 5)).y); assert.ok(project(p(0)).x < project(p(5)).x);
});
test('very distant projections cannot create unbounded flow-arrow loops', () => {
  const ctx = context(), markers = normalizeVisualMarkers([{ id: 'far', kind: 'line', flow: true, points: [p(0), p(1)] }]);
  drawVisualMarkers(ctx, markers, { project: v => ({ x: v.x ? 1e12 : -1e12, y: 80 }), width: 300, height: 160, time: 500 });
  assert.ok(ctx.calls.length < 200, 'arrows must be clipped to the viewport');
});
test('stream identity/sequence, subject switches, disconnects and local stale deadlines cannot reuse old state/media', () => {
  let time = 0; const state = new AgentVisualState({ now: () => time });
  assert.equal(state.accept(frame()), true); assert.equal(state.accept(frame()), false);
  time = 1001; assert.equal(state.snapshot().intent, null);
  state.session({ ...subject, mode: 'observer', attached: true });
  const ref = { id: 'p', kind: 'card', revision: 1, remainingMs: 2000 };
  assert.equal(state.accept(frame({ sequence: 2, presentation: ref })), true);
  assert.equal(state.acceptPresentation({ schemaVersion: 1, subject, epoch: 'stream-1', revision: 1, presentation: { id: 'p', kind: 'card', text: '我的下一步' } }), true);
  assert.equal(state.snapshot().media.text, '我的下一步');
  state.session({ ...subject, entityId: 2, mode: 'observer', attached: true });
  assert.equal(state.snapshot(), null); assert.equal(state.accept(frame({ sequence: 3 })), false);
  assert.equal(state.acceptPresentation({ schemaVersion: 1, subject, epoch: 'stream-1', revision: 1, presentation: { id: 'p', kind: 'card', text: '旧图片' } }), false);
  state.reset(); assert.equal(state.accept(frame({ sequence: 4 })), true); time += 3501; assert.equal(state.snapshot(), null);
});
test('declarative animated scenes draw only allowlisted commands and advance with time', () => {
  const parsed = normalizeAgentVisualUpdate({ presentation: { id: 'scene', kind: 'scene', width: 300, height: 160,
    nodes: [{ kind: 'circle', x: 10, y: 30, radius: 5, motion: { dx: 40, dy: 0, periodMs: 1000 } },
      { kind: 'text', x: 10, y: 20, text: '<script>显示原文</script>' }] } });
  assert.equal(parsed.ok, true); const ctx = context(); drawVisualScene(ctx, parsed.value.presentation, 500);
  assert.deepEqual(ctx.calls.find(row => row[0] === 'translate'), ['translate', 40, 0]);
  assert.equal(ctx.calls.find(row => row[0] === 'text')[1], '<script>显示原文</script>');
});
test('FOV uses the game vertical angle, respects capture aspect and follows only fresh explicit dynamic reports', () => {
  const settings = { fov: 70, aspect: 16 / 9, followAgent: true };
  const resolved = resolveObsCamera(settings, null);
  assert.equal(resolved.fov, 70); assert.ok(Math.abs(horizontalFov(70, 16 / 9) - 102.44785777798825) < 1e-8);
  const camera = new PerspectiveCamera(resolved.fov, resolved.aspect, .1, 1000);
  const point = new Vector3(5, 0, -10).project(camera);
  const expected = .5 / (Math.tan(35 * Math.PI / 180) * (16 / 9));
  assert.ok(Math.abs(point.x - expected) < 1e-10, 'same vertical FOV and source aspect align pinhole projection');
  const wide = new PerspectiveCamera(110, 16 / 9, .1, 1000);
  assert.ok(new Vector3(5, 0, -10).project(wide).x < point.x);
  assert.equal(resolveObsCamera(settings, { verticalFov: 84 }).fov, 84);
  assert.equal(resolveObsCamera({ ...settings, followAgent: false }, { verticalFov: 84 }).fov, 70);
  assert.equal(resolveObsCamera({ fov: 70, aspect: 4 / 3 }, null, { aspect: 16 / 9 }).aspect, 4 / 3);
  let time = 0; const state = new AgentVisualState({ now: () => time });
  assert.equal(state.accept(frame({ camera: { verticalFov: 84, remainingMs: 1000 } })), true);
  assert.equal(resolveObsCamera(settings, state.snapshot().camera).fov, 84);
  time = 1001; assert.equal(resolveObsCamera(settings, state.snapshot().camera).fov, 70);
});

test('world markers follow rebased coordinates, camera parents, FOV and resize even without a terrain render', () => {
  const camera = new PerspectiveCamera(70, 16 / 9, .1, 1000), parent = new Group();
  parent.add(camera);
  const origin = { x: 1200000, y: 126, z: -2300000,
    toSceneX(x) { return x - this.x; }, toSceneY(y) { return y - this.y; }, toSceneZ(z) { return z - this.z; } };
  let viewport = { width: 1920, height: 1080 };
  const world = { camera, sceneOrigin: origin }, project = createAgentWorldProjector(() => world, () => viewport);
  const ahead = () => ({ x: origin.x, y: origin.y, z: origin.z - 10 });
  assert.deepEqual(project(ahead()), { x: 960, y: 540 });
  assert.equal(project({ ...ahead(), z: origin.z + 10 }), null, 'behind-camera markers stay hidden');
  const offAxis = { ...ahead(), x: origin.x + 5 }, at70 = project(offAxis).x;
  camera.fov = 110; camera.updateProjectionMatrix();
  assert.ok(project(offAxis).x < at70, 'wider game FOV contracts the same world point toward center');
  parent.rotation.y = Math.PI / 2; // No renderer.render() or manual matrix update.
  assert.ok(Math.abs(project({ x: origin.x - 10, y: origin.y, z: origin.z }).x - 960) < 1e-8);
  parent.rotation.y = 0; origin.x += 1000; origin.z -= 2000;
  viewport = { width: 800, height: 600 }; camera.aspect = 4 / 3; camera.updateProjectionMatrix();
  assert.deepEqual(project(ahead()), { x: 400, y: 300 }, 'new origin and viewport cannot retain old screen positions');
  assert.equal(createAgentWorldProjector(() => null, () => viewport)(ahead()), null);
});
