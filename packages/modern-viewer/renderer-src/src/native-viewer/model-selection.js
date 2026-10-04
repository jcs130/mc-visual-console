// Minecraft 1.21.1 client (SHA-1 30c73b1c5da787909b2f73340419fdf13b9def88):
// Mth.getSeed, BlockBehaviour.getSeed, LegacyRandomSource, BitRandomSource and
// WeightedBakedModel checked against the installed official client bytecode.
// Texture variation depends on BlockState.getSeed(position), not the world seed.
const CLIENT_SHA1 = '30c73b1c5da787909b2f73340419fdf13b9def88'
const BLOCK_BEHAVIOUR = 'net.minecraft.world.level.block.state.BlockBehaviour'
const BLOCK = 'net.minecraft.world.level.block.Block'
// Explicit original Blocks registrations and their complete getSeed inheritance
// chains, checked in that client JAR. No member in these chains overrides
// BlockBehaviour.getSeed(BlockState, BlockPos), which delegates to Mth.getSeed.
// This is NOT a namespace-wide certificate for vanilla or modded blocks.
const DEFAULT_SEED_BLOCKS = Object.freeze({
  'minecraft:stone': Object.freeze([BLOCK, BLOCK_BEHAVIOUR]),
  'minecraft:sand': Object.freeze(['net.minecraft.world.level.block.ColoredFallingBlock', 'net.minecraft.world.level.block.FallingBlock', BLOCK, BLOCK_BEHAVIOUR]),
  'minecraft:dirt': Object.freeze([BLOCK, BLOCK_BEHAVIOUR]),
  'minecraft:grass_block': Object.freeze(['net.minecraft.world.level.block.GrassBlock', 'net.minecraft.world.level.block.SpreadingSnowyDirtBlock', 'net.minecraft.world.level.block.SnowyDirtBlock', BLOCK, BLOCK_BEHAVIOUR]),
  'minecraft:dirt_path': Object.freeze(['net.minecraft.world.level.block.DirtPathBlock', BLOCK, BLOCK_BEHAVIOUR])
})

export function defaultBlockSeedEvidence (state) {
  if (!Object.hasOwn(DEFAULT_SEED_BLOCKS, state?.name)) return null
  const inheritance = DEFAULT_SEED_BLOCKS[state?.name]
  // Retain the original state schema as well as its registry name. A caller's
  // modelSeedVerified flag cannot authorize another block or unknown property.
  const properties = state.properties
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return null
  const keys = Object.keys(properties)
  if (state.name === 'minecraft:grass_block') {
    if (keys.length !== 1 || keys[0] !== 'snowy' || !['true', 'false'].includes(properties.snowy)) return null
  } else if (keys.length !== 0) return null
  return { minecraftVersion: '1.21.1', clientSha1: CLIENT_SHA1, algorithm: 'block_behaviour_position_seed', getSeedOwner: BLOCK_BEHAVIOUR, inheritance }
}

export function blockPositionSeed (position) {
  if (!position || ![position.x, position.y, position.z].every(Number.isInteger)) throw Error('NATIVE_MODEL_POSITION_REQUIRED')
  const x = BigInt.asIntN(32, BigInt(position.x) * 3129871n)
  let value = x ^ (BigInt(position.z) * 116129781n) ^ BigInt(position.y)
  value = BigInt.asIntN(64, value * value * 42317861n + value * 11n)
  return value >> 16n
}

export class LegacyModelRandom {
  constructor (seed) { this.seed = (BigInt(seed) ^ 25214903917n) & 281474976710655n }
  next32 () {
    this.seed = (this.seed * 25214903917n + 11n) & 281474976710655n
    return BigInt.asIntN(32, this.seed >> 16n)
  }
  nextLong () { return BigInt.asIntN(64, (this.next32() << 32n) + this.next32()) }
}

export function weightedModel (variants, position) {
  const weights = variants.map(v => v.weight ?? 1)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (!weights.every(w => Number.isSafeInteger(w) && w > 0) || total > 2147483647) throw Error('NATIVE_MODEL_WEIGHT_INVALID')
  const value = Number(BigInt.asIntN(32, new LegacyModelRandom(blockPositionSeed(position)).nextLong()))
  // Java Math.abs(Integer.MIN_VALUE) stays negative; preserve that corner case.
  let roll = (value === -2147483648 ? value : Math.abs(value)) % total
  for (let i = 0; i < variants.length; i++) { roll -= weights[i]; if (roll < 0) return variants[i] }
  throw Error('NATIVE_MODEL_WEIGHT_SELECTION_FAILED')
}

export function multipartMatches (condition, properties, depth = 0) {
  if (!condition) return true
  if (depth > 32 || typeof condition !== 'object' || Array.isArray(condition)) throw Error('NATIVE_MULTIPART_CONDITION_INVALID')
  return Object.entries(condition).every(([name, value]) => {
    if (name === 'OR' || name === 'AND') {
      if (!Array.isArray(value)) throw Error('NATIVE_MULTIPART_CONDITION_INVALID')
      return name === 'OR' ? value.some(c => multipartMatches(c, properties, depth + 1)) : value.every(c => multipartMatches(c, properties, depth + 1))
    }
    if (typeof value !== 'string' || !(name in properties)) throw Error('NATIVE_MULTIPART_PROPERTY_UNAVAILABLE')
    const negate = value.startsWith('!')
    const match = (negate ? value.slice(1) : value).split('|').includes(String(properties[name]))
    return negate ? !match : match
  })
}
