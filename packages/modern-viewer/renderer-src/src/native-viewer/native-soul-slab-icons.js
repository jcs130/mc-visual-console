import { nativeNumericValue } from './native-item-stack.js'
import { resolveNativeBlockItemModel, nativeGuiItemTransform } from './native-block-item-icons.js'
import { animationFrames } from './texture-animation.js'

// Locked ItemSmartSlab: INIT/HAS_MAID have different item models but both
// original models select smart_slab_has_maid, a seven-frame generated sprite.
// Its owner/stored-maid components affect gameplay/tooltips, not this icon.
const SOURCE = Object.freeze({ name: 'touhoulittlemaid-1.5.3-neoforge+mc1.21.1.jar',
  sha256: 'f6db04195820c8508704277ea76d63723804ff236a7b780369ba59ebe5cd9c27' })
const CLIENT = '499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99'
const PREFIX = 'touhou_little_maid:'
const MODELS = Object.freeze({
  smart_slab_init: '98fbbd27ed26a48d8187dd5c474404704def39aa8252828a43ca940a567ed368',
  smart_slab_has_maid: '87ec385a98e04a57c37eb3042770a93e813acc80494f45121484b353c0a4d4de'
})
const PNG = 'assets/touhou_little_maid/textures/item/smart_slab_has_maid.png'
const META = `${PNG}.mcmeta`
const PNG_SHA = 'e1f986ff701bdc2fa57916e3cdfd0ce17ad66e7069e3580ff9b1ca6a88344cbd'
const META_SHA = '37ca1f757a42143edbc722b8933dc7ccb1b797ee3eaa4278783583d79858937d'
const NON_VISUAL = new Set(['minecraft:custom_name', 'minecraft:item_name', 'minecraft:lore', 'minecraft:rarity',
  'minecraft:enchantments', 'minecraft:stored_enchantments'])
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)

export const nativeSoulSlabEligible = id => typeof id === 'string' && id.startsWith(PREFIX) && Object.hasOwn(MODELS, id.slice(PREFIX.length))
export function nativeSoulSlabState(stack) {
  if (!nativeSoulSlabEligible(stack?.id)) throw Error('NATIVE_SOUL_SLAB_ITEM_UNSUPPORTED')
  if (stack.count !== 1 || !record(stack.components)) throw Error('NATIVE_SOUL_SLAB_STACK_INVALID')
  let foil = true // ItemSmartSlab.isFoil is always true for INIT/HAS_MAID.
  for (const [key, value] of Object.entries(stack.components)) {
    if (NON_VISUAL.has(key)) continue
    if (key === 'touhou_little_maid:init_maid_owner' && stack.id.endsWith(':smart_slab_init')) continue
    if (key === 'touhou_little_maid:maid_info' && stack.id.endsWith(':smart_slab_has_maid')) continue
    if (key === 'minecraft:enchantment_glint_override') {
      const number = nativeNumericValue(value)
      if (typeof value !== 'boolean' && number !== 0 && number !== 1) throw Error('NATIVE_SOUL_SLAB_GLINT_STATE_INVALID')
      foil = typeof value === 'boolean' ? value : number === 1
      continue
    }
    if (key === '!minecraft:enchantment_glint_override' && record(value) && Object.keys(value).length === 0) continue
    throw Error(`NATIVE_SOUL_SLAB_COMPONENT_UNSUPPORTED:${key}`)
  }
  return { modelId: `${PREFIX}item/${stack.id.slice(PREFIX.length)}`, foil }
}
function requireAsset(reader, path, sha, bytes = null) {
  const entry = reader.manifest.assets?.[path]
  if (!entry || entry.source !== SOURCE.name || entry.sha256 !== sha || (bytes !== null && entry.bytes !== bytes) ||
      entry.variants?.some(variant => variant.sha256 !== sha)) throw Error('NATIVE_SOUL_SLAB_ASSET_SOURCE_UNVERIFIED')
}
export async function prepareNativeSoulSlabIcon(reader, stack) {
  const state = nativeSoulSlabState(stack), manifest = reader?.manifest
  const sources = manifest?.sources?.filter(source => source.name === SOURCE.name)
  if (manifest?.minecraftVersion !== '1.21.1' || manifest.clientJarSha256 !== CLIENT || !manifest.assetIntegrityVerified ||
      sources?.length !== 1 || sources[0].sha256 !== SOURCE.sha256 || sources[0].explicitOverride) throw Error('NATIVE_SOUL_SLAB_SOURCE_UNVERIFIED')
  const path = `assets/touhou_little_maid/models/item/${stack.id.slice(PREFIX.length)}.json`
  requireAsset(reader, path, MODELS[stack.id.slice(PREFIX.length)])
  requireAsset(reader, PNG, PNG_SHA, 882); requireAsset(reader, META, META_SHA, 39)
  const model = await resolveNativeBlockItemModel(reader, state.modelId)
  const gui = nativeGuiItemTransform(model.display.gui)
  if (!model.nativeGenerated || model.elements.length || (model.gui_light ?? 'front') !== 'front' ||
      gui.rotation.some(x => x !== 0) || gui.translation.some(x => x !== 0) || gui.scale.some(x => x !== 1) ||
      Object.keys(model.textures).length !== 1 || model.textures.layer0 !== 'touhou_little_maid:item/smart_slab_has_maid') throw Error('NATIVE_SOUL_SLAB_MODEL_RULE_CHANGED')
  const [bytes, meta] = await Promise.all([reader.bytes(PNG), reader.json(META)])
  if (bytes.length !== 882 || bytes.length < 24 || ![137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) throw Error('NATIVE_SOUL_SLAB_PNG_INVALID')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(16) !== 16 || view.getUint32(20) !== 112) throw Error('NATIVE_SOUL_SLAB_PNG_INVALID')
  const frames = animationFrames(meta, 16, 112)
  if (frames.frameWidth !== 16 || frames.frameHeight !== 16 || frames.interpolate || frames.frames.length !== 7 ||
      frames.frames.some((f,i) => f.index !== i || f.time !== 2)) throw Error('NATIVE_SOUL_SLAB_ANIMATION_RULE_CHANGED')
  return { blob: new Blob([bytes], { type: 'image/png' }), kind: 'native-soul-slab-sheet', modelId: state.modelId,
    sourcePath: PNG, sourcePaths: [...new Set([...model.sourcePaths, PNG, META])],
    animation: { kind: 'native-soul-slab-sheet-v1', frameCount: 7, frameTicks: 2, tickMs: 50, frameWidth: 16, frameHeight: 16, sheetHeight: 112 },
    foil: state.foil, glintVerified: !state.foil, pixelParityVerified: false,
    // Native ItemRenderer forwards atlas UVs to the glint pass. The original
    // atlas placement is unavailable; do not invent a normalized-UV shimmer.
    effectUnavailableReason: state.foil ? 'NATIVE_GUI_GLINT_ATLAS_UV_UNAVAILABLE' : null }
}

export const NATIVE_SOUL_SLAB_KEYFRAMES = '@keyframes corti-native-soul-slab{from{transform:translateY(0)}to{transform:translateY(-100%)}}'
export function nativeSoulSlabAnimationStyle(animation, now = Date.now()) {
  if (!record(animation) || animation.kind !== 'native-soul-slab-sheet-v1' || animation.frameCount !== 7 ||
      animation.frameTicks !== 2 || animation.tickMs !== 50 || animation.frameWidth !== 16 || animation.frameHeight !== 16 ||
      animation.sheetHeight !== 112 || !Number.isFinite(animation.epochMs) || !Number.isFinite(now)) throw Error('NATIVE_SOUL_SLAB_ANIMATION_INVALID')
  const durationMs = animation.frameCount * animation.frameTicks * animation.tickMs
  const elapsed = Math.max(0, now - animation.epochMs) % durationMs
  return { height: '224px', animation: `corti-native-soul-slab ${durationMs}ms steps(7,end) infinite`, animationDelay: `${-elapsed}ms` }
}
