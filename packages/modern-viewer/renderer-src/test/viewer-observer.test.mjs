import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createViewerObserverBridge } from '../host/viewer-observer.mjs';
const a = '00000000-0000-0000-0000-000000000001', b = '00000000-0000-0000-0000-000000000002';
function fixture(options) {
  const bot = new EventEmitter(); bot._client = new EventEmitter(); bot._client.state = 'play';
  bot._client.write = () => {}; bot.uuid = a;
  const bridge = createViewerObserverBridge(bot, options); const socket = new EventEmitter(), events = [];
  const emit = socket.emit.bind(socket); socket.emit = (event, value) => { events.push([event, value]); return emit(event, value); };
  bridge.subscribeSocket(socket);
  const state = (entityId = 8, playerUuid = b) => ({ schemaVersion: 1, viewerSession: { mode: 'observer', attached: true,
    recipientUuid: a, playerUuid, playerName: 'Player', worldUuid: a, entityId, windowOpen: true },
    vitals: { health: 7 }, mana: { current: 3, max: 20 }, skills: [], abilities: [] });
  const payload = value => bot._client.emit('custom_payload', { channel: 'mcviewer:state', data: Buffer.from(JSON.stringify(value)) });
  return { bot, bridge, events, state, payload };
}
test('only this connection and its actual camera receive server-attested state', () => {
  const h = fixture(); try {
    h.payload(h.state()); assert.equal(h.bridge.snapshot(), null);
    h.bot._client.emit('camera', { cameraId: 8 }); assert.equal(h.bridge.snapshot().vitals.health, 7);
    h.payload({ ...h.state(), viewerSession: { ...h.state().viewerSession, recipientUuid: b } });
    assert.equal(h.bridge.snapshot().viewerSession.recipientUuid, a);
    h.bot._client.emit('camera', { cameraId: 9 }); assert.equal(h.bridge.snapshot(), null);
    assert.ok(h.events.some(([name, value]) => name === 'containerState' && value === null));
  } finally { h.bridge.dispose(); }
});
test('queued target switch, real close packets and respawn clear old UI', () => {
  const h = fixture(); try {
    h.bot._client.emit('camera', { cameraId: 8 }); h.payload(h.state());
    h.payload(h.state(9, a)); h.bot._client.emit('camera', { cameraId: 9 });
    assert.equal(h.bridge.snapshot().viewerSession.entityId, 9);
    const n = h.events.length; h.bot.emit('windowClose');
    assert.deepEqual(h.events.slice(n), [['containerState', null]]);
    h.bot._client.emit('respawn', {}); assert.equal(h.bridge.snapshot(), null);
  } finally { h.bridge.dispose(); }
});

test('native containers publish only for the attested camera and stop on close or switch', () => {
  const h = fixture({ serializeWindow: window => ({ id: window.id, slots: window.slots }) });
  const window = Object.assign(new EventEmitter(), { id: 4, slots: ['original'] });
  try {
    h.bot.emit('windowOpen', window);
    assert.ok(!h.events.some(([event, value]) => event === 'containerState' && value));
    h.bot._client.emit('camera', { cameraId: 8 }); h.payload(h.state());
    assert.deepEqual(h.events.at(-1), ['containerState', { id: 4, slots: ['original'] }]);
    h.bot.emit('windowClose'); const n = h.events.length;
    window.emit('updateSlot'); assert.equal(h.events.length, n);
    h.bot.emit('windowOpen', window); h.bot._client.emit('camera', { cameraId: 9 });
    const after = h.events.length; window.emit('updateSlot'); assert.equal(h.events.length, after);
  } finally { h.bridge.dispose(); }
});
