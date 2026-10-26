import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { transform } from 'esbuild';

const source = await fs.readFile(new URL('../../src/modern-viewer/client.js', import.meta.url), 'utf8');
const renderer = await fs.readFile(new URL('../../node_modules/minecraft-renderer/src/lib/worldrendererCommon.ts', import.meta.url), 'utf8');
const utils = await fs.readFile(new URL('../../node_modules/minecraft-renderer/src/lib/simpleUtils.ts', import.meta.url), 'utf8');
// Exercise the installed renderer's real distance precondition, including the
// same undefined.x error observed when a block delta preceded first position.
const distance = renderer.match(/  getDistance\(posAbsolute: Vec3\) \{[\s\S]*?\n  \}/)[0];
const chunkPos = utils.match(/export function chunkPos\([^]*?\n\}/)[0];
const distanceJs = (await transform(`${chunkPos.replace('export ', '')}\nclass DistanceRenderer { ${distance} }`, { loader: 'ts' })).code;
const flush = source.slice(source.indexOf('function flushPendingWorld()'), source.indexOf('\nfunction publishFirstPersonEntity('));
const apply = source.slice(source.indexOf('function applyPosition('), source.indexOf('\nfunction focusEntityById('));

function harness(position = null, ready = true) {
  const handlers = new Map(), events = [], noop = () => {};
  const context = vm.createContext({
    console, Map, Number, Math, isObsOverlay: false, rendererReady: ready, worldPositionReady: false,
    latestPosition: position, pendingPlayerEntity: null, pendingBlockEntities: null,
    pendingChunks: new Map(), pendingBlockUpdates: [], entityCache: new Map(),
    perceptionGrid: null, dungeonRoomCoverCache: null, viewer: { updateCamera: noop },
    usesWorldAvatar: false, manualControlActive: false, isFirstPersonView: false,
    socket: { on: (name, callback) => handlers.set(name, callback) },
    normalizePositionPacket: data => data, normalizeChunk: data => data, toVec3: data => data,
    boundedPush: (values, value, max) => { values.push(value); if (values.length > max) values.shift(); },
    syncSpecialBlockMaterials: () => events.push('special'), clearRemovedSpecialBlockMaterial: noop,
    refreshChunkLoadingGuards: noop, scheduleDungeonOcclusionCheck: noop,
    scheduleTrustedNpcAvatarRebalance: noop, applyServerTime: noop, applyServerWeather: noop,
    publishFirstPersonEntity: noop, applyAvatarState: noop, renderInventoryHud: noop,
    publishCameraDataset: noop, scheduleNpcPanelRender: noop,
  });
  vm.runInContext(`${distanceJs}\nworld = new DistanceRenderer();`, context);
  context.worldView = { emit: (event, data) => {
    events.push(event);
    if (event === 'chunkPosUpdate') context.world.viewerChunkPosition = data.pos;
    if (event === 'loadChunk' || event === 'blockUpdate') context.world.getDistance(data.pos ?? { x: data.x, z: data.z });
  } };
  vm.runInContext(`${apply}\n${flush}`, context);
  for (const name of ['position', 'loadChunk', 'unloadChunk', 'blockUpdate', 'blockEntities']) {
    const handler = source.match(new RegExp(`socket\\.on\\("${name}",[\\s\\S]*?\\n\\}\\);`));
    assert.ok(handler, name);
    vm.runInContext(handler[0], context);
  }
  return { context, handlers, events, flush: () => vm.runInContext('flushPendingWorld()', context) };
}

test('queued block delta requires actual position before replay, including already loaded assets', () => {
  const h = harness({ pos: { x: -420, y: 4, z: 680 }, yaw: 0, pitch: 0 });
  const update = { pos: { x: -421, y: 5, z: 671 }, stateId: 26583 };
  assert.throws(() => h.context.worldView.emit('blockUpdate', update), /reading 'x'/);
  h.events.length = 0;
  h.handlers.get('blockUpdate')(update);
  h.handlers.get('loadChunk')({ x: -432, z: 672, chunk: {} });
  assert.deepEqual(h.events, []);
  assert.doesNotThrow(h.flush);
  assert.equal(h.events[0], 'chunkPosUpdate');
  assert.equal(h.events.filter(e => e === 'blockUpdate').length, 1);
  assert.equal(h.context.pendingBlockUpdates.length, 0);
  assert.equal(h.context.pendingChunks.size, 0);
});

test('renderer waits for late first position without dropping terrain or special material state', () => {
  const h = harness();
  h.handlers.get('loadChunk')({ x: -432, z: 672, chunk: {} });
  h.handlers.get('blockUpdate')({ pos: { x: -430, y: 5, z: 680 }, stateId: 8846 });
  h.handlers.get('blockEntities')({ '-430,7,674': { sherds: ['minecraft:angler_pottery_sherd'] } });
  h.flush();
  assert.deepEqual(h.events, []);
  assert.equal(h.context.pendingBlockUpdates.length, 1);
  h.handlers.get('position')({ pos: { x: -420, y: 4, z: 680 }, yaw: 0, pitch: 0 });
  assert.equal(h.events[0], 'chunkPosUpdate');
  assert.ok(h.events.indexOf('special') > h.events.indexOf('chunkPosUpdate'));
  assert.ok(h.events.indexOf('blockEntities') > h.events.indexOf('loadChunk'));
  assert.equal(h.events.filter(e => e === 'blockUpdate').length, 1);
  const count = h.events.length;
  h.handlers.get('position')({ pos: { x: -419, y: 4, z: 680 }, yaw: 0, pitch: 0 });
  assert.deepEqual(h.events.slice(count), ['chunkPosUpdate'], 'ordinary motion must not replay the whole scene');
});

test('position before renderer readiness drains terrain only once initialization completes', () => {
  const h = harness(null, false);
  h.handlers.get('position')({ pos: { x: 8, y: 65, z: 8 }, yaw: 0, pitch: 0 });
  h.handlers.get('loadChunk')({ x: 0, z: 0, chunk: {} });
  h.handlers.get('unloadChunk')({ x: 0, z: 0 });
  h.handlers.get('blockUpdate')({ pos: { x: 8, y: 64, z: 8 }, stateId: 1 });
  h.flush();
  assert.deepEqual(h.events, []);
  h.context.rendererReady = true;
  h.flush();
  assert.equal(h.events[0], 'chunkPosUpdate');
  assert.ok(h.events.includes('unloadChunk'));
  assert.ok(!h.events.includes('loadChunk'), 'latest column event wins while initializing');
  h.handlers.get('blockUpdate')({ pos: { x: 8, y: 64, z: 8 }, stateId: 2 });
  assert.equal(h.events.at(-1), 'blockUpdate', 'live updates continue immediately');
});
