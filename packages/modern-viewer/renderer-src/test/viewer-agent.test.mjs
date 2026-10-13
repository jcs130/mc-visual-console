import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createViewerAgentBridge, createViewerAgentHub, publishAgentVisualization } from '../host/viewer-agent.mjs';

const a = '00000000-0000-0000-0000-000000000001', b = '00000000-0000-0000-0000-000000000002';
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1sAAAAASUVORK5CYII=';
test('optional flight telemetry is bounded, carries permission separately and cannot invent input', () => {
  let flight = { allowed: true, flying: false, expiresAtMs: 6000, private: 'must not leak' };
  const h = fixture({ getFlightState: () => flight });
  try {
    h.bot.controlState = {}; h.bridge.flush();
    assert.deepEqual(h.latest().input.flight, { allowed: true, flying: false, mode: 'ground', serverFlying: false, direction: null, remainingMs: 5000 });
    flight = { ...flight, flying: true, mode: 'route', direction: { x: 0, y: 3, z: 0 } }; h.bridge.flush();
    assert.equal(h.latest().input.flight.mode, 'route'); assert.deepEqual(h.latest().input.controls, []);
    assert.equal(JSON.stringify(h.latest()).includes('must not leak'), false);
    flight = { ...flight, allowed: false }; h.bridge.flush();
    assert.equal(h.latest().input.flight.mode, 'ground'); assert.equal(h.latest().input.flight.direction, null);
  } finally { h.bridge.dispose(); }
  const failing = fixture({ getFlightState: () => { throw Error('unavailable'); } });
  try { assert.equal(failing.latest().input.flight, null); } finally { failing.bridge.dispose(); }
});
function fixture({ hub = createViewerAgentHub(), uuid = a, id = 1, name = 'ag_test', ...options } = {}) {
  let time = 1000; const bot = new EventEmitter(), writes = [], client = new EventEmitter();
  client.state = 'play'; client.write = function (...args) { writes.push(args); return 42; };
  bot._client = client; bot.uuid = uuid; bot.username = name; bot.game = { gameMode: 'survival', dimension: 'overworld' };
  bot.entity = { id, uuid, position: { x: 0, y: 64, z: 0 }, yaw: .4, pitch: -.2 };
  bot.controlState = { forward: true }; bot.entities = { 9: { position: { x: 5, y: 64, z: 2 } } };
  bot.pathfinder = { goal: { x: 9, y: 64, z: 3 }, isMoving: () => false };
  const bridge = createViewerAgentBridge(bot, { hub, now: () => time, timers: false, ...options });
  const socket = new EventEmitter(); socket.connected = true; const events = [];
  for (const name of ['agentVisualization', 'agentPresentation']) socket.on(name, value => events.push([name, structuredClone(value)]));
  bridge.subscribeSocket(socket);
  const latest = () => events.filter(([name]) => name === 'agentVisualization').at(-1)?.[1];
  return { bot, client, writes, hub, socket, events, bridge, latest, advance(ms) { time += ms; bridge.flush(); } };
}
test('actual path, controls and packets are observed without intercepting gameplay or recording login/chat', () => {
  const h = fixture(); try {
    h.bot.emit('path_update', { status: 'success', path: [{ x: 0, y: 64, z: 0 }, { x: 9, y: 64, z: 3 }] });
    assert.equal(h.client.write('use_entity', { target: 9, mouse: 1 }), 42);
    h.client.write('block_dig', { status: 0, location: { x: 2, y: 63, z: 1 } });
    h.client.write('block_place', { location: { x: 3, y: 64, z: 1 } });
    h.client.write('chat', { message: '/login DO_NOT_PUBLISH_THIS' });
    h.bridge.flush(); const state = h.latest();
    assert.equal(state.route.status, 'moving', 'path found is not goal reached');
    assert.deepEqual(state.input.controls, ['forward']);
    assert.deepEqual(state.input.operations.map(op => op.kind), ['attack', 'gather', 'interact']);
    assert.deepEqual(state.input.operations[0].target, { x: 5, y: 64, z: 2 });
    assert.equal(JSON.stringify(h.events).includes('DO_NOT_PUBLISH_THIS'), false);
    assert.equal(h.writes.length, 4);
    h.bot.emit('goal_reached'); h.bridge.flush(); assert.equal(h.latest().route.status, 'reached');
  } finally { h.bridge.dispose(); }
});
test('public updates are atomic, identities cannot be supplied by a developer, and source expiry is real', () => {
  const h = fixture(); try {
    assert.equal(publishAgentVisualization(h.bot, { intent: { goal: '去采矿', ttlMs: 1000 }, subject: { playerUuid: b } }).ok, true);
    assert.equal(h.bridge.publish({ intent: { goal: '不能覆盖' }, markers: [{ id: 'bad', kind: 'html' }] }).ok, false);
    h.bridge.flush(); assert.equal(h.latest().intent.goal, '去采矿'); assert.equal(h.latest().subject.playerUuid, a);
    h.advance(1001); assert.equal(h.latest().intent, null);
    h.bot.emit('end'); assert.equal(h.latest().available, false); assert.equal(h.hub.size, 0);
    assert.equal(h.bridge.publish({ intent: { goal: '离线不能提交' } }).ok, false);
  } finally { h.bridge.dispose(); }
  assert.equal(publishAgentVisualization(h.bot, { intent: {} }).code, 'AGENT_VISUAL_HOST_NOT_ATTACHED');
});
test('Eyes/live read only their attested exact UUID/entity target, then clear on switch and source disconnect', () => {
  const hub = createViewerAgentHub(), body = fixture({ hub });
  let session = { mode: 'observer', attached: true, playerUuid: a, playerName: 'ag_test', entityId: 1 };
  const eye = fixture({ hub, uuid: b, id: 2, name: 'ag_test_eye', getViewerSession: () => session });
  eye.bot.game.gameMode = 'spectator';
  try {
    body.bridge.publish({ intent: { goal: '本体的公开说明' }, presentation: { id: 'p', kind: 'card', text: '本体图片说明' } });
    eye.bridge.flush(); assert.equal(eye.latest().intent.goal, '本体的公开说明'); assert.equal(hub.size, 1);
    session = { ...session, entityId: 999 }; eye.bridge.flush(); assert.equal(eye.latest().available, false);
    assert.equal(eye.latest().presentation, undefined);
    session = { ...session, entityId: 1, playerUuid: b }; eye.bridge.flush(); assert.equal(eye.latest().available, false);
    session = { ...session, playerUuid: a }; body.bot.emit('end'); eye.bridge.flush(); assert.equal(eye.latest().available, false);
    session = { mode: 'observer', attached: false }; eye.bridge.flush(); assert.equal(eye.latest().subject, null);
  } finally { eye.bridge.dispose(); body.bridge.dispose(); }
});
test('image bytes are sent once per revision and again to a new subscriber; heartbeat contains metadata only', () => {
  const h = fixture(); try {
    h.bridge.publish({ presentation: { id: 'photo', title: '采矿计划', kind: 'image', src: pixel, ttlMs: 1000 } });
    h.bridge.flush(); h.advance(200); h.advance(200);
    assert.equal(h.events.filter(([name]) => name === 'agentPresentation').length, 1);
    assert.equal(JSON.stringify(h.latest()).includes('base64'), false);
    const second = new EventEmitter(), media = []; second.on('agentPresentation', v => media.push(v));
    const off = h.bridge.subscribeSocket(second); assert.equal(media.length, 1); off();
    assert.equal(second.listenerCount('agentVisualUpdate'), 0);
    h.advance(601); assert.equal(h.latest().presentation, null);
  } finally { h.bridge.dispose(); }
});
test('operations/trails are bounded and teleports, dimension changes and resets do not invent routes', () => {
  const h = fixture(); try {
    for (let i = 0; i < 15; i++) h.client.write('use_entity', { target: 9, mouse: 1 });
    h.bridge.flush(); assert.equal(h.latest().input.operations.length, 6);
    h.advance(1801); assert.equal(h.latest().input.operations.length, 0);
    h.bot.entity.position.x = 5; h.bridge.flush(); assert.equal(h.latest().trail.length, 2);
    h.bot.entity.position.x = 100; h.bridge.flush(); assert.equal(h.latest().trail.length, 1);
    h.bridge.publish({ intent: { goal: '旧世界' }, route: { points: [{ x: 1, y: 64, z: 1 }, { x: 2, y: 64, z: 2 }] },
      presentation: { id: 'old-world', kind: 'card', text: '旧世界示意图' } });
    const epoch = h.latest().epoch; h.bot.game.dimension = 'the_nether'; h.bridge.flush();
    assert.notEqual(h.latest().epoch, epoch); assert.equal(h.latest().route, null); assert.equal(h.latest().intent, null); assert.equal(h.latest().presentation, null);
    h.bot.emit('path_update', { path: [{ x: 1, y: 64, z: 1 }, { x: 2, y: 64, z: 2 }] });
    h.bot.emit('path_reset'); h.bridge.flush(); assert.deepEqual(h.latest().route.points, []);
  } finally { h.bridge.dispose(); }
});
test('packet wrapper preserves this/return/throws, restores cleanly, and does not clobber later wrappers', () => {
  const h = fixture(), wrapper = h.client.write;
  const later = function (...args) { return wrapper.apply(this, args); }; h.client.write = later;
  h.bridge.dispose(); assert.equal(h.client.write, later); assert.equal(h.client.write('chat', {}), 42);
  assert.equal(h.bot.listenerCount('path_update'), 0); assert.equal(h.socket.listenerCount('agentVisualUpdate'), 0);
  const bot = new EventEmitter(); bot._client = new EventEmitter(); bot._client.state = 'play';
  bot._client.write = function () { assert.equal(this, bot._client); throw Error('not sent'); };
  bot.username = 'ag_test'; bot.uuid = a; bot.entity = { id: 1, position: { x: 0, y: 64, z: 0 } };
  const bridge = createViewerAgentBridge(bot, { timers: false, hub: createViewerAgentHub() });
  try { assert.throws(() => bot._client.write('use_entity', { target: 9, mouse: 1 }), /not sent/); } finally { bridge.dispose(); }
});
test('optional socket publishing uses existing host authorization; default denied, errors denied, rate limited, private acknowledgements', async () => {
  const denied = fixture(); let result;
  try { denied.socket.emit('agentVisualUpdate', { intent: { goal: 'unauthorized' } }, v => { result = v; });
    await Promise.resolve(); assert.equal(result.code, 'AGENT_VISUAL_PUBLISH_FORBIDDEN');
  } finally { denied.bridge.dispose(); }
  const h = fixture({ authorizePublish: ({ socket, subject }) => socket.connected && subject.playerUuid === a });
  try {
    h.socket.emit('agentVisualUpdate', { intent: { goal: '授权开发者' } }, v => { result = v; }); await Promise.resolve();
    assert.equal(result.ok, true); h.bridge.flush(); assert.equal(h.latest().intent.goal, '授权开发者');
    h.socket.emit('agentVisualUpdate', { intent: { goal: '太快' } }, v => { result = v; }); assert.equal(result.code, 'AGENT_VISUAL_RATE_LIMIT');
    const pending = fixture({ authorizePublish: async () => { throw Error('auth offline'); } });
    try { pending.socket.emit('agentVisualUpdate', {}, v => { result = v; }); await Promise.resolve(); await Promise.resolve();
      assert.equal(result.code, 'AGENT_VISUAL_PUBLISH_FORBIDDEN'); } finally { pending.bridge.dispose(); }
  } finally { h.bridge.dispose(); }
});
test('16 action players share a hub without crossing subjects or retaining records on shutdown', () => {
  const hub = createViewerAgentHub(), actors = Array.from({ length: 16 }, (_, i) => fixture({ hub,
    uuid: `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`, id: i + 1, name: `ag_demo${i}` }));
  let session = { mode: 'observer', attached: false };
  const eye = fixture({ hub, uuid: 'ffffffff-0000-0000-0000-000000000001', id: 99, name: 'live', getViewerSession: () => session });
  eye.bot.game.gameMode = 'spectator';
  try {
    actors.forEach((actor, i) => actor.bridge.publish({ intent: { goal: `独立任务 ${i}` } }));
    for (let i = 0; i < actors.length; i++) {
      session = { ...session, attached: true, playerUuid: actors[i].bot.uuid, playerName: actors[i].bot.username, entityId: i + 1 };
      eye.bridge.flush(); assert.equal(eye.latest().intent.goal, `独立任务 ${i}`);
    }
    assert.equal(hub.size, 16);
  } finally { eye.bridge.dispose(); actors.forEach(actor => actor.bridge.dispose()); }
  assert.equal(hub.size, 0);
});
