import { EventEmitter } from 'node:events';
import test from 'node:test';
import assert from 'node:assert/strict';
import { observeVanillaNativeStream, vanillaPlayerPresentation } from '../../host/vanilla-native-stream.mjs';

test('observes the same action connection, preserving native bytes and contiguous sequence', () => {
  const bot = { version: '1.21.1', _client: new EventEmitter() }, hash = 'a'.repeat(64);
  const stream = observeVanillaNativeStream(bot, hash), received = [];
  stream.events.on('packet', p => received.push(p));
  bot._client.emit('packet', {}, { name: 'login', state: 'login' });
  const chunk = { x: 1, z: 2, chunkData: Buffer.from([1, 2, 3]) };
  bot._client.emit('packet', {}, { name: 'login', state: 'play' });
  bot._client.emit('packet', {}, { name: 'keep_alive', state: 'play' });
  bot._client.emit('packet', chunk, { name: 'map_chunk', state: 'play' });
  assert.deepEqual(received.map(p => p.sequence), [1, 2]);
  assert.equal(received[1].params, chunk);
  assert.equal(received[1].registrySha256, hash);
  stream.close();
  assert.equal(bot._client.listenerCount('packet'), 0);
});

test('vanilla inventory belongs to this body and does not invent item components', () => {
  const bot = { version: '1.21.1', _client: { uuid: 'player-a' }, quickBarSlot: 2,
    inventory: { slots: [null, { name: 'oak_planks', count: 18 }] } };
  const state = vanillaPlayerPresentation(bot);
  assert.equal(state.playerUuid, 'player-a');
  assert.equal(state.inventory.selectedHotbarSlot, 2);
  assert.deepEqual(state.inventory.slots[1], { slot: 1, item: { name: 'minecraft:oak_planks', count: 18 } });
  assert.equal(state.nativeState.componentsAvailable, false);
  assert.equal(vanillaPlayerPresentation({ ...bot, version: '1.20.6' }), null);
  assert.equal(vanillaPlayerPresentation({ ...bot, _client: {} }), null);
});
