import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import chunkFactory from 'prismarine-chunk'
import { Vec3 } from 'vec3'
import { NativeWorldState, loadNativeStateRegistry, longNumber, longBigInt, nativeChunk, attachNativeWorld } from '../native-world-host.mjs'
import { waterGeometry } from '../../src/native-viewer/native-fluid.js'

const rows = [
  { stateId: 777, name: 'minecraft:air', properties: {}, renderShape: 'INVISIBLE', hasBlockEntity: false,
    fluid: { empty: true, name: 'minecraft:empty', height: 0 }, solid: false, blocksMotion: false, canOcclude: false, dynamicShape: false, occlusionBoxes: [] },
  { stateId: 70001, name: 'mod:original_bricks', properties: { facing: 'north' }, renderShape: 'MODEL', hasBlockEntity: false },
  { stateId: 70002, name: 'create:shaft', properties: { axis: 'y' }, renderShape: 'MODEL', hasBlockEntity: true },
  { stateId: 70003, name: 'farmersdelight:cutting_board', properties: { facing: 'west', waterlogged: 'false' }, renderShape: 'MODEL', hasBlockEntity: true },
  { stateId: 70004, name: 'minecraft:water', properties: { level: '0' }, renderShape: 'INVISIBLE', hasBlockEntity: false,
    fluid: { empty: false, name: 'minecraft:water', height: 8 / 9 }, solid: false, blocksMotion: false, canOcclude: false, dynamicShape: false, occlusionBoxes: [] }
]
const bytes = Buffer.from(rows.map(r => JSON.stringify(r)).join('\n'))
const hash = createHash('sha256').update(bytes).digest('hex')
const states = loadNativeStateRegistry(bytes, hash)
const Chunk = chunkFactory('1.21.1')
function worldFixture (registryStates = states, registryHash = hash) {
  const world = new NativeWorldState({ states: registryStates, registrySha256: registryHash, simplifyNBT: x => x.value,
    resolveDimension: p => p.dimension === 3 ? { name: 'mod:actual_dimension', minY: -64, height: 384 } : null, now: () => 1000 })
  let sequence = 0
  const packet = (name, params) => world.handle({ registrySha256: registryHash, sequence: ++sequence, name, params })
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

test('dense native global palettes preserve 17-bit modded state IDs after the 256-entry transition', () => {
  const denseStates = new Map(Array.from({ length: 300 }, (_, i) => [70000 + i, { stateId: 70000 + i }]))
  const source = nativeChunk({ minY: 0, worldHeight: 16 }, denseStates, 1)
  for (let i = 0; i < 300; i++) source.setBlockStateId(new Vec3(i % 16, Math.floor(i / 256), Math.floor(i / 16) % 16), 70000 + i)
  const target = nativeChunk({ minY: 0, worldHeight: 16 }, denseStates, 1)
  const encoded = source.dump()
  target.load(encoded)
  for (let i = 0; i < 300; i++) assert.equal(target.getBlockStateId(new Vec3(i % 16, Math.floor(i / 256), Math.floor(i / 16) % 16)), 70000 + i)
  assert.equal(target.maxBitsPerBlock, 17)
  const wrongWidth = Buffer.from(encoded); wrongWidth[2] = 16
  assert.throws(() => target.load(wrongWidth), /WIDTH_MISMATCH/)
  const wrongLength = Buffer.from(encoded); wrongLength[3]++
  assert.throws(() => target.load(wrongLength), /LENGTH_INVALID/)
})

test('received biome registry, hashed seed and neighboring blocks accompany native snapshots', () => {
  const { world, packet, chunk } = worldFixture()
  world.setBiomeRegistry({ id: 'minecraft:worldgen/biome', entries: [{ key: 'mod:real_plains', value: { value: { temperature: 0.8, downfall: 0.4, effects: { water_color: 0x3f76e4 } } } }] })
  packet('respawn', { worldState: { dimension: 3, hashedSeed: [-2147483648, 1] } })
  packet('map_chunk', { x: -1, z: -1, chunkData: chunk.dump() })
  world.setPose(pose)
  const snapshot = world.snapshot({ halfExtent: 1, below: 0, above: 0 })
  assert.equal(snapshot.biomeSeed, '-9223372036854775807')
  assert.equal(snapshot.biomes[0].name, 'mod:real_plains')
  assert.ok(snapshot.biomeGrid.ids.includes(0))
  assert.equal(snapshot.neighbors.length, 0) // Air is not repeated without a fluid stencil needing it.
  assert.equal(world.biomeIdAtQuart(-1, 16, -1), 0)
  assert.equal(longBigInt([-1, -1]), -1n)
})

test('missing configured biome values fail closed rather than substituting vanilla climates', () => {
  const { world } = worldFixture()
  world.setBiomeRegistry({ id: 'minecraft:worldgen/biome', entries: [{ key: 'minecraft:plains', value: null }] })
  assert.match(world.snapshot().reason, /BIOME_REGISTRY_INCOMPLETE/)
})

test('empty, loaded and cleared cutting boards come only from this stream and change snapshot inputs', () => {
  const { world, packet, chunk } = worldFixture()
  const position = { x: -2, y: 64, z: -1 }
  chunk.setBlockStateId(new Vec3(14, 64, 15), 70003)
  const empty = { IsItemCarved: 0, Inventory: { Size: 1, Items: [] } }
  packet('map_chunk', { x: -1, z: -1, chunkData: chunk.dump(), blockEntities: [{ x: 14, z: 15, y: 64, nbtData: empty }] })
  world.setPose(pose)
  const before = world.snapshot({ halfExtent: 1, below: 0, above: 0 })
  assert.deepEqual(before.cuttingBoards, [{ position, stateId: 70003, content: 'empty' }])
  assert.equal(before.completeSceneParityVerified, false)

  packet('tile_entity_data', { location: position, nbtData: { IsItemCarved: 0,
    Inventory: { Size: 1, Items: [{ count: 1, Slot: 0, id: 'minecraft:mangrove_log', components: { 'mod:native_owner': 'private-value' } }] } } })
  const loaded = world.snapshot({ halfExtent: 1, below: 0, above: 0 })
  assert.deepEqual(loaded.groups, before.groups)
  assert.equal(loaded.cuttingBoards[0].content, 'occupied')
  assert.deepEqual(loaded.cuttingBoards[0].storedItem, { id: 'minecraft:mangrove_log', count: 1 })
  assert(!JSON.stringify(loaded.cuttingBoards).includes('private-value'))
  assert.notEqual(JSON.stringify(loaded.cuttingBoards), JSON.stringify(before.cuttingBoards))

  packet('tile_entity_data', { location: position, nbtData: empty })
  assert.deepEqual(world.snapshot({ halfExtent: 1, below: 0, above: 0 }).cuttingBoards, before.cuttingBoards)
})

test('missing, cleared or replaced cutting-board data cannot reuse an old empty inventory', () => {
  const { world, packet, chunk } = worldFixture()
  const position = { x: -2, y: 64, z: -1 }
  chunk.setBlockStateId(new Vec3(14, 64, 15), 70003)
  packet('map_chunk', { x: -1, z: -1, chunkData: chunk.dump(), blockEntities: [] })
  world.setPose(pose)
  const board = () => world.snapshot({ halfExtent: 1, below: 0, above: 0 }).cuttingBoards[0]
  assert.equal(board().content, 'unknown')
  assert.equal(board().reason, 'NATIVE_CUTTING_BOARD_ENTITY_NOT_RECEIVED')
  packet('tile_entity_data', { location: position, nbtData: { IsItemCarved: 0, Inventory: { Size: 1, Items: [] } } })
  assert.equal(board().content, 'empty')
  packet('tile_entity_data', { location: position, nbtData: null })
  assert.equal(board().content, 'unknown')
  packet('tile_entity_data', { location: position, nbtData: { IsItemCarved: 0, Inventory: { Size: 1, Items: [] } } })
  packet('block_change', { location: position, type: 70001 })
  packet('block_change', { location: position, type: 70003 })
  assert.equal(board().content, 'unknown')
  packet('unload_chunk', { chunkX: -1, chunkZ: -1 })
  assert.deepEqual(world.snapshot({ halfExtent: 1, below: 0, above: 0 }).cuttingBoards, [])
})

const groupPoints = snapshot => snapshot.groups.flatMap(group => Array.from({ length: group.positions.length / 3 }, (_, i) =>
  ({ x: group.positions[i * 3], y: group.positions[i * 3 + 1], z: group.positions[i * 3 + 2], stateId: group.stateId })))

test('a rooftop default view includes actual ground, a farther building, native biomes and block-entity state', () => {
  const { world, packet, chunk } = worldFixture()
  world.setBiomeRegistry({ id: 'minecraft:worldgen/biome', entries: [{ key: 'mod:real_plains', value: { value: {
    temperature: 0.8, downfall: 0.4, effects: { water_color: 0x3f76e4 }
  } } }] })
  chunk.setBlockStateId(new Vec3(8, 60, 8), 70001)
  chunk.setBlockStateId(new Vec3(9, 61, 8), 70002)
  packet('map_chunk', { x: 0, z: 0, chunkData: chunk.dump(), blockEntities: [{ x: 9, y: 61, z: 8, nbtData: { Speed: -16, Overstressed: 0 } }] })
  const next = new Chunk({ minY: -64, worldHeight: 384 })
  next.initialize(() => ({ stateId: 777, biome: 0, skyLight: 0, blockLight: 0 }))
  next.setBlockStateId(new Vec3(10, 70, 8), 70001)
  packet('map_chunk', { x: 1, z: 0, chunkData: next.dump() })
  world.setPose({ ...pose, x: 8.5, y: 72, z: 8.5 })
  assert.deepEqual(world.snapshot({ halfExtent: 10, below: 5, above: 10 }).groups, [])
  const snapshot = world.snapshot()
  assert.deepEqual(snapshot.bounds, { minX: -16, maxX: 32, minY: 48, maxY: 96, minZ: -16, maxZ: 32 })
  assert.deepEqual(groupPoints(snapshot), [
    { x: 8, y: 60, z: 8, stateId: 70001 }, { x: 26, y: 70, z: 8, stateId: 70001 }, { x: 9, y: 61, z: 8, stateId: 70002 }
  ])
  assert.equal(snapshot.kinetic[0].speed, -16)
  assert.equal(snapshot.states.find(s => s.stateId === 70001).properties.facing, 'north')
  assert.equal(snapshot.biomes[0].name, 'mod:real_plains')
  assert.equal(snapshot.biomes[0].effects.water_color, 0x3f76e4)
  assert.deepEqual(snapshot.viewCoverage.receivedColumns, ['0,0', '1,0'])
  assert.equal(snapshot.viewCoverage.horizontalRangeReduced, false)
  assert.equal(snapshot.viewCoverage.verticalRangeLimited, true)
  assert.equal(snapshot.completeSceneParityVerified, false)
})

test('fluid-only exact neighbor stencils are deduplicated and cover every real waterGeometry read', () => {
  const { world, packet, chunk } = worldFixture()
  chunk.setBlockStateId(new Vec3(7, 64, 7), 70004)
  chunk.setBlockStateId(new Vec3(8, 64, 7), 70004)
  packet('map_chunk', { x: 0, z: 0, chunkData: chunk.dump() })
  world.setPose({ ...pose, x: 7, z: 7 })
  const snapshot = world.snapshot({ halfExtent: 2, below: 2, above: 2 })
  const neighbors = new Map(), definitions = new Map(snapshot.states.map(s => [s.stateId, s]))
  for (let i = 0; i < snapshot.neighbors.length; i += 4) neighbors.set(snapshot.neighbors.slice(i, i + 3).join(','), definitions.get(snapshot.neighbors[i + 3]))
  assert.equal(neighbors.size, 36)
  assert.equal(snapshot.neighbors.length, neighbors.size * 4)
  const accessed = new Set()
  const get = p => { const k = `${p.x},${p.y},${p.z}`; accessed.add(k); assert(neighbors.has(k), `missing exact fluid neighbor ${k}`); return neighbors.get(k) }
  for (const x of [7, 8]) assert(waterGeometry({ x, y: 64, z: 7 }, get).quads.length > 0)
  assert(accessed.has('6,65,6')) // diagonal above, required for the top backface.
  assert(accessed.has('6,63,7')) // sideways below, required for fluid flow.
  assert.equal(neighbors.get('6,64,7').stateId, 777)
  assert.equal(snapshot.viewCoverage.fluidNeighborVoxels, 36)
  assert.equal(snapshot.viewCoverage.neighborCoverage, 'fluid_stencil_only')
})

test('waterlogged mod blocks retain exact native definitions and neighbor inputs without claiming a fluid provider', () => {
  const native = { ...rows[4], stateId: 70005, name: 'mod:wet_frame', renderShape: 'MODEL',
    properties: { facing: 'south', waterlogged: 'true' }, dynamicShape: true, occlusionUnavailable: true }
  const data = Buffer.from([...rows, native].map(r => JSON.stringify(r)).join('\n'))
  const nativeHash = createHash('sha256').update(data).digest('hex')
  const { world, packet, chunk } = worldFixture(loadNativeStateRegistry(data, nativeHash), nativeHash)
  chunk.setBlockStateId(new Vec3(7, 64, 7), 70005)
  packet('map_chunk', { x: 0, z: 0, chunkData: chunk.dump() })
  world.setPose({ ...pose, x: 7, z: 7 })
  const snapshot = world.snapshot({ halfExtent: 1, below: 0, above: 0 })
  assert.deepEqual(snapshot.groups, [{ stateId: 70005, positions: [7, 64, 7] }])
  assert.deepEqual(snapshot.states.find(s => s.stateId === 70005), native)
  assert.equal(snapshot.neighbors.length / 4, 27)
  assert.equal(snapshot.completeSceneParityVerified, false)
})

test('an unloaded fluid neighbor stays unknown and later unload removes its actual snapshot content', () => {
  const { world, packet, chunk } = worldFixture()
  chunk.setBlockStateId(new Vec3(15, 64, 7), 70004)
  packet('map_chunk', { x: 0, z: 0, chunkData: chunk.dump() })
  world.setPose({ ...pose, x: 15, z: 7 })
  const snapshot = world.snapshot({ halfExtent: 1, below: 0, above: 0 })
  assert(snapshot.missingColumns.includes('1,0'))
  assert.equal(snapshot.neighbors.some((n, i, a) => i % 4 === 0 && n === 16), false)
  assert.equal(snapshot.viewCoverage.unloadedColumns, 'unknown')
  packet('unload_chunk', { chunkX: 0, chunkZ: 0 })
  const unloaded = world.snapshot({ halfExtent: 1, below: 0, above: 0 })
  assert.deepEqual(unloaded.groups, []); assert.deepEqual(unloaded.neighbors, [])
  assert.deepEqual(unloaded.viewCoverage.receivedColumns, [])
})

function denseFixture ({ x = 0, z = 0, stateId = 70001 } = {}) {
  const { world, packet, chunk } = worldFixture()
  chunk.initialize(() => ({ stateId, biome: 0, skyLight: 0, blockLight: 0 }))
  const data = chunk.dump()
  for (let cz = Math.floor((z - 32) / 16); cz <= Math.floor((z + 32) / 16); cz++)
    for (let cx = Math.floor((x - 32) / 16); cx <= Math.floor((x + 32) / 16); cx++) packet('map_chunk', { x: cx, z: cz, chunkData: data })
  world.setPose({ ...pose, x, z })
  return world
}

test('dense native terrain respects scan/render budgets by shrinking only a complete horizontal volume', t => {
  const world = denseFixture()
  const start = performance.now(), snapshot = world.snapshot({ halfExtent: 32, below: 48, above: 48 })
  t.diagnostic(`dense complete-volume snapshot: ${(performance.now() - start).toFixed(1)} ms, ${Buffer.byteLength(JSON.stringify(snapshot))} bytes`)
  assert(snapshot.viewCoverage.clippedBy.includes('scan_budget'))
  assert(snapshot.viewCoverage.clippedBy.includes('render_budget'))
  assert(snapshot.viewCoverage.scannedVoxels <= snapshot.viewCoverage.limits.maxScanVoxels)
  assert(snapshot.viewCoverage.nonAirBlocks <= snapshot.viewCoverage.limits.maxRenderBlocks)
  const b = snapshot.bounds, count = (b.maxX - b.minX + 1) * (b.maxY - b.minY + 1) * (b.maxZ - b.minZ + 1)
  assert.equal(groupPoints(snapshot).length, count)
  assert.equal(snapshot.bounds.minY, 16); assert.equal(snapshot.bounds.maxY, 112)
  assert.deepEqual(snapshot.neighbors, [])
  assert(snapshot.viewCoverage.horizontalRangeReduced)
  assert.equal(world.columns.size, 25) // Taking a snapshot did not query or load new columns.
})

test('large absolute coordinates and dense water stay below the event budget without omitting in-bounds blocks', t => {
  for (const stateId of [70001, 70004]) {
    const world = denseFixture({ x: 29999000, z: -29999000, stateId })
    const start = performance.now(), snapshot = world.snapshot()
    const bytes = Buffer.byteLength(JSON.stringify(snapshot))
    t.diagnostic(`${stateId === 70004 ? 'water' : 'large-coordinate solid'} snapshot: ${(performance.now() - start).toFixed(1)} ms, ${bytes} bytes`)
    assert.equal(snapshot.type, 'snapshot')
    assert(bytes <= snapshot.viewCoverage.limits.maxSnapshotBytes)
    assert(snapshot.viewCoverage.clippedBy.includes('event_byte_budget'))
    const b = snapshot.bounds
    assert.equal(groupPoints(snapshot).length, (b.maxX - b.minX + 1) * (b.maxY - b.minY + 1) * (b.maxZ - b.minZ + 1))
    assert(snapshot.groups[0].positions.includes(29999000))
    assert(snapshot.groups[0].positions.includes(-29999000))
    assert(snapshot.viewCoverage.scannedVoxels <= snapshot.viewCoverage.limits.maxScanVoxels)
    assert(snapshot.viewCoverage.scanWorkVoxels < 1000000)
  }
})

test('dimensions and invalid caller bounds remain explicit instead of inventing ground outside received world height', () => {
  const { world, packet, chunk } = worldFixture()
  packet('map_chunk', { x: 0, z: 0, chunkData: chunk.dump() })
  world.setPose({ ...pose, x: 8, y: 318, z: 8 })
  const upper = world.snapshot()
  assert.equal(upper.bounds.maxY, 319); assert.equal(upper.bounds.minY, 294)
  world.setPose({ ...pose, x: 8, y: -63, z: 8 })
  assert.equal(world.snapshot().bounds.minY, -64)
  world.setPose({ ...pose, x: 8, y: 400, z: 8 })
  assert.equal(world.snapshot().bounds.minY, 319); assert.equal(world.snapshot().bounds.maxY, 319)
  for (const options of [{ halfExtent: 33 }, { halfExtent: 0 }, { below: -1 }, { below: 49, above: 49 }, { above: 0.5 }])
    assert.throws(() => world.snapshot(options), /BOUNDS_INVALID/)
})

test('a native definition that cannot fit even the minimum volume fails explicitly without stripping its data', () => {
  const largeState = { ...rows[1], properties: { original_mod_input: 'x'.repeat(1600 * 1024) } }
  const data = Buffer.from([rows[0], largeState].map(r => JSON.stringify(r)).join('\n'))
  const nativeHash = createHash('sha256').update(data).digest('hex')
  const { world, packet, chunk } = worldFixture(loadNativeStateRegistry(data, nativeHash), nativeHash)
  chunk.setBlockStateId(new Vec3(7, 64, 7), 70001)
  packet('map_chunk', { x: 0, z: 0, chunkData: chunk.dump() })
  world.setPose({ ...pose, x: 7, z: 7 })
  const snapshot = world.snapshot({ halfExtent: 1, below: 0, above: 0 })
  assert.equal(snapshot.type, 'unavailable')
  assert.equal(snapshot.reason, 'NATIVE_WORLD_SNAPSHOT_BUDGET_EXCEEDED')
  assert(snapshot.viewCoverage.clippedBy.includes('event_byte_budget'))
  assert.equal(world.error, null) // The received native world is valid; only this bounded view cannot be encoded.
  assert.equal(world.states.get(70001).properties.original_mod_input.length, 1600 * 1024)
  assert.equal(world.columns.size, 1)
})
