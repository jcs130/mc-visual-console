import { createNativePlayerActor } from './native-player.js'
import { createNativeYsmPlayerActor } from './native-player-ysm.js'
import { createNativeBundledYsmPlayerActor } from './native-player-bundled-ysm.js'
import { nativeSelfPlayerBinding, nativeYsmSourcePresent, NATIVE_YSM_NOTICE } from './native-ysm-state.js'
import { nativeAppearanceChoices, nativeWebAppearanceBinding, assertNativeAppearanceIdentity } from './native-appearance.js'
import { nativePaperAppearanceBinding, createNativePaperAppearanceActor } from './native-paper-appearance.js'

const transientAppearanceFailure = error => error?.type === 'error' || /^(PAPER_APPEARANCE_DOWNLOAD_FAILED|Failed to fetch|fetch failed|Load failed|NetworkError|The operation was aborted)/.test(error?.message ?? '')

// Preserve the server's own motion row, including its native tick counter.
// Minecraft's existing walking projection has a separate input contract.
export function applyNativeSelfPlayerMotion (actor, current, { dt = 0, now = Date.now(), displayPose = null } = {}) {
  if (!actor?.applyMotion) return null
  if (actor.assetInfo?.kind === 'ysm' || actor.assetInfo?.source === 'paper_server_appearance') {
    const self = current?.presentation?.self ?? null
    const playerUuid = actor.assetInfo.uuid?.toLowerCase()
    if (self && (typeof (self.playerUuid ?? self.uuid) !== 'string' ||
        (self.playerUuid ?? self.uuid).toLowerCase() !== playerUuid)) throw Error('NATIVE_YSM_MOTION_IDENTITY_MISMATCH')
    // The bundled model derives heading from pose. Keep its animation layer
    // from overwriting the received, interpolated actor/camera orientation.
    const fast=current?.selfPlayer
    const observed=fast?.uuid===playerUuid&&Number.isSafeInteger(self?.entityId)&&fast.entityId===self.entityId
      ?Object.fromEntries(['velocity','locomotion','onGround','health','sneaking','sprinting','flying','inWater',
        'pose','spinAttack','usingItem','useItemRemainingTicks','attackAnim','climbing','isPassenger','vehicleType'].filter(key=>Object.hasOwn(fast,key)).map(key=>[key,fast[key]])):{}
    const hasDisplay=!!displayPose||Object.keys(observed).length>0
    const presentedSelf=hasDisplay&&self?{...self,...observed,
      ...(typeof observed.sneaking==='boolean'?{crouching:observed.sneaking}:{}),
      ...(Number.isFinite(displayPose?.bodyYaw)?{bodyYaw:displayPose.bodyYaw}:{}),
      ...(Number.isFinite(displayPose?.headYaw)?{headYaw:displayPose.headYaw}:{})}:self
    const frame=hasDisplay?{...current,...(displayPose?{pose:displayPose}:{}),
      ...(current.presentation?{presentation:{...current.presentation,self:presentedSelf}}:{})}:current
    return actor.applyMotion({ self:presentedSelf, current:frame, dt: Number.isFinite(dt) ? Math.max(0, Math.min(.1, dt)) : 0, now })
  }
  const crouching = current?.presentation?.self?.crouching ?? current?.selfPlayer?.sneaking
  return actor.applyMotion(current?.selfPlayer?.onGround === true && crouching === false ? current.motion : null, now)
}

// A change of appearance invalidates both the old body and any in-flight load.
// Keep this ownership outside WebGL so switch/disable/disconnect races can be
// checked with the same production controller used by the scene.
export class NativeSelfPlayerController {
  constructor (reader, { minecraftFactory = createNativePlayerActor, ysmFactory = createNativeYsmPlayerActor,
    bundledYsmFactory = createNativeBundledYsmPlayerActor, paperAppearanceFactory = createNativePaperAppearanceActor, bundledAppearanceReader = null, onChange = () => {},
    defaultAppearance = 'server', selectionStorage = null, selectionScope = 'page', now = Date.now } = {}) {
    this.reader = reader; this.minecraftFactory = minecraftFactory; this.ysmFactory = ysmFactory; this.onChange = onChange
    this.bundledAppearanceReader = bundledAppearanceReader; this.bundledYsmFactory = bundledYsmFactory
    this.paperAppearanceFactory=paperAppearanceFactory
    this.ysmAssetsPresent = nativeYsmSourcePresent(reader.manifest)
    this.actor = null; this.key = null; this.revision = 0; this.disposed = false
    this.appearanceId = 'server'; this.lastInput = null; this.status = '等待当前观战玩家'
    this.defaultAppearance = defaultAppearance; this.selectionStorage = selectionStorage; this.selectionScope = selectionScope
    this.selectionUuid = null; this.selections = new Map()
    this.now=now;this.pendingKey=null;this.retry=null
  }
  selectionKey(uuid) { return `native-appearance/v1:${encodeURIComponent(this.selectionScope)}:${uuid}` }
  restoredSelection(uuid) {
    let id = this.selections.get(uuid)
    try { id ??= this.selectionStorage?.getItem(this.selectionKey(uuid)) } catch {}
    id ??= this.defaultAppearance
    return nativeAppearanceChoices(this.reader.manifest, this.bundledAppearanceReader).some(row => row.id === id) ? id : 'server'
  }
  notify (actor, status) { this.status = status; this.onChange(actor, status) }
  appearance () {
    const original=this.lastInput?.[0]?.paperAppearance;
    return { available: !!this.lastInput && !this.disposed, selected: this.appearanceId, choices: nativeAppearanceChoices(this.reader.manifest, this.bundledAppearanceReader),
      serverModel:original?{modelId:original.modelId,texture:original.texture,ysmVersion:original.ysmVersion,nativeModelId:original.nativeModelId,nativeTexture:original.nativeTexture,presentation:original.presentation,nativeAvailable:original.nativeAvailable===true||original.available===true,webAvailable:original.available===true,reason:original.reason??null}:null,
      unavailable:this.appearanceId==='server'&&original?.nativeAvailable===true&&original.available!==true,
      status: `${this.appearanceId === 'server' ? '跟随服务器外观' : 'Web 外观替换'} · ${this.status ?? '等待当前观战玩家'}` }
  }
  selectAppearance (id) {
    if (this.disposed || !this.lastInput) return false
    if (!nativeAppearanceChoices(this.reader.manifest, this.bundledAppearanceReader).some(row => row.id === id)) {
      if (typeof id === 'string' && id.startsWith('bundled:')) this.notify(this.actor, '自带外观不可用: BUNDLED_APPEARANCE_UNAVAILABLE')
      return false
    }
    this.appearanceId = id
    if (this.selectionUuid) {
      this.selections.set(this.selectionUuid, id)
      try { this.selectionStorage?.setItem(this.selectionKey(this.selectionUuid), id) } catch {}
    }
    // An explicit repeat selection allows retry after a load error.
    this.key = null;this.retry=null
    void this.update(...this.lastInput)
    return true
  }
  async update (self, playerUuid, ysm = self?.ysm) {
    if (this.disposed) return null
    try { assertNativeAppearanceIdentity(self, playerUuid) } catch (error) { this.clear(error.message); return null }
    playerUuid = playerUuid.toLowerCase()
    if (this.selectionUuid !== playerUuid) { this.appearanceId = this.restoredSelection(playerUuid); this.selectionUuid = playerUuid }
    this.lastInput = [self, playerUuid, ysm]
    let binding
    try {
      if(this.appearanceId==='server'&&self.paperAppearance?.nativeAvailable===true&&self.paperAppearance.available!==true){
        const original=self.paperAppearance;
        if(original.playerUuid!==playerUuid||original.entityId!==self.entityId)throw Error('PAPER_APPEARANCE_IDENTITY_OR_ASSET_INVALID');
        this.clear(`原生 YSM ${original.ysmVersion??''} · ${original.modelId??'原模型'}：网页暂缺原作者公开的几何、动画和贴图；本地客户端可显示。`,true);return null;
      }
      binding = this.appearanceId === 'server'
      ? self.paperAppearance?.available===true?nativePaperAppearanceBinding(self,playerUuid):nativeSelfPlayerBinding(self, playerUuid, ysm, { ysmAssetsPresent: this.ysmAssetsPresent })
      : nativeWebAppearanceBinding(self, playerUuid, this.appearanceId, this.reader.manifest, this.bundledAppearanceReader) }
    catch (error) { this.clear(error.message, true); return null }
    const same=this.key===binding.key
    // Keep a single in-flight load. A failed first HTTP/image request must not
    // permanently latch an empty actor for this otherwise unchanged body.
    // Retry only transient transport failures, at most three attempts. Original
    // asset/hash/identity failures remain unavailable and never get substitutes.
    if(same&&(this.actor||this.pendingKey===binding.key||!this.retry||this.now()<this.retry.after))return this.actor
    const attempts=same?(this.retry?.attempts??0)+1:1
    const revision = ++this.revision; this.key = binding.key
    this.pendingKey=binding.key;this.retry=null
    this.actor?.dispose(); this.actor = null; this.notify(null, '本人模型正在载入')
    let candidate
    try {
      candidate = binding.kind === 'paper-original'
        ? await this.paperAppearanceFactory(this.reader,{uuid:binding.uuid,paperAppearance:binding.paperAppearance})
        : binding.kind === 'bundled-ysm'
        ? await this.bundledYsmFactory(this.reader, { uuid: binding.uuid, bundledAppearance: binding.bundledAppearance })
        : binding.kind === 'ysm'
        ? await this.ysmFactory(this.reader, { uuid: binding.uuid, ysm: binding.ysm, ...(binding.webAppearance ? { webAppearance: binding.webAppearance } : {}) })
        : await this.minecraftFactory(this.reader, { uuid: binding.uuid, ...(binding.bundledAppearance ? { bundledAppearance: binding.bundledAppearance } : {}) })
      if (this.disposed || revision !== this.revision) { candidate.dispose(); return null }
      if (binding.bundledAppearance && (candidate.assetInfo.uuid !== binding.uuid || candidate.assetInfo.source !== 'plugin_bundled')) {
        throw Error('BUNDLED_APPEARANCE_ACTOR_BINDING_MISMATCH')
      }
      if (binding.kind === 'minecraft' && (candidate.assetInfo.path !== binding.skin.assetPath || candidate.assetInfo.sha256 !== binding.skin.sha256)) {
        throw Error('NATIVE_PLAYER_SKIN_BINDING_MISMATCH')
      }
      this.actor = candidate
      this.pendingKey=null;this.retry=null
      this.notify(candidate, ['ysm', 'bundled-ysm','paper-original'].includes(binding.kind) ? candidate.assetInfo.support?.notice || candidate.assetInfo.notice || NATIVE_YSM_NOTICE
        : `1.21.1 ${candidate.assetInfo.name || candidate.assetInfo.model || binding.skin?.model}; 本人步态和部分持物已接入，完整动画未验收`)
      return candidate
    } catch (error) {
      candidate?.dispose()
      if(!this.disposed&&revision===this.revision){
        this.pendingKey=null
        if(binding.kind==='paper-original'&&transientAppearanceFailure(error)&&attempts<3)
          this.retry={attempts,after:this.now()+(attempts===1?2000:5000)}
      }
      if (!this.disposed && revision === this.revision && binding.bundledAppearance) {
        this.appearanceId = 'server'; this.key = null
        const restorationRevision = this.revision + 1
        const original = await this.update(...this.lastInput)
        if (!this.disposed && this.revision === restorationRevision && this.appearanceId === 'server' && this.actor === original) this.notify(original, `自带外观不可用: ${error.message} · 已恢复服务器外观`)
        return original
      }
      if (!this.disposed && revision === this.revision) this.notify(null, this.retry
        ? `模型下载暂时中断，将自动重试（${attempts}/3）` : error.message||'模型贴图载入失败；在外观设置重新选择“跟随服务器”可重试')
      return null
    }
  }
  clear (reason = null, keepSelection = false) {
    ++this.revision; this.key = null; this.actor?.dispose(); this.actor = null
    this.pendingKey=null;this.retry=null
    // Scene epochs/respawns/disconnects retire model ownership, not the user's
    // account-scoped preference. A full connection clear restores it afresh;
    // same-lifecycle error cleanup keeps the fallback and avoids retry loops.
    if (!keepSelection) { this.lastInput = null; this.selectionUuid = null }
    this.notify(null, reason)
  }
  dispose () { if (this.disposed) return; this.disposed = true; this.clear() }
}
