import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import chunkFactory from 'prismarine-chunk'
import { Vec3 } from 'vec3'
import { NativeWorldState, loadNativeStateRegistry, longNumber, attachNativeWorld } from '../native-world-host.mjs'

const rows = [
  { stateId: 777, name: 'minecraft:air', properties: {}, renderShape: 'INVISIBLE', hasBlockEntity: false },
  { stateId: 70001, name: 'mod:original_bricks', properties: { facing: 'north' }, renderShape: 'MODEL', hasBlockEntity: false },
  { stateId: 70002, name: 'create:shaft', properties: { axis: 'y' }, renderShape: 'MODEL', hasBlockEntity: true }
]
const bytes = Buffer.from(rows.map(r => JSON.stringify(r)).join('\n'))
const hash = createHash('sha256').update(bytes).digest('hex')
const states = loadNativeStateRegistry(bytes, hash)
const Chunk = chunkFactory('1.21.1')
function worldFixture () {
  const world = new NativeWorldState({ states, registrySha256: hash, simplifyNBT: x => x.value,
    resolveDimension: p => p.dimension === 3 ? { name: 'mod:actual_dimension', minY: -64, height: 384 } : null, now: () => 1000 })
  let sequence = 0
  const packet = (name, params) => world.handle({ registrySha256: hash, sequence: ++sequence, name, params })
  packet('login', { worldState: { dimension: 3 } })
  const chunk = new Chunk({ minY: -64, worldHeight: 384 })
  chunk.initialize(() => ({ stateId: 777, biome: 0, skyLight: 0, blockLight: 0 }))
  return { world, packet, chunk }
}
const pose = { x: -1.5, y: 64, z: -0.5, yaw: 0, pitch: 0, eyeHeight: 1.62 }

test('registry is byte-anchored and never accepts a proxy ID table or duplicates', () => {
  assert.throws(() => loadNativeStateRegistry(Buffer.from('changed'), hash), /HASH_MISMATCH/)
  const duplicate = Buffer.from(bytes.toString() + '\n' + JSON.stringify(rows[0]))
  assert.throws(() => loadNativeStateRegistry(duplicate, createHash('sha256').update(duplicate).digest('hex')), /INVALID/)
  assert.equal(states.get(70001).name, 'mod:original_bricks')
})

test('real serialized chunk keeps large native IDs, negative coordinates and block-entity speed', () => {
  const { world, packet, chunk } = worldFixture()
  chunk.setBlockStateId(new Vec3(14, 64, 15), 70002)
  packet('map_chunk', { x: -1, z: -1, chunkData: chunk.dump(), blockEntities: [{ x: 14, z: 15, y: 64, nbtData: { Speed: -32 } }] })
  world.setPose(pose)
  const snapshot = world.snapshot({ halfExtent: 1, below: 0, above: 0 })
  assert.deepEqual(snapshot.groups, [{ stateId: 70002, positions: [-2, 64, -1] }])
  assert.equal(snapshot.kinetic[0].speed, -32)
  assert.equal(snapshot.dimension.name, 'mod:actual_dimension')
  assert.equal(snapshot.mode, 'live_same_player_connection')
  assert.equal(snapshot.completeSceneParityVerified, false)
})

test('single and packed multi-block changes use absolute coordinates and clear stale machine NBT', () => {
  const { world, packet, chunk } = worldFixture()
  packet('map_chunk', { x: -1, z: -1, chunkData: chunk.dump(), blockEntities: [] })
  packet('block_change', { location: { x: -2, y: 64, z: -1 }, type: 70002 })
  packet('tile_entity_data', { location: { x: -2, y: 64, z: -1 }, nbtData: { Speed: 32 } })
  assert.equal(world.blockEntities.get('-2,64,-1').data.Speed, 32)
  packet('multi_block_change', { chunkCoordinates: { x: -1, y: 4, z: -1 }, records: [70001 * 4096 + (14 * 256 + 15 * 16)] })
  assert.equal(world.stateIdAt({ x: -2, y: 64, z: -1 }), 70001)
  assert.equal(world.blockEntities.has('-2,64,-1'), false)
})

test('unload and respawn discard old chunks and late changes do not recreate them', () => {
  const { world, packet, chunk } = worldFixture()
  packet('map_chunk', { x: -1, z: -1, chunkData: chunk.dump() })
  packet('unload_chunk', { chunkX: -1, chunkZ: -1 })
  packet('block_change', { location: { x: -1, y: 64, z: -1 }, type: 70001 })
  assert.equal(world.columns.size, 0)
  packet('map_chunk', { x: -1, z: -1, chunkData: chunk.dump() })
  world.setPose(pose)
  const epoch = world.epoch
  packet('respawn', { worldState: { dimension: 3 } })
  assert.equal(world.columns.size, 0)
  assert.equal(world.pose, null)
  assert.equal(world.epoch, epoch + 1)
  assert.equal(world.snapshot().type, 'waiting')
  assert.equal(world.snapshot().epoch, epoch + 1)
})

test('missing dimensions and stream gaps fail closed instead of keeping a stale world', () => {
  const { world } = worldFixture()
  world.handle({ registrySha256: hash, sequence: 3, name: 'update_time', params: { age: 1n, time: 1n } })
  assert.match(world.snapshot().reason, /SEQUENCE/)
  const other = worldFixture()
  other.packet('respawn', { worldState: { dimension: 99 } })
  assert.match(other.world.snapshot().reason, /DIMENSION/)
})

test('server clock preserves native long values and frozen day sign', () => {
  assert.equal(longNumber([-1, -5]), -5)
  assert.equal(longNumber([1, -1]), 8589934591)
  assert.throws(() => longNumber(9223372036854775807n), /TIME_INVALID/)
  const { world, packet } = worldFixture()
  packet('update_time', { age: 12345n, time: -6000n })
  assert.deepEqual(world.time, { age: 12345, day: -6000, receivedAt: 1000 })
})

test('attachment consumes just its supplied player stream and uses actual eye height', async () => {
  const { world } = worldFixture()
  const bot = { entity: { position: { x: 4, y: 64, z: 2 }, yaw: 0.5, pitch: 0.2, height: 1.8, eyeHeight: 1.27 } }
  const stream = { events: new EventEmitter() }
  const detach = attachNativeWorld({ bot, world, nativeStream: stream, intervalMs: 5 })
  try {
    await new Promise(resolve => setTimeout(resolve, 25))
    assert.equal(world.pose.eyeHeight, 1.27)
    assert.equal(stream.events.listenerCount('packet'), 1)
  } finally { detach() }
  assert.equal(stream.events.listenerCount('packet'), 0)
  assert.equal(stream.events.listenerCount('unavailable'), 0)
})
