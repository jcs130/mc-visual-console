import { resourcePath, textureId } from './model-loader.js'
import { NativeBlockItemIconRenderer, loadNativeCutoutItemTexture,loadNativeBannerItemTexture } from './native-block-item-icons.js'
import { parseNativeItemStack } from './native-item-stack.js'
import { nativeGuideItemEligible } from './native-guide-item-icons.js'
import { nativeArsItemEligible, NativeArsItemIconRenderer } from './native-ars-item-icons.js'
import { nativeStaticItemState } from './native-static-item-providers.js'
import { nativeDomumItemEligible, nativeDomumItemState, NativeDomumItemIconRenderer } from './native-domum-item-icons.js'
import { nativeSoulSlabEligible, nativeSoulSlabState, prepareNativeSoulSlabIcon } from './native-soul-slab-icons.js'
import { prepareNativeChestItemIcon } from './native-chest-item-icons.js'
import { prepareNativeShieldItem } from './native-shield-items.js'
import { prepareNativeBannerItem } from './native-banner-items.js'
import { prepareNativeGlint } from './native-item-glint.js'
import { NativeIconGlintClock } from './native-icon-glint.js'
import {nativePotionItemEligible,validateNativePotionItem} from './native-potion-items.js'
import {renderNativePotionIcon} from './native-potion-icons.js'
import { resolveNativeItemAppearance } from './native-item-appearance.js'
import { ServerItemIcons } from './server-item-icons.js'
import {nativeDynamicGuiEligible,nativeDynamicGuiState,prepareNativeDynamicGuiIcon,NativeCompassWobble} from './native-dynamic-gui-icons.js'
export { resolveNativeFlatItemTexture } from './native-item-appearance.js'

export function nativeItemIconEligible(item) {
  try {
    const stack = parseNativeItemStack(item)
    if (nativeSoulSlabEligible(stack.id)) nativeSoulSlabState(stack)
    else if (nativeDomumItemEligible(stack.id)) nativeDomumItemState(stack)
    else if(nativePotionItemEligible(stack.id))validateNativePotionItem(stack)
    else nativeStaticItemState(stack,{allowPartialGlint:true})
    return true
  } catch { return false }
}

export class NativeItemIcons {
  constructor(reader, { onChange = () => {}, createUrl = blob => URL.createObjectURL(blob), revokeUrl = url => URL.revokeObjectURL(url), blockRendererOptions = {}, arsRendererOptions = {}, domumRendererOptions = {}, chestRendererOptions = {}, shieldRendererOptions = {},bannerRendererOptions={},glintOptions={},potionIconOptions={} } = {}) {
    this.reader = reader; this.onChange = onChange; this.createUrl = createUrl; this.revokeUrl = revokeUrl
    this.entries = new Map(); this.queue = []; this.active = 0; this.disposed = false
    this.serverIcons=new ServerItemIcons({reader,onChange,createUrl,revokeUrl})
    this.context=null;this.compassWobble=new NativeCompassWobble()
    this.glintClock = new NativeIconGlintClock(glintOptions)
    this.potionIconOptions=potionIconOptions
    this.animationEpochMs = Date.now()
    this.blockRenderer = new NativeBlockItemIconRenderer(reader, blockRendererOptions)
    this.arsRenderer = new NativeArsItemIconRenderer(reader, arsRendererOptions)
    this.domumRenderer = new NativeDomumItemIconRenderer(reader, domumRendererOptions)
    this.chestRenderer = new NativeBlockItemIconRenderer(reader, {preparePlan:prepareNativeChestItemIcon,loadTexture:loadNativeCutoutItemTexture,...chestRendererOptions})
    this.shieldRenderer = new NativeBlockItemIconRenderer(reader, {preparePlan:prepareNativeShieldItem,loadTexture:loadNativeCutoutItemTexture,...shieldRendererOptions})
    this.bannerRenderer = new NativeBlockItemIconRenderer(reader, {preparePlan:prepareNativeBannerItem,loadTexture:loadNativeBannerItemTexture,...bannerRendererOptions})
  }
  setContext(view){
    if(this.context?.self?.entityId!==view?.self?.entityId||this.context?.playerUuid!==view?.playerUuid)this.compassWobble=new NativeCompassWobble()
    this.context=view?.available?view:null
    let compass='unavailable'
    try{compass=nativeDynamicGuiState({id:'minecraft:compass',count:1,components:{}},this.context,this.compassWobble).variant}catch{}
    const next=JSON.stringify([compass,this.context?.self?.usingItem??null]),changed=next!==this.dynamicSignature
    this.dynamicSignature=next;return changed
  }
  resolve(item) {
    if (this.disposed) return null
    if(this.serverIcons.selector(item))return this.serverIcons.resolve(item)
    let provider = null, stack = null, dynamic = null, key = item?.name
    try { stack = parseNativeItemStack(item) } catch { return null }
    if(nativeDynamicGuiEligible(key)){
      try{dynamic=nativeDynamicGuiState(stack,this.context,this.compassWobble);provider='dynamic-gui'}catch{return null}
    } else if (nativeSoulSlabEligible(key)) {
      try { nativeSoulSlabState(stack); provider = 'soul-slab' } catch { return null }
    } else if (nativeGuideItemEligible(key) || nativeArsItemEligible(key)) {
      provider = nativeGuideItemEligible(key) ? 'guide' : 'ars'
      // Bind to the complete authoritative SNBT, including numeric tag types.
      // JSON.stringify would conflate a typed tag wrapper with a compound that
      // happens to contain the same type/value fields. Never share their icon.
      // Input is bounded to 64 KiB and this cache to 128 entries.
    } else if (nativeDomumItemEligible(key)) {
      try { nativeDomumItemState(stack); provider = 'domum' } catch { return null }
    } else if(nativePotionItemEligible(key)){
      try{validateNativePotionItem(stack);provider='potion'}catch{return null}
    } else {
      try { nativeStaticItemState(stack,{allowPartialGlint:true}); provider = 'static' } catch { return null }
    }
    // Every provider binds to complete authoritative SNBT, including visual
    // inputs, removal patches and tag types. No name-only generic icon cache.
    key += '#' + item.snbt
    if(dynamic)key+='#'+dynamic.variant
    if (!this.entries.has(key)) {
      if (this.entries.size >= 128 && !this.evictOldest()) return null
      this.entries.set(key, { result: null, reason: 'loading', name: item.name, provider, stack, dynamic }); this.queue.push(key); this.pump()
    }
    const entry = this.entries.get(key)
    this.entries.delete(key); this.entries.set(key, entry)
    return entry.result
  }
  evictOldest() {
    for (const [key, entry] of this.entries) {
      if (entry.loading) continue // An in-flight decoder owns its resources.
      this.entries.delete(key); this.queue = this.queue.filter(value => value !== key)
      entry.result?.liveGlint?.dispose()
      if (entry.result) this.revokeUrl(entry.result.url)
      return true
    }
    return false
  }
  reason(item) {
    if(this.disposed) return 'NATIVE_ITEM_ICONS_DISPOSED'
    if(this.serverIcons.selector(item))return this.serverIcons.reason(item)
    try {
      const stack=parseNativeItemStack(item)
      let dynamic=null
      if(nativeDynamicGuiEligible(item.name))dynamic=nativeDynamicGuiState(stack,this.context,this.compassWobble)
      else if (nativeSoulSlabEligible(item.name)) nativeSoulSlabState(stack)
      else if (nativeDomumItemEligible(item.name)) nativeDomumItemState(stack)
      else if(nativePotionItemEligible(item.name))validateNativePotionItem(stack)
      else if(!nativeGuideItemEligible(item.name)&&!nativeArsItemEligible(item.name))nativeStaticItemState(stack,{allowPartialGlint:true})
      const entry=this.entries.get(item.name+'#'+item.snbt+(dynamic?'#'+dynamic.variant:''))
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
    const entry = this.entries.get(key)
    if (!entry) return
    entry.loading = true
    const name = entry.name
    try {
      const appearance = entry.dynamic?await prepareNativeDynamicGuiIcon(this.reader,entry.dynamic):await resolveNativeItemAppearance(this.reader, entry.stack, { kind: 'gui' })
      entry.appearance = appearance
      if (this.disposed) return
      const provider = appearance.family
      if(provider==='potion'){
        const {blob,...info}=await renderNativePotionIcon(this.reader,entry.stack,{...this.potionIconOptions,appearance})
        if(this.disposed)return
        entry.result={verified:true,url:this.createUrl(blob),sourcePath:info.sourcePaths.find(path=>path.includes('/models/item/')),...info}
        entry.reason=null;return
      }
      if (provider === 'soul-slab') {
        const { blob, ...info } = await prepareNativeSoulSlabIcon(this.reader, entry.stack, appearance.prepared)
        if (this.disposed) return
        entry.result = { verified: true, url: this.createUrl(blob), ...info,
          animation: { ...info.animation, epochMs: this.animationEpochMs } }
        entry.reason = null
        return
      }
      if (provider === 'ars' || provider === 'domum') {
        const renderer = provider === 'ars' ? this.arsRenderer : this.domumRenderer
        const { blob, ...info } = await renderer.render(entry.stack, appearance.prepared)
        if (this.disposed) return
        entry.result = { verified: true, url: this.createUrl(blob), sourcePath: info.sourcePaths.find(path => path.includes('/models/item/')), ...info }
        entry.reason = null
        return
      }
      const evidence = appearance.evidence
      if(['chest','shield','banner'].includes(provider)) {
        const {blob,...info}=await (provider==='shield'?this.shieldRenderer:provider==='banner'?this.bannerRenderer:this.chestRenderer).render(name, appearance.prepared)
        if(this.disposed)return
        entry.result={verified:true,url:this.createUrl(blob),sourcePath:info.sourcePaths.find(path=>path.includes('/models/item/')),...info}
        entry.reason=null;return
      }
      if (appearance.geometry === 'block') {
        const { blob, ...info } = await this.blockRenderer.render(name, appearance.prepared)
        if (this.disposed) return
        entry.result = { verified: true, url: this.createUrl(blob), sourcePath: info.sourcePaths.find(path => path.includes('/models/item/')), ...info }
        entry.reason = null
        return
      }
      const guide = provider === 'guide' ? appearance.prepared : null
      const model = appearance.model
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
    finally {
      if(entry.result&&(entry.dynamic?.foil||entry.provider==='static'&&nativeStaticItemState(entry.stack,{allowPartialGlint:true}).foil)) {
        try {
          const glint=entry.appearance?.requirements?.glint ?? (entry.dynamic?.foil?await prepareNativeGlint(this.reader):null)
          if(!glint)throw Error(entry.appearance?.requirements?.effectUnavailableReason??'NATIVE_GUI_GLINT_ATLAS_UV_UNAVAILABLE')
          entry.result.liveGlint=this.glintClock.add(entry.result,entry.appearance,glint)
          entry.result.glint={available:true,source:glint.source,pixelParityVerified:false}
          delete entry.result.effectUnavailableReason
        } catch(error) {entry.result.effectUnavailableReason=error.message}
      }
      entry.loading=false;if(!this.disposed&&this.entries.get(key)===entry)this.onChange();
    }
  }
  dispose() {
    if (this.disposed) return
    this.disposed = true; this.queue.length = 0
    this.serverIcons.dispose()
    this.blockRenderer.dispose()
    this.arsRenderer.dispose()
    this.domumRenderer.dispose()
    this.chestRenderer.dispose()
    this.shieldRenderer.dispose()
    this.bannerRenderer.dispose()
    this.glintClock.dispose()
    for (const entry of this.entries.values()) entry.result?.liveGlint?.dispose()
    for (const entry of this.entries.values()) if (entry.result) this.revokeUrl(entry.result.url)
    this.entries.clear()
  }
}
