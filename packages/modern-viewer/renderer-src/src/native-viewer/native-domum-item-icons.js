import { bakeFaces, resourcePath, textureId } from './model-loader.js'
import { parseNativeItemStack, nativeNumericValue } from './native-item-stack.js'
import { NativeBlockItemIconRenderer, prepareNativeBlockGuiPlan, resolveNativeBlockItemModel } from './native-block-item-icons.js'
import { verifyNativeStaticItemEvidence } from './native-static-item-providers.js'

// Locked Domum 1.0.231: MateriallyTexturedModelLoader -> parent geometry;
// ModBusEventHandler.getTypeOrdinal -> TrapdoorType ordinal -> last matching
// original item override. RetexturedBakedModelBuilder + ModelSpriteQuadTransformer
// preserve original geometry/UV and replace its sprite. This bounded provider
// accepts only PanelBlockItem with an explicit, opaque, untinted uniform cube
// material. Random material generation, translucent/tinted/dynamic blocks and
// other Domum item classes stay unavailable. Java pixel parity is unverified.
export const DOMUM_ITEM_SOURCE = Object.freeze({ name: 'domum-ornamentum-1.0.231-main.jar',
  sha256: '04c0c902bdbcbd48e38bee5a323907ae0b7b7db4ff4a3e4da7c45334b65610a1' })
export const DOMUM_PANEL_TYPES = Object.freeze(['boss', 'coffer', 'full', 'horizontal_bars',
  'horizontally_squiggly_striped', 'horizontally_striped', 'moulding', 'port_manteau', 'porthole',
  'roundel', 'slot', 'vertical_bars', 'vertically_squiggly_striped', 'vertically_striped', 'waffle'])
const MATERIALS = new Set(`stone cobblestone granite polished_granite diorite polished_diorite andesite polished_andesite
  bricks stone_bricks cracked_stone_bricks chiseled_stone_bricks smooth_stone
  oak_planks spruce_planks birch_planks jungle_planks acacia_planks dark_oak_planks cherry_planks mangrove_planks
  crimson_planks warped_planks bamboo_planks`.trim().split(/\s+/).map(id => `minecraft:${id}`))
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const MATERIAL_KEY = 'minecraft:block/oak_planks'
const NON_VISUAL = new Set(['minecraft:custom_name', 'minecraft:item_name', 'minecraft:lore', 'minecraft:rarity',
  'minecraft:repair_cost', 'minecraft:unbreakable', 'minecraft:hide_tooltip', 'minecraft:hide_additional_tooltip'])
export const nativeDomumItemEligible = name => name === 'domum_ornamentum:panel'

export function nativeDomumItemState(input) {
  const stack = input?.id ? input : parseNativeItemStack(input)
  if (!nativeDomumItemEligible(stack.id) || !Number.isSafeInteger(stack.count) || stack.count <= 0 || !record(stack.components)) throw Error('NATIVE_DOMUM_ITEM_IDENTITY_INVALID')
  const components = stack.components
  for (const key of Object.keys(components)) if (!NON_VISUAL.has(key) &&
    !['domum_ornamentum:texture_data', 'minecraft:block_state', 'minecraft:enchantment_glint_override'].includes(key)) throw Error(`NATIVE_DOMUM_ITEM_COMPONENT_UNSUPPORTED:${key}`)
  if (Object.hasOwn(components, 'minecraft:enchantment_glint_override')) {
    const n = nativeNumericValue(components['minecraft:enchantment_glint_override'])
    if (n !== 0) throw Error('NATIVE_DOMUM_ITEM_GLINT_UNSUPPORTED')
  }
  const materials = components['domum_ornamentum:texture_data']
  if (!record(materials) || Object.keys(materials).length !== 1 || !MATERIALS.has(materials[MATERIAL_KEY])) throw Error('NATIVE_DOMUM_ITEM_MATERIAL_UNSUPPORTED')
  const properties = components['minecraft:block_state'] ?? {}
  if (!record(properties) || Object.keys(properties).some(key => key !== 'type') ||
    (Object.hasOwn(properties, 'type') && typeof properties.type !== 'string')) throw Error('NATIVE_DOMUM_ITEM_VARIANT_UNSUPPORTED')
  const type = properties.type?.toLowerCase() ?? 'full'
  if (!DOMUM_PANEL_TYPES.includes(type)) throw Error('NATIVE_DOMUM_ITEM_VARIANT_UNSUPPORTED')
  return { stack, type, ordinal: DOMUM_PANEL_TYPES.indexOf(type), materialId: materials[MATERIAL_KEY] }
}

function verifyDomumSource(reader, path) {
  const sources = reader.manifest.sources?.filter(source => source.name === DOMUM_ITEM_SOURCE.name)
  if (sources?.length !== 1 || sources[0].sha256 !== DOMUM_ITEM_SOURCE.sha256 || sources[0].explicitOverride) throw Error('NATIVE_DOMUM_ITEM_SOURCE_UNVERIFIED')
  const entry = reader.manifest.assets[path]
  if (entry?.source !== DOMUM_ITEM_SOURCE.name || entry.overriddenSources?.length) throw Error(`NATIVE_DOMUM_ITEM_ASSET_SOURCE_UNVERIFIED:${path}`)
}

async function uniformMaterial(reader, id) {
  const evidence = verifyNativeStaticItemEvidence(reader, id)
  const path = resourcePath(id, 'blockstates', '.json'), state = await reader.json(path)
  if (!record(state.variants) || state.multipart || Object.keys(state.variants).length !== 1) throw Error('NATIVE_DOMUM_ITEM_MATERIAL_MODEL_UNSUPPORTED')
  const variants = Array.isArray(state.variants['']) ? state.variants[''] : [state.variants['']]
  if (!variants.length || variants.length > 16) throw Error('NATIVE_DOMUM_ITEM_MATERIAL_MODEL_UNSUPPORTED')
  const textures = new Set(), sourcePaths = [path], directions = ['down', 'up', 'north', 'south', 'west', 'east']
  for (const variant of variants) {
    if (!record(variant) || Object.keys(variant).some(key => !['model', 'x', 'y', 'uvlock', 'weight'].includes(key)) ||
      ['x', 'y'].some(key => variant[key] !== undefined && ![0, 90, 180, 270].includes(variant[key])) ||
      (variant.uvlock !== undefined && typeof variant.uvlock !== 'boolean') ||
      (variant.weight !== undefined && (!Number.isSafeInteger(variant.weight) || variant.weight < 1 || variant.weight > 1024))) throw Error('NATIVE_DOMUM_ITEM_MATERIAL_MODEL_UNSUPPORTED')
    const model = await resolveNativeBlockItemModel(reader, variant.model), element = model.elements[0]
    if (model.nativeGenerated || model.elements.length !== 1 || !record(element) || element.rotation || !record(element.faces) ||
      JSON.stringify(element.from) !== '[0,0,0]' || JSON.stringify(element.to) !== '[16,16,16]' ||
      Object.keys(element.faces).length !== 6 || directions.some(direction => !record(element.faces[direction]) ||
        element.faces[direction].cullface !== direction || element.faces[direction].tintindex !== undefined) ||
      (model.render_type !== undefined && !['solid', 'minecraft:solid'].includes(model.render_type))) throw Error('NATIVE_DOMUM_ITEM_MATERIAL_MODEL_UNSUPPORTED')
    for (const face of bakeFaces(model)) textures.add(face.texture)
    sourcePaths.push(...model.sourcePaths)
  }
  // The original transformer copies the sprite, not the target quad's UV.
  // Weighted/rotated stone variants are safe only when EVERY possible quad
  // yields the same untinted sprite. No random selection is invented here.
  if (textures.size !== 1) throw Error('NATIVE_DOMUM_ITEM_MATERIAL_MODEL_UNSUPPORTED')
  return { texture: [...textures][0], evidence, sourcePaths }
}

export async function prepareNativeDomumItemIcon(reader, input) {
  const state = nativeDomumItemState(input), itemPath = 'assets/domum_ornamentum/models/item/panel.json'
  verifyDomumSource(reader, itemPath)
  const root = await reader.json(itemPath)
  if (root.loader !== 'domum_ornamentum:materially_textured' || root.parent !== 'domum_ornamentum:item/panel_spec') throw Error('NATIVE_DOMUM_ITEM_LOADER_UNSUPPORTED')
  const parentPath = resourcePath(root.parent, 'models', '.json'); verifyDomumSource(reader, parentPath)
  const parent = await reader.json(parentPath)
  if (parent.parent !== 'minecraft:block/thin_block' || parent.loader ||
    (parent.display !== undefined && !record(parent.display)) ||
    !Array.isArray(parent.overrides) || parent.overrides.length !== DOMUM_PANEL_TYPES.length) throw Error('NATIVE_DOMUM_ITEM_OVERRIDES_UNSUPPORTED')
  for (const [ordinal, override] of parent.overrides.entries()) {
    if (!record(override) || !record(override.predicate) || Object.keys(override.predicate).length !== 1 ||
      override.predicate['domum_ornamentum:trapdoor_type'] !== ordinal ||
      override.model !== `domum_ornamentum:block/panel/panel_${DOMUM_PANEL_TYPES[ordinal]}_spec`) throw Error('NATIVE_DOMUM_ITEM_OVERRIDES_UNSUPPORTED')
  }
  const modelId = parent.overrides[state.ordinal].model, modelPath = resourcePath(modelId, 'models', '.json')
  verifyDomumSource(reader, modelPath)
  // NeoForge 21.1.248 ItemRenderer applies the camera transform BEFORE calling
  // getRenderPasses. MateriallyTexturedBakedModel.getTransforms delegates to
  // panel_spec; only getRenderPasses resolves the selected child geometry.
  // Consequently neither the child's display nor the custom-loader root's
  // display controls this GUI transform. Resolve the original parent chain.
  const base = await resolveNativeBlockItemModel(reader, parent.parent)
  const model = await resolveNativeBlockItemModel(reader, modelId), material = await uniformMaterial(reader, state.materialId)
  const replaced = { ...model, display: { ...base.display, ...parent.display },
    gui_light: parent.gui_light ?? base.gui_light,
    textures: Object.fromEntries(Object.entries(model.textures).map(([key, value]) =>
    [key, textureId(model, value) === MATERIAL_KEY ? material.texture : value])) }
  const plan = await prepareNativeBlockGuiPlan(reader, { name: state.stack.id, model: replaced,
    evidence: { source: DOMUM_ITEM_SOURCE, itemClass: 'PanelBlockItem', type: state.type, materialId: state.materialId,
      selection: 'original_trapdoor_type_ordinal_override', materialSource: material.evidence },
    sourcePaths: [itemPath, parentPath, ...base.sourcePaths, ...material.sourcePaths] })
  return { ...plan, kind: 'native-domum-panel-gui' }
}

export class NativeDomumItemIconRenderer extends NativeBlockItemIconRenderer {
  constructor(reader, options = {}) { super(reader, { ...options, preparePlan: prepareNativeDomumItemIcon }) }
}
