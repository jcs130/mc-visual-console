import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import chunkFactory from 'prismarine-chunk'
import { Vec3 } from 'vec3'
import { CUTTING_BOARD_ID, cuttingBoardContent } from '../src/native-viewer/cutting-board.js'

const AIR = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air'])
const key = p => `${p.x},${p.y},${p.z}`
const columnKey = (x, z) => `${x},${z}`
const finite = p => p && [p.x, p.y, p.z].every(Number.isFinite)
const BaseChunk = chunkFactory('1.21.1'), stateWidths = new WeakMap()
const require = createRequire(import.meta.url), requireChunk = createRequire(require.resolve('prismarine-chunk'))
const { SmartBuffer } = requireChunk('smart-buffer')
const BiomeSection = requireChunk('./src/pc/common/PaletteBiome')
const { DirectPaletteContainer } = requireChunk('./src/pc/common/PaletteContainer')
const varInt = requireChunk('./src/pc/common/varInt')

export function loadNativeStateRegistry (bytes, expectedHash) {
  if (createHash('sha256').update(bytes).digest('hex') !== expectedHash) throw Error('NATIVE_WORLD_REGISTRY_HASH_MISMATCH')
  const states = new Map()
  for (const line of bytes.toString('utf8').trim().split('\n')) {
    const state = JSON.parse(line)
    if (!Number.isSafeInteger(state.stateId) || state.stateId < 0 || states.has(state.stateId) ||
        typeof state.name !== 'string' || !state.properties || !['MODEL', 'INVISIBLE', 'ENTITYBLOCK_ANIMATED'].includes(state.renderShape)) throw Error('NATIVE_WORLD_REGISTRY_INVALID')
    states.set(state.stateId, state)
  }
  if (!states.size) throw Error('NATIVE_WORLD_REGISTRY_EMPTY')
  return states
}

export function longNumber (value) {
  const number = Number(longBigInt(value))
  if (!Number.isSafeInteger(number)) throw Error('NATIVE_WORLD_TIME_INVALID')
  return number
}

export function longBigInt (value) {
  if (Array.isArray(value) && value.length === 2) return BigInt.asIntN(64, (BigInt(value[0]) << 32n) | BigInt(value[1] >>> 0))
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw Error('NATIVE_LONG_UNSAFE_NUMBER')
  return BigInt.asIntN(64, BigInt(value))
}

export function nativeChunk (options, states, biomeCount) {
  const column = new BaseChunk(options)
  if (!stateWidths.has(states)) { let max = 0; for (const id of states.keys()) max = Math.max(max, id); stateWidths.set(states, Math.ceil(Math.log2(max + 1))) }
  column.maxBitsPerBlock = stateWidths.get(states)
  column.maxBitsPerBiome = Math.ceil(Math.log2(Math.max(1, biomeCount)))
  column.sections = column.sections.map(() => new BaseChunk.section({ noSizePrefix: false, hasFluidCount: false, maxBitsPerBlock: column.maxBitsPerBlock }))
  // prismarine-chunk 1.41.0 caps reads at 16 bits; this native modpack has
  // 107,852 states (17 bits). Extend this column only, never global dependencies.
  column.load = data => {
    const reader = SmartBuffer.fromBuffer(data)
    for (let i = 0; i < column.numSections; i++) {
      const bits = data[reader.readOffset + 2]
      if (bits > 8 && bits !== column.maxBitsPerBlock) throw Error('NATIVE_GLOBAL_PALETTE_WIDTH_MISMATCH')
      if (bits > 16) {
        if (bits > 31) throw Error('NATIVE_GLOBAL_PALETTE_WIDTH_UNSUPPORTED')
        const solidBlockCount = reader.readInt16BE(); reader.readUInt8()
        if (solidBlockCount < 0 || solidBlockCount > 4096) throw Error('NATIVE_GLOBAL_PALETTE_COUNT_INVALID')
        const longs = varInt.read(reader)
        if (longs !== Math.ceil(4096 / Math.floor(64 / bits))) throw Error('NATIVE_GLOBAL_PALETTE_LENGTH_INVALID')
        const palette = new DirectPaletteContainer({ noSizePrefix: false, bitsPerValue: bits, capacity: 4096 })
        palette.data.readBuffer(reader, longs * 2)
        column.sections[i] = new BaseChunk.section({ noSizePrefix: false, hasFluidCount: false, solidBlockCount, data: palette, maxBitsPerBlock: bits })
      } else column.sections[i] = BaseChunk.section.read(reader, column.maxBitsPerBlock, false, false)
      column.biomes[i] = BiomeSection.read(reader, column.maxBitsPerBiome, false)
    }
    if (reader.readOffset !== data.length) throw Error('NATIVE_CHUNK_TRAILING_DATA')
  }
  return column
}

// Receives only already-verified native packets from the action bot's own
// connection. Never queries disk worlds, generates chunks or decodes proxy IDs.
export class NativeWorldState extends EventEmitter {
  constructor ({ states, registrySha256, resolveDimension, simplifyNBT, makeChunk, now = Date.now }) {
    super()
    this.states = states; this.registrySha256 = registrySha256
    this.resolveDimension = resolveDimension; this.simplifyNBT = simplifyNBT; this.makeChunk = makeChunk || (options => nativeChunk(options, this.states, this.biomes.size)); this.now = now
    this.biomes = new Map(); this.biomeSeed = null
    this.columns = new Map(); this.blockEntities = new Map(); this.dimension = null; this.pose = null
    this.epoch = 0; this.revision = 0; this.lastSequence = 0; this.packetCount = 0; this.error = null; this.time = null
  }

  unavailable (error) {
    if (this.error) return
    this.error = error.message || String(error)
    this.columns.clear(); this.blockEntities.clear(); this.pose = null
    this.emit('unavailable', this.error)
  }

  handle (body) {
    if (this.error) return
    try {
      if (body.registrySha256 !== this.registrySha256 || body.sequence !== this.lastSequence + 1) throw Error('NATIVE_WORLD_PACKET_SEQUENCE_OR_REGISTRY_MISMATCH')
      this.lastSequence = body.sequence; this.packetCount++
      const p = body.params
      switch (body.name) {
        case 'login': case 'respawn': {
          const d = this.resolveDimension(p.worldState || p)
          if (!d || !Number.isInteger(d.minY) || !Number.isInteger(d.height) || d.height <= 0 || d.height > 4096 || d.minY % 16 || d.height % 16 || typeof d.name !== 'string') throw Error('NATIVE_WORLD_DIMENSION_UNAVAILABLE')
          this.dimension = d; this.columns.clear(); this.blockEntities.clear(); this.pose = null; this.time = null
          this.biomeSeed = (p.worldState || p).hashedSeed !== undefined ? longBigInt((p.worldState || p).hashedSeed).toString() : null
          this.epoch++; this.revision++; this.emit('reset', this.epoch); break
        }
        case 'map_chunk': {
          if (!this.dimension) throw Error('NATIVE_WORLD_DIMENSION_UNAVAILABLE')
          if (![p.x, p.z].every(Number.isInteger) || !Buffer.isBuffer(p.chunkData)) throw Error('NATIVE_WORLD_CHUNK_INVALID')
          if (!this.columns.has(columnKey(p.x, p.z)) && this.columns.size >= 512) throw Error('NATIVE_WORLD_LOADED_CHUNK_LIMIT')
          const chunk = this.makeChunk({ minY: this.dimension.minY, worldHeight: this.dimension.height })
          chunk.load(p.chunkData)
          this.columns.set(columnKey(p.x, p.z), chunk)
          this.removeBlockEntities(p.x, p.z)
          for (const be of p.blockEntities || []) this.setBlockEntity({ x: p.x * 16 + be.x, y: be.y, z: p.z * 16 + be.z }, be.nbtData ?? be.nbt)
          this.revision++; this.emit('world'); break
        }
        case 'unload_chunk': {
          this.columns.delete(columnKey(p.chunkX, p.chunkZ)); this.removeBlockEntities(p.chunkX, p.chunkZ)
          this.revision++; this.emit('world'); break
        }
        case 'block_change': this.changeBlock(p.location, p.type); break
        case 'multi_block_change': {
          const c = p.chunkCoordinates
          for (const record of p.records) {
            if (!Number.isSafeInteger(record) || record < 0) throw Error('NATIVE_WORLD_BLOCK_RECORD_INVALID')
            const packed = record % 4096
            this.changeBlock({ x: c.x * 16 + Math.floor(packed / 256), y: c.y * 16 + packed % 16, z: c.z * 16 + Math.floor(packed / 16) % 16 }, Math.floor(record / 4096))
          }
          break
        }
        case 'tile_entity_data': this.setBlockEntity(p.location, p.nbtData ?? p.nbt); this.revision++; this.emit('world'); break
        case 'update_time': this.time = { age: longNumber(p.age), day: longNumber(p.time), receivedAt: this.now() }; this.emit('time'); break
      }
    } catch (error) { this.unavailable(error) }
  }

  setBiomeRegistry (packet) {
    if (packet.id !== 'minecraft:worldgen/biome' || this.error) return
    try {
      const biomes = new Map()
      for (const [id, entry] of packet.entries.entries()) {
        if (!entry.value || typeof entry.key !== 'string') throw Error('NATIVE_BIOME_REGISTRY_INCOMPLETE')
        const data = this.simplifyNBT(entry.value)
        if (!data || ![data.temperature, data.downfall].every(Number.isFinite) || !data.effects) throw Error('NATIVE_BIOME_REGISTRY_INVALID')
        biomes.set(id, { id, name: entry.key, temperature: data.temperature, downfall: data.downfall, effects: data.effects })
      }
      if (!biomes.size) throw Error('NATIVE_BIOME_REGISTRY_EMPTY')
      this.biomes = biomes; this.revision++; this.emit('world')
    } catch (error) { this.unavailable(error) }
  }

  removeBlockEntities (x, z) {
    for (const [k, be] of this.blockEntities) if (Math.floor(be.position.x / 16) === x && Math.floor(be.position.z / 16) === z) this.blockEntities.delete(k)
  }

  setBlockEntity (position, tag) {
    if (!finite(position) || ![position.x, position.y, position.z].every(Number.isInteger)) throw Error('NATIVE_WORLD_BLOCK_ENTITY_POSITION_INVALID')
    const value = tag?.type ? this.simplifyNBT(tag) : tag
    if (value && typeof value === 'object') this.blockEntities.set(key(position), { position: { ...position }, data: value })
    else this.blockEntities.delete(key(position)) // Missing new data cannot reuse an older verified empty inventory.
  }

  stateIdAt (p) {
    const cx = Math.floor(p.x / 16), cz = Math.floor(p.z / 16)
    const chunk = this.columns.get(columnKey(cx, cz))
    return chunk?.getBlockStateId(new Vec3(p.x - cx * 16, p.y, p.z - cz * 16)) ?? null
  }

  biomeIdAtQuart (x, y, z) {
    const cx = Math.floor(x / 4), cz = Math.floor(z / 4), chunk = this.columns.get(columnKey(cx, cz))
    y = Math.max(this.dimension.minY / 4, Math.min((this.dimension.minY + this.dimension.height) / 4 - 1, y))
    return chunk?.getBiome(new Vec3((x - cx * 4) * 4, y * 4, (z - cz * 4) * 4)) ?? null
  }

  changeBlock (p, stateId) {
    if (!finite(p) || ![p.x, p.y, p.z, stateId].every(Number.isInteger) || !this.states.has(stateId)) throw Error('NATIVE_WORLD_BLOCK_INVALID')
    const cx = Math.floor(p.x / 16), cz = Math.floor(p.z / 16)
    const chunk = this.columns.get(columnKey(cx, cz))
    if (!chunk) return // A late update for an unloaded column does not load it.
    const old = this.stateIdAt(p)
    chunk.setBlockStateId(new Vec3(p.x - cx * 16, p.y, p.z - cz * 16), stateId)
    if (old !== stateId) this.blockEntities.delete(key(p))
    this.revision++; this.emit('world')
  }

  setPose (pose) {
    if (this.error) return
    if (!finite(pose) || ![pose.yaw, pose.pitch, pose.eyeHeight].every(Number.isFinite)) return
    this.pose = { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw, pitch: pose.pitch, eyeHeight: pose.eyeHeight }
    this.emit('pose')
  }

  // Bounded inspection volume, clearly reported to the UI. All block IDs and
  // positions are native; air is omitted by actual registry name, never by ID.
  snapshot ({ halfExtent = 10, below = 5, above = 10 } = {}) {
    if (this.error) return { type: 'unavailable', reason: this.error, epoch: this.epoch }
    if (!this.pose || !this.dimension) return { type: 'waiting', epoch: this.epoch, reason: 'waiting_for_native_world_and_player' }
    if (![halfExtent, below, above].every(Number.isInteger) || halfExtent < 1 || halfExtent > 16 || below < 0 || above < 0 || below + above > 48) throw Error('NATIVE_WORLD_VIEW_BOUNDS_INVALID')
    const bounds = { minX: Math.floor(this.pose.x) - halfExtent, maxX: Math.floor(this.pose.x) + halfExtent,
      minY: Math.max(this.dimension.minY, Math.floor(this.pose.y) - below), maxY: Math.min(this.dimension.minY + this.dimension.height - 1, Math.floor(this.pose.y) + above),
      minZ: Math.floor(this.pose.z) - halfExtent, maxZ: Math.floor(this.pose.z) + halfExtent }
    const groups = new Map(), definitions = new Map(), kinetic = [], cuttingBoards = [], missingColumns = new Set()
    // Neighbor halo for fluid geometry. These are already received blocks,
    // never disk/server queries or an extra observation account.
    const neighbors = []
    for (let y = Math.max(this.dimension.minY, bounds.minY - 1); y <= Math.min(this.dimension.minY + this.dimension.height - 1, bounds.maxY + 1); y++)
      for (let z = bounds.minZ - 1; z <= bounds.maxZ + 1; z++) for (let x = bounds.minX - 1; x <= bounds.maxX + 1; x++) {
        const id = this.stateIdAt({ x, y, z })
        if (id !== null) { neighbors.push(x, y, z, id); const state = this.states.get(id); if (!state) throw Error(`NATIVE_WORLD_STATE_UNREGISTERED:${id}`); definitions.set(id, state) }
      }
    const worldMinY = this.dimension.minY / 4, worldMaxY = (this.dimension.minY + this.dimension.height) / 4 - 1
    const biomeGrid = { x: Math.floor((bounds.minX - 6) / 4), y: Math.max(worldMinY, Math.floor((bounds.minY - 6) / 4)), z: Math.floor((bounds.minZ - 6) / 4), worldMinY, worldMaxY }
    biomeGrid.width = Math.floor((bounds.maxX + 6) / 4) - biomeGrid.x + 1
    biomeGrid.height = Math.min(worldMaxY, Math.floor((bounds.maxY + 6) / 4)) - biomeGrid.y + 1
    biomeGrid.depth = Math.floor((bounds.maxZ + 6) / 4) - biomeGrid.z + 1
    biomeGrid.ids = []
    const usedBiomes = new Set()
    for (let y = biomeGrid.y; y < biomeGrid.y + biomeGrid.height; y++) for (let z = biomeGrid.z; z < biomeGrid.z + biomeGrid.depth; z++) for (let x = biomeGrid.x; x < biomeGrid.x + biomeGrid.width; x++) {
      const id = this.biomeIdAtQuart(x, y, z); biomeGrid.ids.push(id); if (id !== null) usedBiomes.add(id)
    }
    for (let y = bounds.minY; y <= bounds.maxY; y++) for (let z = bounds.minZ; z <= bounds.maxZ; z++) for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const p = { x, y, z }, id = this.stateIdAt(p)
      if (id === null) { missingColumns.add(columnKey(Math.floor(x / 16), Math.floor(z / 16))); continue }
      const state = this.states.get(id)
      if (!state) throw Error(`NATIVE_WORLD_STATE_UNREGISTERED:${id}`)
      if (AIR.has(state.name)) continue
      definitions.set(id, state)
      if (!groups.has(id)) groups.set(id, [])
      groups.get(id).push(x, y, z)
      const be = this.blockEntities.get(key(p))
      if (['create:shaft', 'create:hand_crank'].includes(state.name)) kinetic.push({ position: p, stateId: id, speed: Number.isFinite(be?.data.Speed) ? be.data.Speed : null, overstressed: be?.data.Overstressed ?? null })
      if (state.name === CUTTING_BOARD_ID) cuttingBoards.push({ position: p, stateId: id, ...cuttingBoardContent(be?.data) })
    }
    return { type: 'snapshot', schemaVersion: 1, mode: 'live_same_player_connection', minecraftVersion: '1.21.1', registrySha256: this.registrySha256,
      epoch: this.epoch, revision: this.revision, packetSequence: this.lastSequence, dimension: this.dimension, pose: this.pose, time: this.time, bounds,
      states: [...definitions.values()], groups: [...groups].map(([stateId, positions]) => ({ stateId, positions })), kinetic, cuttingBoards, missingColumns: [...missingColumns],
      neighbors, biomeSeed: this.biomeSeed, biomeGrid, biomes: [...usedBiomes].map(id => this.biomes.get(id)).filter(Boolean),
      entityRenderingAvailable: false, lightingParityVerified: false, completeSceneParityVerified: false }
  }
}

// Portable attachment point for an existing Agent bot. The preview launcher is
// only a QA client; it is never another account's inventory or camera.
export function attachNativeWorld ({ bot, nativeStream, world, intervalMs = 100 }) {
  const packet = body => world.handle(body)
  const unavailable = error => world.unavailable(error)
  nativeStream.events.on('packet', packet); nativeStream.events.on('unavailable', unavailable)
  const registry = packet => world.setBiomeRegistry(packet)
  bot._client?.on('registry_data', registry)
  const timer = setInterval(() => {
    if (!bot.entity) return
    world.setPose({ ...bot.entity.position, yaw: bot.entity.yaw, pitch: bot.entity.pitch, eyeHeight: bot.entity.eyeHeight })
  }, intervalMs)
  timer.unref()
  return () => { clearInterval(timer); nativeStream.events.off('packet', packet); nativeStream.events.off('unavailable', unavailable); bot._client?.off('registry_data', registry) }
}
