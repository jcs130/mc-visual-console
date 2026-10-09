// Rules audited against Patchouli 1.21.1-93 and Touhou Little Maid 1.5.3.
// Patchouli's BookModel resolves the complete stack's patchouli:book through
// BookRegistry, then uses Book.model (prefixed with item/). These two known
// models are flat generated items; this is not a generic mod-item fallback.
const PATCHOULI = Object.freeze({
  name: 'Patchouli-1.21.1-93-NEOFORGE.jar',
  sha256: '959af52ed6640c316c3a8469203420be4aeea11ad6603890ba83bf48f5d9f993'
})
const MAID = Object.freeze({
  name: 'touhoulittlemaid-1.5.3-neoforge+mc1.21.1.jar',
  sha256: 'f6db04195820c8508704277ea76d63723804ff236a7b780369ba59ebe5cd9c27'
})
const BOOK_ID = 'touhou_little_maid:memorizable_gensokyo'
const GUIDE_ITEM = 'patchouli:guide_book'
const EMPTY_SLAB = 'touhou_little_maid:smart_slab_empty'

export function nativeGuideItemEligible (name) {
  return name === GUIDE_ITEM || name === EMPTY_SLAB
}

function requireSource (manifest, expected) {
  const matches = manifest.sources?.filter(source => source.name === expected.name)
  if (matches?.length !== 1 || matches[0].sha256 !== expected.sha256 || matches[0].explicitOverride) {
    throw Error('NATIVE_GUIDE_PROVIDER_SOURCE_UNVERIFIED')
  }
}

// Input is a fully parsed, validated ItemStack, not a basename or a component
// regex. The caller remains responsible for full-stack/pack-bound caching and
// for reading the selected native model/PNG through the verified asset reader.
export async function prepareNativeGuideItemIcon (reader, stack) {
  if (!stack || !nativeGuideItemEligible(stack.id)) throw Error('NATIVE_GUIDE_ITEM_UNSUPPORTED')
  if (!Number.isInteger(stack.count) || stack.count < 1 || stack.count > 64 ||
      !stack.components || typeof stack.components !== 'object' || Array.isArray(stack.components)) {
    throw Error('NATIVE_GUIDE_STACK_INVALID')
  }
  const keys = Object.keys(stack.components)
  let modelId, texture, bookId
  if (stack.id === EMPTY_SLAB) {
    // ItemSmartSlab.isFoil returns false only for EMPTY. INIT/HAS_MAID also
    // have animated textures and stored-maid state; never borrow EMPTY's PNG.
    if (keys.length) throw Error('NATIVE_GUIDE_COMPONENTS_UNSUPPORTED')
    modelId = 'touhou_little_maid:item/smart_slab_empty'
    texture = 'touhou_little_maid:item/smart_slab_empty'
  } else {
    if (keys.length !== 1 || keys[0] !== 'patchouli:book') throw Error('NATIVE_GUIDE_COMPONENTS_UNSUPPORTED')
    bookId = stack.components['patchouli:book']
    if (bookId !== BOOK_ID) throw Error('NATIVE_GUIDE_BOOK_UNSUPPORTED')
    modelId = 'touhou_little_maid:item/memorizable_gensokyo'
    texture = 'touhou_little_maid:item/memorizable_gensokyo'
  }
  const manifest = reader?.manifest
  if (manifest?.minecraftVersion !== '1.21.1' || !manifest.assetIntegrityVerified) {
    throw Error('NATIVE_GUIDE_PROVIDER_SOURCE_UNVERIFIED')
  }
  requireSource(manifest, MAID)
  if (bookId) requireSource(manifest, PATCHOULI)
  const modelPath = `assets/touhou_little_maid/models/${modelId.split(':')[1]}.json`
  const entry = manifest.assets?.[modelPath]
  if (!entry || entry.source !== MAID.name || entry.variants?.some(variant => variant.sha256 !== entry.sha256)) {
    throw Error('NATIVE_GUIDE_MODEL_SOURCE_UNVERIFIED')
  }
  const model = await reader.json(modelPath)
  if (!['item/generated', 'minecraft:item/generated'].includes(model.parent) ||
      model.loader || model.overrides?.length || model.elements?.length ||
      model.textures?.layer0 !== texture || Object.keys(model.textures ?? {}).length !== 1) {
    throw Error('NATIVE_GUIDE_MODEL_RULE_CHANGED')
  }
  return { kind: 'native-guide-flat', modelId, sourcePaths: [modelPath], ...(bookId ? { bookId } : {}) }
}
