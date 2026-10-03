import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { observeViewerSounds, viewerSoundPacket, viewerSoundStopPacket } from '../host/viewer-sound-packets.mjs';
import { observeViewerFishingCatch } from '../host/viewer-fishing.mjs';

describe('portable host sound bridge', () => {
  it('normalizes registry, direct, entity and stop sound packets', () => {
    const registry = { sounds: { 3: { name: 'entity.skeleton.shoot' } } };
    const packet = { sound: { soundId: 3 }, soundCategory: 'hostile', x: 32, y: 512, z: -64,
      volume: 1, pitch: 1.2, seed: [0, 19] };
    assert.deepEqual(viewerSoundPacket('sound_effect', packet, registry, () => null), {
      name: 'entity.skeleton.shoot', category: 'hostile', position: { x: 4, y: 64, z: -8 },
      volume: 1, pitch: 1.2, seed: '19',
    });
    assert.equal(viewerSoundPacket('sound_effect', { ...packet, sound: { data: {
      soundName: 'example:spell.wind', fixedRange: 30 } } }, registry, () => null)?.fixedRange, 30);
    assert.equal(viewerSoundPacket('entity_sound_effect', { ...packet, entityId: 12 },
      registry, () => null), null);
    assert.equal(viewerSoundPacket('entity_sound_effect', { ...packet, entityId: 12 },
      registry, () => ({ x: 1, y: 2, z: 3 }))?.entityId, 12);
    assert.deepEqual(viewerSoundStopPacket({ flags: 3, source: 2, sound: 'minecraft:music.game' }),
      { category: 'records', name: 'music.game' });
  });

  it('produces one sound per raw packet and removes its listeners', () => {
    const protocol = new EventEmitter(), sounds = [], stopped = [];
    const dispose = observeViewerSounds(protocol, { sounds: { 0: { name: 'music.game' } } },
      () => null, value => sounds.push(value), value => stopped.push(value));
    protocol.emit('sound_effect', { sound: { soundId: 0 }, soundCategory: 'music',
      x: 0, y: 512, z: 0, volume: 1, pitch: 1 });
    protocol.emit('soundEffectHeard', 'music.game', null, 1, 1);
    protocol.emit('stop_sound', { flags: 0 });
    assert.equal(sounds.length, 1);
    assert.deepEqual(stopped, [{}]);
    dispose();
    assert.deepEqual(protocol.eventNames(), []);
  });
});

function fishing() {
  let time = 1000;
  let clockReads = 0;
  const protocol = Object.assign(new EventEmitter(), { write() {} });
  const bot = Object.assign(new EventEmitter(), {
    _client: protocol, entity: { id: 7, position: { x: 0, y: 64, z: 0 } }, entities: {},
    heldItem: { name: 'fishing_rod' }, registry: { entitiesByName: { fishing_bobber: {
      internalId: 129, metadataKeys: [...Array(9).fill(''), 'biting'] }, item: { internalId: 58 } },
    particlesByName: { fishing: { id: 30 }, bubble: { id: 3 } } },
    inventory: Object.assign(new EventEmitter(), { slots: Array(46).fill(null), inventoryStart: 9 }),
  });
  const events = [], originalWrite = protocol.write;
  const serialize = item => item?.name && Number.isInteger(item.type) ? { ...item, metadata: 0 } : null;
  const dispose = observeViewerFishingCatch(bot, value => events.push(value), serialize,
    () => { clockReads++; return time; });
  return { bot, protocol, events, dispose, originalWrite, serialize, clockReads: () => clockReads,
    increment: () => { time += 50; } };
}

function catchOnce(s) {
  const item = { name: 'cod', type: 776, count: 1 };
  s.bot.entities[100] = { id: 100, name: 'fishing_bobber', position: { x: 5, y: 63, z: 0 } };
  s.protocol.emit('spawn_entity', { entityId: 100, type: 129, objectData: 7, x: 5, y: 63, z: 0 });
  s.protocol.emit('world_particles', { particle: { type: 'fishing' }, amount: 6, x: 5, y: 63, z: 0 });
  s.increment(); s.protocol.write('use_item', { hand: 0 });
  s.increment(); s.bot.entities[101] = { id: 101, name: 'item', getDroppedItem: () => item };
  s.protocol.emit('spawn_entity', { entityId: 101, type: 58, x: 5, y: 63, z: 0,
    velocity: { x: -4000, y: 2000, z: 0 } });
  s.protocol.emit('collect', { collectedEntityId: 101, collectorEntityId: 7, pickupItemCount: 1 });
  s.bot.inventory.slots[9] = item; s.bot.inventory.emit('updateSlot', 9);
}

describe('portable fishing catch bridge', () => {
  it('restores the original writer when viewers disconnect in registration order', () => {
    const s = fishing(), secondEvents = [];
    const secondDispose = observeViewerFishingCatch(s.bot, event => secondEvents.push(event), s.serialize, () => 1000);
    const sharedWrite = s.protocol.write;
    s.dispose();
    assert.equal(s.protocol.write, sharedWrite);
    catchOnce(s);
    assert.deepEqual(s.events, []);
    assert.equal(secondEvents.length, 1);
    secondDispose();
    assert.equal(s.protocol.write, s.originalWrite);
    assert.deepEqual(s.protocol.eventNames(), []);
    assert.deepEqual(s.bot.eventNames(), []);
    assert.deepEqual(s.bot.inventory.eventNames(), []);
  });

  it('shares one outgoing wrapper and restores it when newer viewers disconnect first', () => {
    const s = fishing(), sharedWrite = s.protocol.write;
    const secondDispose = observeViewerFishingCatch(s.bot, () => {}, s.serialize);
    assert.equal(s.protocol.write, sharedWrite);
    secondDispose();
    assert.equal(s.protocol.write, sharedWrite);
    catchOnce(s);
    assert.equal(s.events.length, 1);
    s.dispose();
    assert.equal(s.protocol.write, s.originalWrite);
  });

  it('preserves later foreign wrappers while disposed fishing callbacks remain inactive', () => {
    const s = fishing(), sharedWrite = s.protocol.write, sent = [];
    const foreignWrite = function (name, params) {
      sent.push({ name, params, receiver: this });
      sharedWrite.call(this, name, params);
    };
    s.protocol.write = foreignWrite;
    s.dispose();
    assert.equal(s.protocol.write, foreignWrite);
    const reads = s.clockReads(), params = { hand: 0 };
    s.protocol.write('use_item', params);
    assert.equal(s.clockReads(), reads);
    assert.deepEqual(sent, [{ name: 'use_item', params, receiver: s.protocol }]);
    const secondEvents = [];
    const secondDispose = observeViewerFishingCatch(s.bot, event => secondEvents.push(event), s.serialize, () => 1000);
    s.dispose();
    catchOnce(s);
    assert.equal(secondEvents.length, 1);
    secondDispose();
    assert.equal(s.protocol.write, foreignWrite);
    s.protocol.write('use_item', params);
    assert.equal(s.clockReads(), reads);
    assert.equal(sent.length, 3);
  });

  it('reports named enchanted treasure only after inventory confirms the collection', () => {
    const s = fishing();
    const treasure = { name: 'enchanted_book', type: 912, count: 1,
      displayName: 'The Sea Book', customName: 'The Sea Book', enchanted: true,
      components: [{ type: 'enchantments', data: { enchantments: [{ id: 3, level: 2 }] } }] };
    s.bot.entities[100] = { id: 100, name: 'fishing_bobber', position: { x: 5, y: 63, z: 0 } };
    s.protocol.emit('spawn_entity', { entityId: 100, type: 129, objectData: 7, x: 5, y: 63, z: 0 });
    s.protocol.emit('world_particles', { particle: { type: 'fishing' }, amount: 6, x: 5, y: 63, z: 0 });
    s.increment(); s.protocol.write('use_item', { hand: 0 });
    s.increment(); s.bot.entities[101] = { id: 101, name: 'item', position: { x: 5, y: 63, z: 0 },
      velocity: { x: 0, y: 0, z: 0 }, getDroppedItem: () => treasure };
    s.protocol.emit('spawn_entity', { entityId: 101, type: 58, x: 5, y: 63, z: 0,
      velocity: { x: -4000, y: 2000, z: 0 } });
    s.protocol.emit('collect', { collectedEntityId: 101, collectorEntityId: 7, pickupItemCount: 1 });
    assert.equal(s.events.length, 0);
    s.bot.inventory.slots[9] = treasure;
    s.bot.inventory.emit('updateSlot', 9);
    assert.equal(s.events.length, 1);
    assert.equal(s.events[0].item.customName, treasure.customName);
    assert.equal(s.events[0].item.enchanted, true);
    assert.deepEqual(s.events[0].item.components, treasure.components);
    s.bot.inventory.emit('updateSlot', 9);
    assert.equal(s.events.length, 1);
    s.dispose();
    assert.equal(s.protocol.write, s.originalWrite);
  });

  for (const reason of ['other owner', 'no bite', 'no reel', 'unrelated falling drop', 'other collector']) {
    it(`declines ${reason}`, () => {
      const s = fishing(), item = { name: 'cod', type: 776, count: 1 };
      s.bot.entities[100] = { id: 100, name: 'fishing_bobber', position: { x: 5, y: 63, z: 0 } };
      s.protocol.emit('spawn_entity', { entityId: 100, type: 129,
        objectData: reason === 'other owner' ? 8 : 7, x: 5, y: 63, z: 0 });
      if (reason !== 'no bite') s.protocol.emit('world_particles', {
        particle: { type: 'fishing' }, amount: 6, x: 5, y: 63, z: 0 });
      if (reason !== 'no reel') s.protocol.write('use_item', { hand: 0 });
      s.increment(); s.bot.entities[101] = { id: 101, name: 'item', getDroppedItem: () => item };
      s.protocol.emit('spawn_entity', { entityId: 101, type: 58, x: 5, y: 63, z: 0,
        velocity: reason === 'unrelated falling drop' ? { x: 0, y: -300, z: 0 } : { x: -4000, y: 2000, z: 0 } });
      s.protocol.emit('collect', { collectedEntityId: 101,
        collectorEntityId: reason === 'other collector' ? 8 : 7, pickupItemCount: 1 });
      s.bot.inventory.slots[9] = item; s.bot.inventory.emit('updateSlot', 9);
      assert.equal(s.events.length, 0);
      s.dispose();
    });
  }
});
