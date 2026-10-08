import assert from 'node:assert/strict';
import { test } from 'node:test';
import Chunks from 'prismarine-chunk';
import MinecraftData from 'minecraft-data';
import { RoomCoverCache } from '../../src/modern-viewer/room-cover-cache.js';
import { hasRoomCeiling } from '../../src/modern-viewer/room-visibility.js';

const version = '1.20.6';
const Chunk = Chunks(version);
const data = MinecraftData(version);
const state = name => data.blocksByName[name].defaultState;

test('streamed leaf and glass roofs trigger visibility even without camera collision', () => {
  for (const name of ['oak_leaves', 'moss_block', 'glass', 'stone_slab']) {
    const chunk = new Chunk();
    for (const [x, z] of [[3, 3], [4, 3], [3, 4]]) chunk.setBlockStateId({ x, y: 92, z }, state(name));
    const cache = new RoomCoverCache(version);
    cache.ingestColumn(-16, -16, chunk.toJson());
    assert.deepEqual(cache.diagnostics, { columns: 1, decodedSections: 0 });
    assert.equal(hasRoomCeiling({ x: -12.7, y: 64.3, z: -12.7 }, cache), true, name);
    assert.ok(cache.diagnostics.decodedSections <= 3, 'only vertical sections queried by the roof scan are decoded');
    cache.removeColumn(-16, -16);
    assert.equal(hasRoomCeiling({ x: -12.7, y: 64.3, z: -12.7 }, cache), false);
    assert.deepEqual(cache.diagnostics, { columns: 0, decodedSections: 0 });
  }
});

test('replacement chunks, block changes and negative heights cannot leave stale cover', () => {
  const chunk = new Chunk();
  const cache = new RoomCoverCache(version);
  cache.ingestColumn(0, 0, chunk.toJson());
  const avatar = { x: 2, y: -32, z: 2 };
  for (const [x, z] of [[2, 2], [3, 2], [2, 3]]) cache.setBlockStateId(x, -22, z, state('oak_leaves'));
  assert.equal(hasRoomCeiling(avatar, cache), true);
  cache.setBlockStateId(2, -22, 2, state('air'));
  assert.equal(hasRoomCeiling(avatar, cache), false);
  cache.ingestColumn(0, 0, chunk.toJson());
  assert.equal(cache.isSolidBlock(3, -22, 2), false);
  assert.equal(cache.isSolidBlock(2, -65, 2), false);
});

test('fluids and plants do not count as roofs', () => {
  const cache = new RoomCoverCache(version);
  cache.ingestColumn(0, 0, new Chunk().toJson());
  for (const name of ['air', 'water', 'lava', 'short_grass']) {
    cache.setBlockStateId(2, 66, 2, state(name));
    assert.equal(cache.isSolidBlock(2, 66, 2), false, name);
  }
});
