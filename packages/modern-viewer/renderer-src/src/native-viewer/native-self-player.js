import { createNativePlayerActor } from './native-player.js'
import { createNativeYsmPlayerActor } from './native-player-ysm.js'
import { nativeSelfPlayerBinding, nativeYsmSourcePresent, NATIVE_YSM_NOTICE } from './native-ysm-state.js'

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
  }
  async update (self, playerUuid, ysm = self?.ysm) {
    if (this.disposed) return null
    let binding
    try { binding = nativeSelfPlayerBinding(self, playerUuid, ysm, { ysmAssetsPresent: this.ysmAssetsPresent }) }
    catch (error) { this.clear(error.message); return null }
    if (this.key === binding.key) return this.actor
    const revision = ++this.revision; this.key = binding.key
    this.actor?.dispose(); this.actor = null; this.onChange(null, '本人模型正在载入')
    let candidate
    try {
      candidate = binding.kind === 'ysm'
        ? await this.ysmFactory(this.reader, { uuid: binding.uuid, ysm: binding.ysm })
        : await this.minecraftFactory(this.reader, { uuid: binding.uuid })
      if (this.disposed || revision !== this.revision) { candidate.dispose(); return null }
      if (binding.kind === 'minecraft' && (candidate.assetInfo.path !== binding.skin.assetPath || candidate.assetInfo.sha256 !== binding.skin.sha256)) {
        throw Error('NATIVE_PLAYER_SKIN_BINDING_MISMATCH')
      }
      this.actor = candidate
      this.onChange(candidate, binding.kind === 'ysm' ? candidate.assetInfo.support?.notice || candidate.assetInfo.notice || NATIVE_YSM_NOTICE
        : `1.21.1 ${candidate.assetInfo.name || binding.skin.model}; 本人步态和部分持物已接入，完整动画未验收`)
      return candidate
    } catch (error) {
      candidate?.dispose()
      if (!this.disposed && revision === this.revision) this.onChange(null, error.message)
      return null
    }
  }
  clear (reason = null) {
    ++this.revision; this.key = null; this.actor?.dispose(); this.actor = null; this.onChange(null, reason)
  }
  dispose () { if (this.disposed) return; this.disposed = true; this.clear() }
}
