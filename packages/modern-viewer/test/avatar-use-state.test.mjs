import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeAvatarState } from '../src/mc-modern-viewer.mts';

const bot = (flags, usingHeldItem = false) => ({ version: '1.20.6', quickBarSlot: 0, usingHeldItem,
  entity: { id: 1, name: 'player', position: { x: 0, y: 64, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, metadata: { 0: 0, 8: flags }, onGround: true },
  inventory: { slots: Array(46).fill(null), hotbarStart: 36 }, registry: {}, controlState: {} });
test('avatar stream preserves native main/offhand use flags and the Mineflayer local use signal', () => {
  for (const [flags, usingHeldItem, usingOffhand] of [[0, false, false], [1, true, false], [3, true, true]]) {
    const packet = serializeAvatarState(bot(flags));
    assert.equal(packet.usingHeldItem, usingHeldItem); assert.equal(packet.usingOffhand, usingOffhand);
  }
  assert.equal(serializeAvatarState(bot(0, true)).usingHeldItem, true);
});
test('the use stream never reads another tracked player as the action player', () => {
  const own = bot(0); own.entities = { 2: { id: 2, metadata: { 8: 3 } } };
  const packet = serializeAvatarState(own);
  assert.equal(packet.entity.id, 1); assert.equal(packet.usingHeldItem, false); assert.equal(packet.usingOffhand, false);
});
