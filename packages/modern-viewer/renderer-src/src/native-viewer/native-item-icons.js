import { resourcePath, textureId } from './model-loader.js'
import { NativeBlockItemIconRenderer, nativeBlockItemEligible } from './native-block-item-icons.js'

// These vanilla items have no ItemColors provider or runtime GUI model choice
// in the locked client. Mod item-color/model providers must be ported before
// their icons are enabled. The exact JSON + PNG is always read from this pack.
const STATIC_ITEMS = new Set(['wheat_seeds', 'wheat', 'rotten_flesh', 'bread', 'apple',
  'golden_apple', 'carrot', 'potato', 'baked_potato', 'beetroot', 'beetroot_seeds',
  'pumpkin_seeds', 'melon_seeds', 'melon_slice', 'sugar_cane', 'egg', 'feather',
  'leather', 'rabbit_hide', 'rabbit_foot', 'bone', 'string', 'stick', 'coal',
  'charcoal', 'iron_ingot', 'gold_ingot', 'copper_ingot', 'iron_nugget', 'gold_nugget',
  'diamond', 'emerald', 'netherite_ingot', 'redstone', 'lapis_lazuli', 'flint',
  'paper', 'book', 'writable_book', 'written_book', 'arrow', 'spectral_arrow',
  'ender_pearl', 'blaze_rod', 'blaze_powder', 'gunpowder', 'slime_ball', 'honeycomb',
  'snowball', 'sugar', 'bowl', 'brick', 'nether_brick', 'quartz', 'amethyst_shard'])
const TOOL = /^(wooden|stone|iron|golden|diamond|netherite)_(sword|pickaxe|axe|shovel|hoe)$/
const PLAIN_NATIVE_STACK = /^\{\s*(?:(?:id|"id"|'id')\s*:\s*"([a-z0-9_.-]+:[a-z0-9_./-]+)"\s*,\s*(?:count|"count"|'count')\s*:\s*(\d+)|(?:count|"count"|'count')\s*:\s*(\d+)\s*,\s*(?:id|"id"|'id')\s*:\s*"([a-z0-9_.-]+:[a-z0-9_./-]+)")\s*\}$/

export function nativeItemIconEligible(item) {
  if (!item || typeof item.name !== 'string' || !item.name.startsWith('minecraft:')) return false
  const name = item.name.slice(10)
  if (!STATIC_ITEMS.has(name) && !TOOL.test(name) && !nativeBlockItemEligible(item.name)) return false
  // No component is discarded to synthesize a generic icon. Until these
  // render rules are ported, even glint/custom-model/tinted items stay explicit.
  if (item.components && Object.keys(item.components).length) return false
  if (typeof item.snbt !== 'string') return true
  if (item.snbt.length > 8192) return false
  // Only a plain native ItemStack envelope can share a static icon cache key.
  // In particular quoted/escaped component keys must not bypass a regex and
  // silently display the generic block/tool in place of the real item.
  const plain = PLAIN_NATIVE_STACK.exec(item.snbt)
  return Boolean(plain && (plain[1] ?? plain[4]) === item.name && Number(plain[2] ?? plain[3]) === item.count)
}

export async function resolveNativeFlatItemTexture(reader, id, ancestry = []) {
  const modelPath = resourcePath(id, 'models', '.json')
  if (ancestry.length >= 32 || ancestry.includes(modelPath)) throw Error('NATIVE_ITEM_PARENT_CYCLE')
  const own = await reader.json(modelPath)
  if (own.loader || own.overrides?.length || own.elements?.length) throw Error('NATIVE_ITEM_DYNAMIC_MODEL_UNSUPPORTED')
  let parent = { textures: {}, display: {} }
  if (own.parent && own.parent !== 'builtin/generated' && own.parent !== 'minecraft:builtin/generated') {
    parent = await resolveNativeFlatItemTexture(reader, own.parent, [...ancestry, modelPath])
  } else if (!own.parent) throw Error('NATIVE_ITEM_GENERATED_PARENT_REQUIRED')
  const model = { ...parent, ...own, textures: { ...parent.textures, ...own.textures }, display: { ...parent.display, ...own.display } }
  const gui = model.display.gui
  if (gui && (gui.rotation?.some(x => x !== 0) || gui.translation?.some(x => x !== 0) || gui.scale?.some(x => x !== 1))) throw Error('NATIVE_ITEM_GUI_TRANSFORM_UNSUPPORTED')
  // Intermediate generated/handheld parents have no layer; validate the leaf
  // after all texture references and namespace-preserving inheritance resolve.
  return model
}

export class NativeItemIcons {
  constructor(reader, { onChange = () => {}, createUrl = blob => URL.createObjectURL(blob), revokeUrl = url => URL.revokeObjectURL(url), blockRendererOptions = {} } = {}) {
    this.reader = reader; this.onChange = onChange; this.createUrl = createUrl; this.revokeUrl = revokeUrl
    this.entries = new Map(); this.queue = []; this.active = 0; this.disposed = false
    this.blockRenderer = new NativeBlockItemIconRenderer(reader, blockRendererOptions)
  }
  resolve(item) {
    if (this.disposed || !nativeItemIconEligible(item)) return null
    if (!this.entries.has(item.name)) {
      if (this.entries.size >= 128) return null
      this.entries.set(item.name, { result: null, reason: 'loading' }); this.queue.push(item.name); this.pump()
    }
    return this.entries.get(item.name).result
  }
  pump() {
    while (!this.disposed && this.active < 2 && this.queue.length) {
      const name = this.queue.shift(); this.active++
      void this.load(name).finally(() => { this.active--; this.pump() })
    }
  }
  async load(name) {
    const entry = this.entries.get(name)
    try {
      if (nativeBlockItemEligible(name)) {
        const { blob, ...info } = await this.blockRenderer.render(name)
        if (this.disposed) return
        entry.result = { verified: true, url: this.createUrl(blob), sourcePath: info.sourcePaths.find(path => path.includes('/models/item/')), ...info }
        entry.reason = null
        return
      }
      const [namespace, leaf] = name.split(':')
      const model = await resolveNativeFlatItemTexture(this.reader, `${namespace}:item/${leaf}`)
      if (Object.keys(model.textures).some(key => /^layer[1-9]/.test(key)) || !model.textures.layer0) throw Error('NATIVE_ITEM_LAYERS_UNSUPPORTED')
      const png = resourcePath(textureId(model, model.textures.layer0), 'textures', '.png')
      if (this.reader.manifest.assets[`${png}.mcmeta`]) throw Error('NATIVE_ITEM_ANIMATION_UNSUPPORTED')
      const bytes = await this.reader.bytes(png)
      if (this.disposed) return
      entry.result = { verified: true, url: this.createUrl(new Blob([bytes], { type: 'image/png' })), sourcePath: png }
      entry.reason = null
    } catch(error) { entry.reason = error.message }
    finally { if (!this.disposed) this.onChange() }
  }
  dispose() {
    if (this.disposed) return
    this.disposed = true; this.queue.length = 0
    this.blockRenderer.dispose()
    for (const entry of this.entries.values()) if (entry.result) this.revokeUrl(entry.result.url)
    this.entries.clear()
  }
}
