import { createNativePlayerActor } from './native-player.js'
import { createNativeYsmPlayerActor } from './native-player-ysm.js'
import { nativeSelfPlayerBinding, nativeYsmSourcePresent, NATIVE_YSM_NOTICE } from './native-ysm-state.js'
import { nativeAppearanceChoices, nativeWebAppearanceBinding, assertNativeAppearanceIdentity } from './native-appearance.js'

// Preserve the server's own motion row, including its native tick counter.
// Minecraft's existing walking projection has a separate input contract.
export function applyNativeSelfPlayerMotion (actor, current, { dt = 0, now = Date.now() } = {}) {
  if (!actor?.applyMotion) return null
  if (actor.assetInfo?.kind === 'ysm') {
    const self = current?.presentation?.self ?? null
    const playerUuid = actor.assetInfo.uuid?.toLowerCase()
    if (self && (typeof (self.playerUuid ?? self.uuid) !== 'string' ||
        (self.playerUuid ?? self.uuid).toLowerCase() !== playerUuid)) throw Error('NATIVE_YSM_MOTION_IDENTITY_MISMATCH')
    return actor.applyMotion({ self, current, dt: Number.isFinite(dt) ? Math.max(0, Math.min(.1, dt)) : 0, now })
  }
  const crouching = current?.presentation?.self?.crouching ?? current?.selfPlayer?.sneaking
  return actor.applyMotion(current?.selfPlayer?.onGround === true && crouching === false ? current.motion : null, now)
}

// A change of appearance invalidates both the old body and any in-flight load.
// Keep this ownership outside WebGL so switch/disable/disconnect races can be
// checked with the same production controller used by the scene.
export class NativeSelfPlayerController {
  constructor (reader, { minecraftFactory = createNativePlayerActor, ysmFactory = createNativeYsmPlayerActor, onChange = () => {} } = {}) {
    this.reader = reader; this.minecraftFactory = minecraftFactory; this.ysmFactory = ysmFactory; this.onChange = onChange
    this.ysmAssetsPresent = nativeYsmSourcePresent(reader.manifest)
    this.actor = null; this.key = null; this.revision = 0; this.disposed = false
    this.appearanceId = 'server'; this.lastInput = null; this.status = '等待当前观战玩家'
  }
  notify (actor, status) { this.status = status; this.onChange(actor, status) }
  appearance () {
    return { available: !!this.lastInput && !this.disposed, selected: this.appearanceId, choices: nativeAppearanceChoices(this.reader.manifest),
      status: `${this.appearanceId === 'server' ? '跟随服务器外观' : 'Web 外观替换'} · ${this.status ?? '等待当前观战玩家'}` }
  }
  selectAppearance (id) {
    if (this.disposed || !this.lastInput || !nativeAppearanceChoices(this.reader.manifest).some(row => row.id === id)) return false
    this.appearanceId = id
    // An explicit repeat selection allows retry after a load error.
    this.key = null
    void this.update(...this.lastInput)
    return true
  }
  async update (self, playerUuid, ysm = self?.ysm) {
    if (this.disposed) return null
    if (this.lastInput && this.lastInput[1] !== playerUuid) this.appearanceId = 'server'
    try { assertNativeAppearanceIdentity(self, playerUuid) } catch (error) { this.clear(error.message); return null }
    this.lastInput = [self, playerUuid, ysm]
    let binding
    try { binding = this.appearanceId === 'server'
      ? nativeSelfPlayerBinding(self, playerUuid, ysm, { ysmAssetsPresent: this.ysmAssetsPresent })
      : nativeWebAppearanceBinding(self, playerUuid, this.appearanceId, this.reader.manifest) }
    catch (error) { this.clear(error.message, true); return null }
    if (this.key === binding.key) return this.actor
    const revision = ++this.revision; this.key = binding.key
    this.actor?.dispose(); this.actor = null; this.notify(null, '本人模型正在载入')
    let candidate
    try {
      candidate = binding.kind === 'ysm'
        ? await this.ysmFactory(this.reader, { uuid: binding.uuid, ysm: binding.ysm, ...(binding.webAppearance ? { webAppearance: binding.webAppearance } : {}) })
        : await this.minecraftFactory(this.reader, { uuid: binding.uuid })
      if (this.disposed || revision !== this.revision) { candidate.dispose(); return null }
      if (binding.kind === 'minecraft' && (candidate.assetInfo.path !== binding.skin.assetPath || candidate.assetInfo.sha256 !== binding.skin.sha256)) {
        throw Error('NATIVE_PLAYER_SKIN_BINDING_MISMATCH')
      }
      this.actor = candidate
      this.notify(candidate, binding.kind === 'ysm' ? candidate.assetInfo.support?.notice || candidate.assetInfo.notice || NATIVE_YSM_NOTICE
        : `1.21.1 ${candidate.assetInfo.name || binding.skin.model}; 本人步态和部分持物已接入，完整动画未验收`)
      return candidate
    } catch (error) {
      candidate?.dispose()
      if (!this.disposed && revision === this.revision) this.notify(null, error.message)
      return null
    }
  }
  clear (reason = null, keepSelection = false) {
    ++this.revision; this.key = null; this.actor?.dispose(); this.actor = null
    if (!keepSelection) { this.lastInput = null; this.appearanceId = 'server' }
    this.notify(null, reason)
  }
  dispose () { if (this.disposed) return; this.disposed = true; this.clear() }
}
