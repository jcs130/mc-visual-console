import { blockPositionSeed } from './model-selection.js'

const signed = n => BigInt.asIntN(64, n)
const nextSeed = (seed, salt) => signed(seed * signed(seed * 6364136223846793005n + 1442695040888963407n) + salt)
const fiddle = seed => (Number((seed >> 24n) & 1023n) / 1024 - 0.5) * 0.9

export function fiddledDistance (seed, x, y, z, dx, dy, dz) {
  let value = seed
  for (const n of [x, y, z, x, y, z]) value = nextSeed(value, BigInt(n))
  const ox = fiddle(value); value = nextSeed(value, seed)
  const oy = fiddle(value); value = nextSeed(value, seed)
  const oz = fiddle(value)
  return (dz + oz) ** 2 + (dy + oy) ** 2 + (dx + ox) ** 2
}

// BiomeManager's eight-corner lookup uses the hashed seed actually sent in
// SpawnInfo, not the unshared world seed or a nearest-quart approximation.
export function fuzzyBiomeQuart (seedString, position) {
  if (typeof seedString !== 'string' || !/^-?\d+$/.test(seedString)) throw Error('NATIVE_BIOME_SEED_UNAVAILABLE')
  const seed = BigInt(seedString)
  if (signed(seed) !== seed || ![position.x, position.y, position.z].every(Number.isSafeInteger)) throw Error('NATIVE_BIOME_POSITION_OR_SEED_INVALID')
  const shifted = [position.x - 2, position.y - 2, position.z - 2]
  const base = shifted.map(n => Math.floor(n / 4)), fraction = shifted.map((n, i) => (n - base[i] * 4) / 4)
  let best = Infinity, selected
  for (let i = 0; i < 8; i++) {
    const corner = [4, 2, 1].map(bit => (i & bit) ? 1 : 0), q = base.map((n, j) => n + corner[j])
    const distance = fiddledDistance(seed, ...q, ...fraction.map((n, j) => n - corner[j]))
    if (distance < best) { best = distance; selected = { x: q[0], y: q[1], z: q[2] } }
  }
  return selected
}

export function biomeAt (snapshot, position) {
  const grid = snapshot.biomeGrid
  if (!grid || !snapshot.biomes) throw Error('NATIVE_BIOMES_UNAVAILABLE')
  const q = fuzzyBiomeQuart(snapshot.biomeSeed, position)
  q.y = Math.max(grid.worldMinY, Math.min(grid.worldMaxY, q.y))
  const x = q.x - grid.x, y = q.y - grid.y, z = q.z - grid.z
  if (x < 0 || x >= grid.width || y < 0 || y >= grid.height || z < 0 || z >= grid.depth) throw Error('NATIVE_BIOME_OUTSIDE_RECEIVED_GRID')
  const id = grid.ids[(y * grid.depth + z) * grid.width + x]
  const biome = snapshot.biomes.find(b => b.id === id)
  if (!biome) throw Error('NATIVE_BIOME_NOT_RECEIVED')
  return biome
}

export function climateColor (rgba, temperature, downfall) {
  if (!rgba || rgba.length !== 256 * 256 * 4 || ![temperature, downfall].every(Number.isFinite)) throw Error('NATIVE_COLORMAP_OR_CLIMATE_UNAVAILABLE')
  const t = Math.max(0, Math.min(1, temperature)), d = Math.max(0, Math.min(1, downfall)) * t
  const index = ((Math.trunc((1 - d) * 255) << 8) | Math.trunc((1 - t) * 255)) * 4
  return (rgba[index] << 16) | (rgba[index + 1] << 8) | rgba[index + 2]
}

export function biomeColor (biome, kind, colormaps) {
  const effects = biome.effects
  if (!effects) throw Error('NATIVE_BIOME_EFFECTS_UNAVAILABLE')
  if (kind === 'water') {
    if (!Number.isInteger(effects.water_color)) throw Error('NATIVE_WATER_COLOR_UNAVAILABLE')
    return effects.water_color & 0xffffff
  }
  let color = effects[kind === 'grass' ? 'grass_color' : 'foliage_color']
  if (color === undefined) color = climateColor(colormaps[kind], biome.temperature, biome.downfall)
  if (kind === 'grass') {
    const modifier = effects.grass_color_modifier ?? 'none'
    if (modifier === 'dark_forest') color = ((color & 0xfefefe) + 2634762) >> 1
    else if (modifier !== 'none') throw Error(`NATIVE_GRASS_MODIFIER_UNSUPPORTED:${modifier}`)
  }
  return color & 0xffffff
}

export function blendedBiomeColor (snapshot, position, kind, colormaps, radius = 2) {
  if (!Number.isInteger(radius) || radius < 0 || radius > 3) throw Error('NATIVE_BIOME_BLEND_RADIUS_INVALID')
  let red = 0, green = 0, blue = 0, count = 0
  for (let x = position.x - radius; x <= position.x + radius; x++) for (let z = position.z - radius; z <= position.z + radius; z++) {
    const color = biomeColor(biomeAt(snapshot, { x, y: position.y, z }), kind, colormaps)
    red += color >> 16 & 255; green += color >> 8 & 255; blue += color & 255; count++
  }
  return (Math.trunc(red / count) << 16) | (Math.trunc(green / count) << 8) | Math.trunc(blue / count)
}

const grass = new Set(['minecraft:grass_block', 'minecraft:short_grass', 'minecraft:fern', 'minecraft:tall_grass', 'minecraft:large_fern', 'minecraft:potted_fern', 'minecraft:sugar_cane'])
const foliage = new Set(['minecraft:oak_leaves', 'minecraft:jungle_leaves', 'minecraft:acacia_leaves', 'minecraft:dark_oak_leaves', 'minecraft:mangrove_leaves', 'minecraft:vine'])
export function blockTint (snapshot, state, position, tintIndex, colormaps) {
  if (tintIndex < 0) return 0xffffff
  if (state.name === 'minecraft:spruce_leaves') return 0x619961
  if (state.name === 'minecraft:birch_leaves') return 0x80a755
  if (grass.has(state.name)) {
    if (['minecraft:tall_grass', 'minecraft:large_fern'].includes(state.name) && state.properties.half === 'upper') position = { ...position, y: position.y - 1 }
    return blendedBiomeColor(snapshot, position, 'grass', colormaps)
  }
  if (foliage.has(state.name)) return blendedBiomeColor(snapshot, position, 'foliage', colormaps)
  throw Error(`NATIVE_BLOCK_COLOR_PROVIDER_UNSUPPORTED:${state.name}`)
}

export function modelOffset (state, position) {
  if (!state.hasOffsetFunction) return [0, 0, 0]
  const xyz = ['minecraft:short_grass', 'minecraft:fern'].includes(state.name)
  if (!xyz && !['minecraft:tall_grass', 'minecraft:large_fern'].includes(state.name)) throw Error(`NATIVE_MODEL_OFFSET_UNSUPPORTED:${state.name}`)
  const seed = blockPositionSeed({ x: position.x, y: 0, z: position.z })
  const floatRatio = n => Math.fround(Number(n) / 15)
  return [(floatRatio(seed & 15n) - 0.5) * 0.5, xyz ? (floatRatio((seed >> 4n) & 15n) - 1) * Math.fround(0.2) : 0, (floatRatio((seed >> 8n) & 15n) - 0.5) * 0.5]
}
