import { assertNativeItemStack, nativeNumericValue } from './native-item-stack.js'
import { nativeStaticItemState, nativeStaticItemEvidence, verifyNativeStaticItemEvidence } from './native-static-item-providers.js'
import { nativeBlockItemEligible, resolveNativeBlockItemModel, nativeGuiItemTransform, prepareNativeBlockGuiPlan, BLOCK_ICON_CLIENT_SHA256 } from './native-block-item-icons.js'
import { prepareNativeChestItemIcon } from './native-chest-item-icons.js'
import { nativeGuideItemEligible, prepareNativeGuideItemIcon } from './native-guide-item-icons.js'
import { nativeArsItemEligible, prepareNativeArsItemIcon } from './native-ars-item-icons.js'
import { nativeDomumItemEligible, prepareNativeDomumItemIcon } from './native-domum-item-icons.js'
import { nativeSoulSlabEligible, prepareNativeSoulSlabAppearance } from './native-soul-slab-icons.js'
import { nativePotionItemEligible, prepareNativePotionItem } from './native-potion-items.js'

export const NATIVE_ITEM_APPEARANCE_CONTEXTS = Object.freeze(['gui', 'ground',
  'firstperson_lefthand', 'firstperson_righthand', 'thirdperson_lefthand', 'thirdperson_righthand'])
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
// Preserve the previous held-tool contract, including its narrower component
// admission. This is not an additional family registration or GUI fallback.
const TOOL = /^minecraft:(wooden|stone|iron|golden|diamond|netherite)_(sword|pickaxe|axe|shovel|hoe)$/
const HELD_NON_VISUAL = new Set(['minecraft:damage', 'minecraft:custom_name', 'minecraft:item_name', 'minecraft:lore',
  'minecraft:rarity', 'minecraft:repair_cost', 'minecraft:unbreakable', 'minecraft:hide_additional_tooltip', 'minecraft:hide_tooltip'])

function contextSnapshot(input) {
  if (!record(input) || !NATIVE_ITEM_APPEARANCE_CONTEXTS.includes(input.kind) ||
      Object.keys(input).some(key => !['kind', 'observed'].includes(key)) ||
      (input.observed !== undefined && !record(input.observed))) throw Error('NATIVE_ITEM_APPEARANCE_CONTEXT_INVALID')
  let nodes = 0
  const copy = (value, depth = 0) => {
    if (++nodes > 512 || depth > 8) throw Error('NATIVE_ITEM_APPEARANCE_CONTEXT_INVALID')
    if (value === null || typeof value === 'boolean') return value
    if ((typeof value === 'string' && value.length <= 4096) || (typeof value === 'number' && Number.isFinite(value))) return value
    if ((!record(value) && !Array.isArray(value)) || ![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(value))) throw Error('NATIVE_ITEM_APPEARANCE_CONTEXT_INVALID')
    const result = Array.isArray(value) ? [] : Object.create(null)
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (Array.isArray(value) && key === 'length') continue
      if (!Object.hasOwn(descriptor, 'value') || key.length > 256) throw Error('NATIVE_ITEM_APPEARANCE_CONTEXT_INVALID')
      Object.defineProperty(result, key, { value: copy(descriptor.value, depth + 1), enumerable: true })
    }
    return Object.freeze(result)
  }
  return Object.freeze({ kind: input.kind, ...(input.observed !== undefined ? { observed: copy(input.observed) } : {}) })
}

export async function resolveNativeFlatItemTexture(reader, id, ancestry = []) {
  return validateFlatModel(await resolveNativeBlockItemModel(reader, id, ancestry))
}
function validateFlatModel(model) {
  if (!model.nativeGenerated || model.elements.length) throw Error('NATIVE_ITEM_GENERATED_PARENT_REQUIRED')
  if ((model.gui_light ?? 'front') !== 'front') throw Error('NATIVE_ITEM_GENERATED_LIGHT_UNSUPPORTED')
  const gui = nativeGuiItemTransform(model.display.gui)
  if (gui.rotation.some(x => x !== 0) || gui.translation.some(x => x !== 0) || gui.scale.some(x => x !== 1)) throw Error('NATIVE_ITEM_GUI_TRANSFORM_UNSUPPORTED')
  return model
}

function validateHeldTool(stack) {
  for (const [key, value] of Object.entries(stack.components)) {
    if (!HELD_NON_VISUAL.has(key)) throw Error(`NATIVE_HELD_ITEM_COMPONENT_UNSUPPORTED:${key}`)
    if (key === 'minecraft:damage') {
      const damage = nativeNumericValue(value)
      if (!Number.isSafeInteger(damage) || damage < 0 || damage > 2147483647) throw Error('NATIVE_HELD_DAMAGE_INVALID')
    }
  }
}

// Selection only: no rasterizer, actor, texture/URL ownership, cache or clock.
// observed is an immutable, bounded evidence snapshot. This phase deliberately
// does not evaluate active-item properties from it or infer them from SNBT.
export async function resolveNativeItemAppearance(reader, completeStack, contextInput) {
  const stack = assertNativeItemStack(completeStack), context = contextSnapshot(contextInput), gui = context.kind === 'gui'
  // Individual GUI providers retain their original source guards (the guide
  // verifies its two mod JARs); the held path additionally locks the client.
  if (reader?.manifest?.minecraftVersion !== '1.21.1' || reader.manifest.assetIntegrityVerified !== true ||
      (!gui && reader.manifest.clientJarSha256 !== BLOCK_ICON_CLIENT_SHA256) || typeof reader.json !== 'function' || typeof reader.bytes !== 'function') throw Error('NATIVE_ITEM_APPEARANCE_READER_UNVERIFIED')
  let family, prepared = null, evidence = null, model = null, modelId = stack.id.replace(':', ':item/')
  if (gui && nativeSoulSlabEligible(stack.id)) {
    family = 'soul-slab'; prepared = await prepareNativeSoulSlabAppearance(reader, stack); model = prepared.model; modelId = prepared.modelId
  } else if (gui && nativeDomumItemEligible(stack.id)) {
    family = 'domum'; prepared = await prepareNativeDomumItemIcon(reader, stack); model = prepared.model; evidence = prepared.evidence
    modelId = prepared.selectedModelId ?? modelId
  } else if (nativeArsItemEligible(stack.id)) {
    family = 'ars'; prepared = await prepareNativeArsItemIcon(reader, stack); model = prepared.model
  } else if (nativeGuideItemEligible(stack.id)) {
    family = 'guide'; prepared = await prepareNativeGuideItemIcon(reader, stack); modelId = prepared.modelId
  } else if (nativePotionItemEligible(stack.id)) {
    family = 'potion'; prepared = await prepareNativePotionItem(reader, stack)
  } else {
    // Preserve the established GUI/held eligibility difference. GUI-only mod
    // providers reach the same existing explicit unavailable diagnosis in hand.
    if (!gui && (TOOL.test(stack.id) || stack.id === 'minecraft:stick')) validateHeldTool(stack)
    else nativeStaticItemState(stack)
    family = nativeStaticItemEvidence(stack.id)?.kind === 'chest' ? 'chest' : 'static'
    if (gui || !(TOOL.test(stack.id) || stack.id === 'minecraft:stick')) evidence = verifyNativeStaticItemEvidence(reader, stack.id)
    else evidence = nativeStaticItemEvidence(stack.id)
    if (family === 'chest') { prepared = await prepareNativeChestItemIcon(reader, stack.id); model = prepared.model }
  }
  if (!model) {
    if (gui) model = await resolveNativeBlockItemModel(reader, modelId)
    else {
      if (nativeBlockItemEligible(stack.id)) model = await resolveNativeBlockItemModel(reader, modelId)
      if (!model || model.nativeGenerated) model = await resolveNativeBlockItemModel(reader, modelId, [], { generatedOnly: true })
    }
  }
  const geometry = family === 'static' ? nativeBlockItemEligible(stack.id) && !model.nativeGenerated ? 'block' : 'generated'
    : family === 'guide' || family === 'potion' || family === 'soul-slab' ? 'generated' : 'specialized'
  if (gui && ['static', 'guide'].includes(family) && geometry === 'generated') validateFlatModel(model)
  if (gui && geometry === 'block') prepared = await prepareNativeBlockGuiPlan(reader, { name: stack.id, model, evidence })
  const display = model.display ?? {}, right = context.kind.replace('_lefthand', '_righthand')
  const geometryId = family === 'ars' ? `ars_nouveau:spellbook_${gui || prepared.leaf === 'worn_notebook' ? 'closed' : 'open'}` : modelId
  return { stack, context, family, geometry, geometryId, modelId, model, display,
    selectedDisplay: display[context.kind] ?? display[right] ?? {}, prepared, evidence,
    sourcePaths: [...new Set([...(prepared?.sourcePaths ?? []), ...(model.sourcePaths ?? [])])],
    sourceVerification: !gui && (TOOL.test(stack.id) || stack.id === 'minecraft:stick') ? 'held_client_sha_and_asset_reader' : 'provider_source_and_asset_reader',
    requirements: { material: prepared?.originalMaterial ?? (gui && ['block', 'specialized'].includes(geometry) && family !== 'chest' ? 'original_opaque_gui' : 'entityCutout'),
      tintColors: family === 'potion' ? { 0: prepared.color } : null,
      effectUnavailableReason: prepared?.effectUnavailableReason ?? null,
      propertyEvaluation: 'not_implemented', pixelParityVerified: false } }
}
