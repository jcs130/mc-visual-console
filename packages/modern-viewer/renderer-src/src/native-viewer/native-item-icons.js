import { resourcePath, textureId } from './model-loader.js'
import { NativeBlockItemIconRenderer, nativeBlockItemEligible, resolveNativeBlockItemModel, nativeGuiItemTransform } from './native-block-item-icons.js'
import { parseNativeItemStack } from './native-item-stack.js'
import { nativeGuideItemEligible, prepareNativeGuideItemIcon } from './native-guide-item-icons.js'
import { nativeArsItemEligible, NativeArsItemIconRenderer } from './native-ars-item-icons.js'
import { nativeStaticItemState, verifyNativeStaticItemEvidence } from './native-static-item-providers.js'
import { nativeDomumItemEligible, nativeDomumItemState, NativeDomumItemIconRenderer } from './native-domum-item-icons.js'

export function nativeItemIconEligible(item) {
  try {
    const stack = parseNativeItemStack(item)
    if (nativeDomumItemEligible(stack.id)) nativeDomumItemState(stack)
    else nativeStaticItemState(stack)
    return true
  } catch { return false }
}

export async function resolveNativeFlatItemTexture(reader, id, ancestry = []) {
  const model = await resolveNativeBlockItemModel(reader, id, ancestry)
  if (!model.nativeGenerated || model.elements.length) throw Error('NATIVE_ITEM_GENERATED_PARENT_REQUIRED')
  if ((model.gui_light ?? 'front') !== 'front') throw Error('NATIVE_ITEM_GENERATED_LIGHT_UNSUPPORTED')
  const gui = nativeGuiItemTransform(model.display.gui)
  if (gui.rotation.some(x => x !== 0) || gui.translation.some(x => x !== 0) || gui.scale.some(x => x !== 1)) throw Error('NATIVE_ITEM_GUI_TRANSFORM_UNSUPPORTED')
  // Intermediate generated/handheld parents have no layer; validate the leaf
  // after all texture references and namespace-preserving inheritance resolve.
  return model
}

export class NativeItemIcons {
  constructor(reader, { onChange = () => {}, createUrl = blob => URL.createObjectURL(blob), revokeUrl = url => URL.revokeObjectURL(url), blockRendererOptions = {}, arsRendererOptions = {}, domumRendererOptions = {} } = {}) {
    this.reader = reader; this.onChange = onChange; this.createUrl = createUrl; this.revokeUrl = revokeUrl
    this.entries = new Map(); this.queue = []; this.active = 0; this.disposed = false
    this.blockRenderer = new NativeBlockItemIconRenderer(reader, blockRendererOptions)
    this.arsRenderer = new NativeArsItemIconRenderer(reader, arsRendererOptions)
    this.domumRenderer = new NativeDomumItemIconRenderer(reader, domumRendererOptions)
  }
  resolve(item) {
    if (this.disposed) return null
    let provider = null, stack = null, key = item?.name
    try { stack = parseNativeItemStack(item) } catch { return null }
    if (nativeGuideItemEligible(key) || nativeArsItemEligible(key)) {
      provider = nativeGuideItemEligible(key) ? 'guide' : 'ars'
      // Bind to the complete authoritative SNBT, including numeric tag types.
      // JSON.stringify would conflate a typed tag wrapper with a compound that
      // happens to contain the same type/value fields. Never share their icon.
      // Input is bounded to 64 KiB and this cache to 128 entries.
    } else if (nativeDomumItemEligible(key)) {
      try { nativeDomumItemState(stack); provider = 'domum' } catch { return null }
    } else {
      try { nativeStaticItemState(stack); provider = 'static' } catch { return null }
    }
    // Every provider binds to complete authoritative SNBT, including visual
    // inputs, removal patches and tag types. No name-only generic icon cache.
    key += '#' + item.snbt
    if (!this.entries.has(key)) {
      if (this.entries.size >= 128) return null
      this.entries.set(key, { result: null, reason: 'loading', name: item.name, provider, stack }); this.queue.push(key); this.pump()
    }
    return this.entries.get(key).result
  }
  reason(item) {
    if(this.disposed) return 'NATIVE_ITEM_ICONS_DISPOSED'
    try {
      const stack=parseNativeItemStack(item)
      if (nativeDomumItemEligible(item.name)) nativeDomumItemState(stack)
      else if(!nativeGuideItemEligible(item.name)&&!nativeArsItemEligible(item.name))nativeStaticItemState(stack)
      const entry=this.entries.get(item.name+'#'+item.snbt)
      return entry ? entry.reason : this.entries.size>=128?'NATIVE_ITEM_ICON_CACHE_LIMIT':'not_requested'
    } catch(error) { return error.message }
  }
  pump() {
    while (!this.disposed && this.active < 2 && this.queue.length) {
      const name = this.queue.shift(); this.active++
      void this.load(name).finally(() => { this.active--; this.pump() })
    }
  }
  async load(key) {
    const entry = this.entries.get(key), name = entry.name
    try {
      if (entry.provider === 'ars' || entry.provider === 'domum') {
        const renderer = entry.provider === 'ars' ? this.arsRenderer : this.domumRenderer
        const { blob, ...info } = await renderer.render(entry.stack)
        if (this.disposed) return
        entry.result = { verified: true, url: this.createUrl(blob), sourcePath: info.sourcePaths.find(path => path.includes('/models/item/')), ...info }
        entry.reason = null
        return
      }
      const evidence = entry.provider === 'static' ? verifyNativeStaticItemEvidence(this.reader,name) : null
      const blockModel = nativeBlockItemEligible(name) ? await resolveNativeBlockItemModel(this.reader,name.replace(':',':item/')) : null
      if (blockModel && !blockModel.nativeGenerated) {
        const { blob, ...info } = await this.blockRenderer.render(name)
        if (this.disposed) return
        entry.result = { verified: true, url: this.createUrl(blob), sourcePath: info.sourcePaths.find(path => path.includes('/models/item/')), ...info }
        entry.reason = null
        return
      }
      const [namespace, leaf] = name.split(':')
      const guide = entry.provider === 'guide' ? await prepareNativeGuideItemIcon(this.reader, entry.stack) : null
      const model = await resolveNativeFlatItemTexture(this.reader, guide?.modelId ?? `${namespace}:item/${leaf}`)
      if (Object.keys(model.textures).some(key => /^layer/.test(key) && key !== 'layer0') || !model.textures.layer0) throw Error('NATIVE_ITEM_LAYERS_UNSUPPORTED')
      const png = resourcePath(textureId(model, model.textures.layer0), 'textures', '.png')
      if (this.reader.manifest.assets[`${png}.mcmeta`]) throw Error('NATIVE_ITEM_ANIMATION_UNSUPPORTED')
      const size = this.reader.manifest.assets[png]?.bytes
      if (!guide && (!Number.isSafeInteger(size) || size <= 0 || size > 16777216)) throw Error('NATIVE_ITEM_TEXTURE_LIMIT')
      const bytes = await this.reader.bytes(png)
      if (this.disposed) return
      entry.result = { verified: true, url: this.createUrl(new Blob([bytes], { type: 'image/png' })), sourcePath: png,
        ...(guide ? { kind: guide.kind, bookId: guide.bookId ?? null, sourcePaths: [...new Set([...guide.sourcePaths, png])], pixelParityVerified: false }
          : { kind:'native-json-flat',sourcePaths:[...model.sourcePaths,png],providerEvidence:evidence,pixelParityVerified:false }) }
      entry.reason = null
    } catch(error) { entry.reason = error.message }
    finally { if (!this.disposed) this.onChange() }
  }
  dispose() {
    if (this.disposed) return
    this.disposed = true; this.queue.length = 0
    this.blockRenderer.dispose()
    this.arsRenderer.dispose()
    this.domumRenderer.dispose()
    for (const entry of this.entries.values()) if (entry.result) this.revokeUrl(entry.result.url)
    this.entries.clear()
  }
}
