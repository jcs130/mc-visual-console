import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { serialize, deserialize } from 'node:v8'
import chunkFactory from 'prismarine-chunk'
import { Vec3 } from 'vec3'
import { NativeWorldState, loadNativeStateRegistry, loadNativeEntityRegistry, longNumber, longBigInt, nativeChunk, attachNativeWorld } from '../native-world-host.mjs'
import { waterGeometry } from '../../src/native-viewer/native-fluid.js'

const rows = [
  { stateId: 777, name: 'minecraft:air', properties: {}, renderShape: 'INVISIBLE', hasBlockEntity: false,
    fluid: { empty: true, name: 'minecraft:empty', height: 0 }, solid: false, blocksMotion: false, canOcclude: false, dynamicShape: false, occlusionBoxes: [] },
  { stateId: 70001, name: 'mod:original_bricks', properties: { facing: 'north' }, renderShape: 'MODEL', hasBlockEntity: false },
  { stateId: 70002, name: 'create:shaft', properties: { axis: 'y' }, renderShape: 'MODEL', hasBlockEntity: true },
  { stateId: 70003, name: 'farmersdelight:cutting_board', properties: { facing: 'west', waterlogged: 'false' }, renderShape: 'MODEL', hasBlockEntity: true },
  { stateId: 70004, name: 'minecraft:water', properties: { level: '0' }, renderShape: 'INVISIBLE', hasBlockEntity: false,
    fluid: { empty: false, name: 'minecraft:water', height: 8 / 9 }, solid: false, blocksMotion: false, canOcclude: false, dynamicShape: false, occlusionBoxes: [] },
  { stateId: 70190, name: 'create:millstone', properties: {}, renderShape: 'MODEL', hasBlockEntity: true }
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
const optionalMetadataTypes = ['optional_component', 'optional_block_pos', 'optional_uuid', 'optional_global_pos']
// The deployment's locked minecraft-protocol can be supplied without adding
// a runtime dependency to the browser renderer. CI with that package uses its
// normal resolution; host-only regressions below always run independently.
let metadataCodec = null
try {
  metadataCodec = createRequire(import.meta.url)(process.env.NATIVE_METADATA_CODEC_MODULE || 'minecraft-protocol/src/transforms/serializer.js')
} catch (error) {
  if (process.env.NATIVE_METADATA_CODEC_MODULE || error.code !== 'MODULE_NOT_FOUND') throw error
}

function entityFixture (extraRegistry = '') {
  const registryBytes = Buffer.from('minecraft:slime\t93\nexample:actual_mob\t300\n' + extraRegistry)
  const entityRegistrySha256 = createHash('sha256').update(registryBytes).digest('hex')
  const world = new NativeWorldState({ states, registrySha256: hash, entityRegistry: loadNativeEntityRegistry(registryBytes, entityRegistrySha256), entityRegistrySha256,
    resolveDimension: () => ({ name: 'minecraft:overworld', minY: 0, height: 256 }), simplifyNBT: value => value, now: () => 1000 })
  let sequence = 0
  const packet = (name, params) => world.handle({ registrySha256: hash, sequence: ++sequence, name, params })
  packet('login', {})
  const spawn = (entityId = 12, type = 93) => packet('spawn_entity', { entityId, type, objectUUID: '12345678-1234-5678-1234-567812345678', x: -10.25, y: 64, z: 5.5, yaw: -64, pitch: 16, headPitch: 32, velocity: { x: 800, y: -400, z: 0 } })
  return { world, packet, spawn, registryBytes, entityRegistrySha256 }
}

test('actual hurt and TLM animation cues only attach to already received identities', () => {
  const { world, packet, spawn } = entityFixture('touhou_little_maid:maid\t131\n')
  packet('maid_animation', { entityId: 99, animationId: 1, sourceChannel: 'touhou_little_maid:maid_animation' })
  assert.equal(world.entities.size, 0)
  spawn(12, 131)
  packet('hurt_animation', { entityId: 12, yaw: 38.25 })
  packet('maid_animation', { entityId: 12, animationId: 1, sourceChannel: 'touhou_little_maid:maid_animation' })
  const result = world.entitySnapshot()
  assert.equal(result.available, true)
  assert.deepEqual(result.entities[0].cues.map(cue => cue.kind), ['hurt_animation', 'maid_animation'])
  assert.equal(result.entities[0].cues[0].yaw, 38.25)
  packet('hurt_animation', { entityId: 12, yaw: NaN })
  assert.equal(world.entitySnapshot().reason, 'NATIVE_ENTITY_HURT_ANIMATION_INVALID')
  assert.equal(world.error, null)
})

test('native entity registry is hash anchored with no proxy fallback or duplicate names', () => {
  const { registryBytes, entityRegistrySha256 } = entityFixture()
  assert.throws(() => loadNativeEntityRegistry(Buffer.from('minecraft:pig\t93'), entityRegistrySha256), /HASH_MISMATCH/)
  for (const text of ['minecraft:slime\t93\nexample:mob\t93', 'minecraft:slime\t93\nminecraft:slime\t94', 'minecraft:slime\tNaN']) {
    const bytes = Buffer.from(text)
    assert.throws(() => loadNativeEntityRegistry(bytes, createHash('sha256').update(bytes).digest('hex')), /INVALID/)
  }
})

test('native spawn, signed-byte angles and quantized movement preserve original registry identity', () => {
  const { world, packet, spawn } = entityFixture()
  spawn(12, 300)
  const before = world.revision
  packet('entity_move_look', { entityId: 12, dX: -2048, dY: 1024, dZ: 4096, yaw: 64, pitch: -32, onGround: true })
  packet('entity_head_rotation', { entityId: 12, headYaw: -128 })
  const state = world.entitySnapshot()
  assert.equal(state.source, 'received_native_entity_packets')
  assert.equal(state.available, true)
  assert.equal(state.rotationUnit, 'minecraft_degrees')
  assert.equal(state.entities[0].name, 'example:actual_mob')
  assert.equal(state.entities[0].typeId, 300)
  assert.deepEqual(state.entities[0].position, { x: -10.75, y: 64.25, z: 6.5 })
  assert.equal(state.entities[0].yaw, 90)
  assert.equal(state.entities[0].pitch, -45)
  assert.equal(state.entities[0].headYaw, -180)
  assert.equal(state.entities[0].onGround, true)
  assert.deepEqual(state.entities[0].velocity, { x: 0.1, y: -0.05, z: 0 })
  assert.equal(world.revision, before, 'entity movement does not rescan terrain')
})

test('partial metadata and actual equipment persist, while unsupported types remain native', () => {
  const { world, packet, spawn } = entityFixture()
  spawn()
  assert.equal(world.entitySnapshot().entities[0].onGround, null)
  packet('entity_metadata', { entityId: 12, metadata: [{ key: 16, type: 'int', value: 4 }, { key: 0, type: 'byte', value: 0 }] })
  packet('entity_metadata', { entityId: 12, metadata: [{ key: 16, type: 'int', value: 2 }] })
  packet('entity_equipment', { entityId: 12, equipments: [{ slot: 0, item: { itemId: 9001, addedComponentCount: 1, addedComponents: [{ type: 700, data: { value: 42n } }] } }] })
  const entity = world.entitySnapshot().entities[0]
  assert.equal(entity.metadata.find(entry => entry.key === 0).value, 0)
  assert.equal(entity.metadata.find(entry => entry.key === 16).value, 2)
  assert.equal(entity.equipment[0].item.itemId, 9001)
  assert.deepEqual(entity.equipment[0].item.addedComponents[0].data.value, { type: 'long', value: '42' })
  assert.equal(JSON.stringify(entity).includes('proxy'), false)
})

test('native bool-prefixed optional metadata absence has an explicit immutable JSON representation', () => {
  const { world, packet, spawn } = entityFixture()
  spawn()
  const metadata = optionalMetadataTypes.map((type, index) => ({ key: index + 2, type, value: undefined }))
  const native = deserialize(serialize(metadata))
  assert(native.every(entry => Object.hasOwn(entry, 'value') && entry.value === undefined))
  packet('entity_metadata', { entityId: 12, metadata: native })
  const snapshot = world.entitySnapshot()
  assert.equal(snapshot.available, true)
  assert.deepEqual(snapshot.entities[0].metadata, metadata.map(entry => ({ ...entry, value: null, nativeOptionalAbsent: true })))
  assert.equal(world.entityDataBytes, snapshot.entities[0].metadata.reduce((sum, entry) => sum + Buffer.byteLength(JSON.stringify(entry)), 0))
  assert.equal(world.entitySnapshot(), snapshot)
  assert.throws(() => { snapshot.entities[0].metadata[0].nativeOptionalAbsent = false }, TypeError)
  packet('entity_metadata', { entityId: 12, metadata: [{ key: 2, type: 'optional_component', value: { type: 'string', value: 'Received title' } }] })
  assert.equal(world.entitySnapshot().entities[0].metadata[0].nativeOptionalAbsent, undefined, 'a present replacement releases the absence marker')
  assert.equal(snapshot.entities[0].metadata[0].nativeOptionalAbsent, true, 'older cached snapshots remain detached')
})

test('locked 1.21.1 native codec parses and roundtrips optional absent and present byte fixtures', {
  skip: !metadataCodec && 'Set NATIVE_METADATA_CODEC_MODULE to the deployment locked minecraft-protocol serializer module'
}, () => {
  const encoder = metadataCodec.createSerializer({ state: 'play', isServer: true, version: '1.21.1' })
  const decoder = metadataCodec.createDeserializer({ state: 'play', isServer: false, version: '1.21.1' })
  // Protocol 767 packet 0x58. These are codec regression fixtures, not a
  // claimed capture of the live failure: false is absence; true has a value.
  const absentWire = Buffer.from('580c020600030b00040d00051900ff', 'hex')
  const presentWire = Buffer.from('580c02060108000b4e6174697665206e616d65030b01ffffe140001c8040040d0112345678123456781234567812345678051901136d696e6563726166743a6f766572776f726c64ff', 'hex')
  const absent = decoder.parsePacketBuffer(absentWire).data, present = decoder.parsePacketBuffer(presentWire).data
  assert.equal(absent.name, 'entity_metadata')
  assert.deepEqual(absent.params.metadata.map(entry => entry.type), optionalMetadataTypes)
  assert(absent.params.metadata.every(entry => Object.hasOwn(entry, 'value') && entry.value === undefined))
  assert.deepEqual(encoder.createPacketBuffer(absent), absentWire)
  assert.deepEqual(encoder.createPacketBuffer(present), presentWire)
  assert.deepEqual(present.params.metadata.map(entry => entry.value), [
    { type: 'string', value: 'Native name' }, { x: -123, y: 64, z: 456 },
    '12345678-1234-5678-1234-567812345678', 'minecraft:overworld'
  ])
  const { world, packet, spawn } = entityFixture()
  spawn()
  for (const fixture of [absent, present, absent]) {
    // The producer uses a v8 envelope rather than JSON, preserving undefined.
    const native = deserialize(serialize(fixture))
    packet(native.name, native.params)
    assert.equal(world.entitySnapshot().available, true)
    const metadata = world.entitySnapshot().entities[0].metadata
    assert.deepEqual(metadata.map(entry => entry.value), fixture === absent ? [null, null, null, null] : present.params.metadata.map(entry => entry.value))
    assert(metadata.every(entry => fixture === absent ? entry.nativeOptionalAbsent === true : !Object.hasOwn(entry, 'nativeOptionalAbsent')))
  }
})

test('missing required metadata and absent unsupported serializers still close the entity stream', () => {
  for (const entry of [
    ...['int', 'string', 'optional_unsigned_int', 'optional_block_state', 'optional_unknown'].map(type => ({ key: 2, type, value: undefined })),
    { key: 2, type: 6, value: undefined }, { key: 2, type: 'optional_component' }, null
  ]) {
    const { world, packet, spawn } = entityFixture()
    spawn(); packet('entity_metadata', { entityId: 12, metadata: [entry] })
    const snapshot = world.entitySnapshot()
    assert.equal(world.error, null)
    assert.equal(snapshot.available, false)
    assert.equal(snapshot.reason, 'NATIVE_ENTITY_METADATA_INVALID')
    assert.equal(snapshot.entities.length, 0)
    assert.equal(snapshot.errorDetails.hasValue, !!entry && Object.hasOwn(entry, 'value'))
    assert.equal(snapshot.errorDetails.hasDefinedValue, false)
  }
})

test('metadata errors publish bounded names and property presence without retaining native values', () => {
  const { world, packet, spawn } = entityFixture()
  spawn(); packet('entity_metadata', { entityId: 12, metadata: [{ key: 500, type: 'invalid\n' + 'x'.repeat(200), value: { privateValue: 'never expose me' } }] })
  const snapshot = world.entitySnapshot(), details = snapshot.errorDetails
  assert.deepEqual(Object.keys(details), ['packet', 'sequence', 'entityId', 'entryIndex', 'key', 'type', 'typeTruncated', 'hasValue', 'hasDefinedValue'])
  assert.equal(details.packet, 'entity_metadata'); assert.equal(details.sequence, 3)
  assert.equal(details.entityId, 12); assert.equal(details.entryIndex, 0); assert.equal(details.key, 500)
  assert.equal(details.type.length, 128); assert.match(details.type, /^invalid\?/)
  assert.equal(details.typeTruncated, true); assert.equal(details.hasValue, true); assert.equal(details.hasDefinedValue, true)
  assert.equal(JSON.stringify(snapshot).includes('privateValue'), false)
  assert.equal(JSON.stringify(snapshot).includes('never expose me'), false)
  assert(Buffer.byteLength(JSON.stringify(details)) < 512)
  assert.throws(() => { details.key = 2 }, TypeError)
  assert.equal(world.entitySnapshot(), snapshot)
  assert.equal(world.entityDataBytes, 0)
  packet('respawn', {}); spawn()
  assert.equal(world.entitySnapshot().available, true)
  assert.equal(Object.hasOwn(world.entitySnapshot(), 'errorDetails'), false, 'diagnostics cannot leak into a fresh native epoch')
})

test('destroy, respawn and unavailable clear entity identity and prevent late resurrection', () => {
  const { world, packet, spawn } = entityFixture()
  spawn(); packet('entity_destroy', { entityIds: [12] })
  packet('rel_entity_move', { entityId: 12, dX: 1, dY: 0, dZ: 0, onGround: true })
  assert.equal(world.entitySnapshot().entities.length, 0)
  spawn(); packet('respawn', {})
  assert.equal(world.entitySnapshot().entities.length, 0)
  spawn(); world.unavailable(Error('test-disconnect'))
  assert.equal(world.entitySnapshot().available, false)
  assert.equal(world.entitySnapshot().entities.length, 0)
})

test('malformed native entity metadata closes entity rendering without inventing a replacement', () => {
  const { world, packet, spawn } = entityFixture()
  spawn(); packet('entity_metadata', { entityId: 12, metadata: [{ key: 500, type: 'int', value: 2 }] })
  assert.equal(world.error, null, 'native terrain remains independently available')
  assert.equal(world.entitySnapshot().available, false)
  assert.match(world.entitySnapshot().reason, /METADATA_INVALID/)
  assert.equal(world.entitySnapshot().entities.length, 0)
})

test('native entity retained-data budgets include repeated metadata and equipment without silent truncation', () => {
  const { world, packet, spawn } = entityFixture()
  spawn(12,300)
  const large = 'x'.repeat(15000)
  packet('entity_metadata',{entityId:12,metadata:Array.from({length:4},(_,key)=>({key,type:'string',value:large}))})
  const original = world.entityDataBytes
  assert.ok(original > 60000 && original < 65536)
  packet('entity_metadata',{entityId:12,metadata:[{key:0,type:'string',value:'small'}]})
  assert.ok(world.entityDataBytes < original-14000,'replacement releases the previous stored byte allowance')
  packet('entity_equipment',{entityId:12,equipments:[{slot:0,item:{itemCount:1,components:large}}]})
  assert.equal(world.entitySnapshot().available,true)
  packet('entity_equipment',{entityId:12,equipments:[{slot:1,item:{itemCount:1,components:large}}]})
  assert.match(world.entitySnapshot().reason,/NATIVE_ENTITY_DATA_BUDGET_EXCEEDED/)
  assert.equal(world.entities.size,0);assert.equal(world.entityDataBytes,0);assert.equal(world.entityEntrySizes.size,0)
  assert.equal(world.error,null,'terrain and the actual game connection are independent of entity render failure')
})

test('native entity aggregate budget is bounded across valid independent entities', () => {
  const { world, packet, spawn } = entityFixture()
  const metadata=Array.from({length:4},(_,key)=>({key,type:'string',value:'x'.repeat(15000)}))
  for(let id=1;id<=35;id++) { spawn(id,300);packet('entity_metadata',{entityId:id,metadata}) }
  assert.match(world.entitySnapshot().reason,/NATIVE_ENTITY_TOTAL_DATA_BUDGET_EXCEEDED/)
  assert.equal(world.entityDataBytes,0);assert.equal(world.entities.size,0)
  assert.equal(world.entityCollections.size,0)
  packet('respawn',{});spawn(99,300)
  assert.equal(world.entitySnapshot().available,true,'an actual new epoch recovers after clearing all old retained data')
})

test('destroy and entity ID reuse release retained data and cannot keep an old native motion tracker', () => {
  const { world, packet, spawn } = entityFixture()
  spawn();packet('entity_metadata',{entityId:12,metadata:[{key:16,type:'int',value:3}]})
  assert.ok(world.entityDataBytes>0);assert.equal(world.entityMotions.size,1)
  spawn(12,300)
  assert.equal(world.entityDataBytes,0);assert.equal(world.entityMotions.size,0)
  packet('entity_metadata',{entityId:12,metadata:[{key:0,type:'string',value:'actual'}]})
  packet('entity_destroy',{entityIds:[12]})
  assert.equal(world.entityDataBytes,0);assert.equal(world.entityEntrySizes.size,0)
})

test('snapshot cache preserves one revision and bounds, while real ticks reuse immutable heavy collections', () => {
  const { world, packet, spawn } = entityFixture()
  spawn();packet('entity_metadata',{entityId:12,metadata:[{key:16,type:'int',value:2}]})
  const first=world.entitySnapshot(),again=world.entitySnapshot()
  assert.equal(first,again)
  assert.throws(()=>first.entities.push({}),TypeError)
  packet('rel_entity_move',{entityId:12,dX:4096,dY:0,dZ:0,onGround:true})
  world.tickEntities()
  const second=world.entitySnapshot()
  assert.notEqual(second,first)
  assert.equal(second.entities[0].metadata,first.entities[0].metadata,'ordinary motion does not clone/stringify all metadata')
  assert.equal(first.entities[0].position.x,-10.25)
  assert.equal(second.entities[0].position.x,-9.25)
  const distant={minX:100,maxX:110,minY:0,maxY:100,minZ:100,maxZ:110}
  const empty=world.entitySnapshot(distant)
  assert.equal(empty.entities.length,0);assert.equal(world.entitySnapshot({...distant}),empty)
  assert.notEqual(world.entitySnapshot(),empty)
})

test('cached native entity values and motion cannot be rewritten through nested consumer references', () => {
  const { world, packet, spawn } = entityFixture()
  spawn()
  const input = { native: { color: 2, list: [{ owner: 'received' }] } }
  packet('entity_metadata', { entityId: 12, metadata: [{ key: 23, type: 'compound', value: input }] })
  packet('entity_equipment', { entityId: 12, equipments: [{ slot: 0, item: { components: { native: { damage: 7 } } } }] })
  packet('entity_status', { entityId: 12, entityStatus: 2 })
  const before = world.entityDataBytes, snapshot = world.entitySnapshot(), row = snapshot.entities[0]
  input.native.color = 99 // Receipt is a detached copy, not a frozen caller object.
  assert.throws(() => { row.metadata[0].value.native.color = 99 }, TypeError)
  assert.throws(() => { row.metadata[0].value.native.list[0].owner = 'changed' }, TypeError)
  assert.throws(() => { row.metadata[0].key = 0 }, TypeError)
  assert.throws(() => { row.equipment[0].item.components.native.damage = 99 }, TypeError)
  assert.throws(() => { row.cues[0].code = 99 }, TypeError)
  assert.throws(() => { row.motion.previous.position.x = 99 }, TypeError)
  assert.throws(() => { row.motion.walk.speed = 99 }, TypeError)
  assert.equal(world.entities.get(12).metadata.get(23).value.native.color, 2)
  assert.equal(world.entities.get(12).equipment.get(0).item.components.native.damage, 7)
  assert.equal(world.entityDataBytes, before)
  assert.equal(world.entitySnapshot(), snapshot)
  assert.doesNotThrow(() => world.tickEntities())
  assert.equal(world.entitySnapshot().entities[0].motion.tick, 1, 'freezing snapshots does not freeze the live tracker')
  world.entityError = 'TEST_UNAVAILABLE'; world.entityRevision++
  assert.throws(() => world.entitySnapshot().entities.push({}), TypeError)
})

test('oversize entity snapshot stops before constructing or serializing the remaining table', () => {
  const { world, packet, spawn } = entityFixture()
  const metadata=Array.from({length:4},(_,key)=>({key,type:'string',value:'x'.repeat(15000)}))
  for(let id=1;id<=12;id++){spawn(id,300);packet('entity_metadata',{entityId:id,metadata})}
  assert.equal(world.entities.size,12)
  const snapshot=world.entitySnapshot()
  assert.equal(snapshot.entities.length,0);assert.match(snapshot.reason,/SNAPSHOT_BUDGET_EXCEEDED/)
  assert.equal(world.entityCollections.size,3,'128KiB check stops at the third 60KiB entity, not after all twelve')
  assert.equal(world.entitySnapshot(),snapshot,'unchanged oversize state is also cached, not repeatedly reserialized')
})

test('entity tick clock errors clear only the entity stream and never escape the game physics event', () => {
  const {world,spawn}=entityFixture();spawn();world.now=()=>999
  assert.doesNotThrow(()=>world.tickEntities())
  assert.match(world.entitySnapshot().reason,/MOTION_CLOCK_INVALID/)
  assert.equal(world.error,null);assert.equal(world.entityMotions.size,0)
})

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

test('millstone speed follows native block-entity packets and missing speed is not invented', () => {
  const { world, packet, chunk } = worldFixture()
  const position = { x: -2, y: 64, z: -1 }
  chunk.setBlockStateId(new Vec3(14, 64, 15), 70190)
  packet('map_chunk', { x: -1, z: -1, chunkData: chunk.dump(), blockEntities: [] })
  world.setPose(pose)
  const row = () => world.snapshot({ halfExtent: 1, below: 0, above: 0 }).kinetic[0]
  assert.deepEqual(row(), { position, stateId: 70190, speed: null, overstressed: null })
  packet('tile_entity_data', { location: position, nbtData: { Speed: 32, Overstressed: 0 } })
  assert.deepEqual(row(), { position, stateId: 70190, speed: 32, overstressed: 0 })
  packet('tile_entity_data', { location: position, nbtData: { Speed: 0 } })
  assert.equal(row().speed, 0)
  packet('block_change', { location: position, type: 70001 })
  assert.deepEqual(world.snapshot({ halfExtent: 1, below: 0, above: 0 }).kinetic, [])
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
