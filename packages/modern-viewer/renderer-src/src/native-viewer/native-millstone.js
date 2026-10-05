import { resolveModel, bakeFaces, resourcePath } from './model-loader.js'

// Locked Create 6.0.10 MillstoneRenderer (8ff700c2481772e85355f72b27719fa70e8fa39de69a22f6f2db7109787f1d57)
// returns AllPartialModels.MILLSTONE_COG = block("millstone/inner"). Its
// MillstoneBlock.getRotationAxis() is Y; the normal block model stays still.
export const MILLSTONE_ID = 'create:millstone'
export const MILLSTONE_SOURCE = Object.freeze({ name: 'create-1.21.1-6.0.10.jar',
  sha256: 'ef87fe5709f1ba1f5b8bb20a2925b5afb4669e178fd6d8bf10c167759eefe37a' })
const CLIENT = Object.freeze({ name: 'minecraft-1.21.1-client.jar',
  sha256: '499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99' })
export const MILLSTONE_ASSETS = Object.freeze({
  blockstate: Object.freeze({ path: 'assets/create/blockstates/millstone.json', bytes: 85,
    sha256: 'e59885ea8662d36294b6f22c1c25b1fcbd8afb90ce138b63eb5220af191cd182' }),
  body: Object.freeze({ path: 'assets/create/models/block/millstone/block.json', bytes: 2373,
    sha256: '3f89721be47d1c11825074b8a36baf80acc1bf7737b3bf55e1978370558a411c' }),
  rotor: Object.freeze({ path: 'assets/create/models/block/millstone/inner.json', bytes: 4342,
    sha256: 'bda2da531800443cdaa976e61a13984f6dd8c80df193f837b8d7bc366e97753c' }),
  millstone: Object.freeze({ path: 'assets/create/textures/block/millstone.png', bytes: 639,
    sha256: 'ffe5d934c4749f628a22dd8e3f57ac705a02a250dd5b48388eabf16cc4a194a3' }),
  gearbox: Object.freeze({ path: 'assets/create/textures/block/gearbox.png', bytes: 362,
    sha256: '7d33b15de024daa08ecec5d90c365114bea7c81370c99a0c566053e699800181' }),
  axis: Object.freeze({ path: 'assets/create/textures/block/axis.png', bytes: 161,
    sha256: '0ae58aa6fcc369fee5a49270827bfa572631078f57163b8344f97ea5fcde2441' }),
  axisTop: Object.freeze({ path: 'assets/create/textures/block/axis_top.png', bytes: 124,
    sha256: 'd96400565f72e7270eeb9daaab2b1cf2a450e9491bbd488d217ed5f7e49c4bc3' })
})
export const MILLSTONE_UNAVAILABLE_LAYERS = Object.freeze([
  'NATIVE_MILLSTONE_STRESS_DEBUG_COLOR_UNAVAILABLE',
  'NATIVE_MILLSTONE_PROCESSING_PARTICLES_UNAVAILABLE',
  'NATIVE_MILLSTONE_AMBIENT_SOUND_UNAVAILABLE',
  'NATIVE_MILLSTONE_JAVA_REFERENCE_PHASE_UNVERIFIED'
])

export function verifyNativeMillstoneSource(reader) {
  const manifest = reader?.manifest
  if (manifest?.minecraftVersion !== '1.21.1' || manifest.assetIntegrityVerified !== true ||
      manifest.clientJarSha256 !== CLIENT.sha256 || !Array.isArray(manifest.sources)) throw Error('NATIVE_MILLSTONE_MANIFEST_UNVERIFIED')
  for (const expected of [CLIENT, MILLSTONE_SOURCE]) {
    const sources = manifest.sources.filter(source => source?.name === expected.name)
    if (sources.length !== 1 || sources[0].sha256 !== expected.sha256 || sources[0].explicitOverride) throw Error('NATIVE_MILLSTONE_SOURCE_UNVERIFIED')
  }
}
async function verifiedAsset(reader, entry) {
  const actual = reader.manifest.assets?.[entry.path]
  if (actual?.source !== MILLSTONE_SOURCE.name || actual.sha256 !== entry.sha256 || actual.bytes !== entry.bytes) throw Error(`NATIVE_MILLSTONE_ASSET_UNVERIFIED:${entry.path}`)
  // The reader still owns content SHA/length and conflicting resource priority.
  // A matching selected entry never permits ignoring a different variants SHA.
  await reader.bytes(entry.path)
}

export async function prepareNativeMillstoneModel(reader, state, part = 'body') {
  verifyNativeMillstoneSource(reader)
  if (state?.name !== MILLSTONE_ID || state.renderShape !== 'MODEL' || state.hasBlockEntity !== true ||
      !Number.isSafeInteger(state.stateId) || state.stateId < 0 || state.stateId > 2147483647 || !['body', 'rotor'].includes(part)) throw Error('NATIVE_MILLSTONE_STATE_UNSUPPORTED')
  await verifiedAsset(reader, MILLSTONE_ASSETS.blockstate)
  const blockstate = await reader.json(MILLSTONE_ASSETS.blockstate.path)
  if (!blockstate.variants || Object.keys(blockstate.variants).length !== 1 ||
      blockstate.variants['']?.model !== 'create:block/millstone/block' || blockstate.multipart) throw Error('NATIVE_MILLSTONE_BLOCKSTATE_UNSUPPORTED')
  await verifiedAsset(reader, MILLSTONE_ASSETS[part])
  const modelId = part === 'body' ? 'create:block/millstone/block' : 'create:block/millstone/inner'
  const model = await resolveModel(reader, modelId), faces = bakeFaces(model)
  const textures = [...new Set(faces.map(face => resourcePath(face.texture, 'textures', '.png')))]
  const permitted = part === 'body' ? [MILLSTONE_ASSETS.millstone, MILLSTONE_ASSETS.gearbox]
    : [MILLSTONE_ASSETS.millstone, MILLSTONE_ASSETS.axis, MILLSTONE_ASSETS.axisTop]
  if (!faces.length || faces.length > 256 || faces.some(face => face.tintIndex >= 0)) throw Error('NATIVE_MILLSTONE_GEOMETRY_UNSUPPORTED')
  for (const path of textures) {
    const original = permitted.find(entry => entry.path === path)
    if (!original || reader.manifest.assets[`${path}.mcmeta`]) throw Error(`NATIVE_MILLSTONE_TEXTURE_STATE_UNSUPPORTED:${path}`)
    await verifiedAsset(reader, original)
  }
  return { part, modelId, axis: 'y', faces, sourcePaths: [...model.sourcePaths, ...textures],
    source: MILLSTONE_SOURCE, pixelParityVerified: false, unavailableLayers: MILLSTONE_UNAVAILABLE_LAYERS }
}

// Ponder 1.0.82 AnimationTickHolder.class SHA256:
// 481d3864f63b513f61e715cf49fc20457a6260d8ef2882111b46a1ee62a90f6c.
// Ordinary worlds use CLIENT ticks + partial tick, not server world age.
// This passive browser starts its own render clock at the connection epoch.
// It cannot establish another Java client's absolute phase or DeltaTracker.
export class NativeKineticRenderClock {
  constructor() { this.reset() }
  reset() { this.startedAt = null; this.lastAt = null; this.pausedAt = null }
  pause(now) { this.sample(now); this.pausedAt ??= now }
  resume(now) {
    if (!Number.isFinite(now) || now < 0 || (this.lastAt !== null && now < this.lastAt)) throw Error('NATIVE_KINETIC_RENDER_CLOCK_INVALID')
    if (this.pausedAt !== null) { this.startedAt += now - this.pausedAt; this.pausedAt = null }
    this.lastAt = now
  }
  sample(now) {
    if (!Number.isFinite(now) || now < 0 || (this.lastAt !== null && now < this.lastAt)) throw Error('NATIVE_KINETIC_RENDER_CLOCK_INVALID')
    this.startedAt ??= now; this.lastAt = now
    const elapsed = (this.pausedAt ?? now) - this.startedAt, elapsedTicks = Math.floor(elapsed / 50)
    if (!Number.isSafeInteger(elapsedTicks)) throw Error('NATIVE_KINETIC_RENDER_CLOCK_INVALID')
    const ticks = elapsedTicks % 1728000, partialTick = Math.fround((elapsed % 50) / 50)
    return { ticks, elapsedTicks, partialTick, renderTicks: Math.fround(ticks + partialTick),
      source: 'browser_animation_tick_holder', paused: this.pausedAt !== null, javaReferencePhaseVerified: false }
  }
}

// A viewer guard, not a Minecraft setting: a missing/stale native clock cannot
// be presented as a confirmed running or stopped rotor. Geometry stays readable.
export function nativeKineticTimeStatus(time, now, { paused = false } = {}) {
  if (paused) return { available: false, reason: 'NATIVE_KINETIC_RENDER_CLOCK_PAUSED' }
  if (!Number.isSafeInteger(time?.age) || time.age < 0 || !Number.isFinite(time.receivedAt) ||
      !Number.isFinite(now) || time.receivedAt < 0 || now < time.receivedAt) return { available: false, reason: 'NATIVE_KINETIC_NATIVE_TIME_UNAVAILABLE' }
  if (now - time.receivedAt > 15000) return { available: false, reason: 'NATIVE_KINETIC_NATIVE_TIME_STALE' }
  return { available: true }
}
