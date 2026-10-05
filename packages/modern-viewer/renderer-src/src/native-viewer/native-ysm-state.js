const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export const NATIVE_YSM_SOURCE = 'same_player_native_attachment'
export const NATIVE_YSM_VERSION = '2.6.5'
export const NATIVE_YSM_JAR_SHA256 = 'b285c73d4ec010d9a9be3c53c1bee890cf269645be5f1bcf1c27a2e8e82807cb'
export const NATIVE_YSM_MODEL_ID = 'misc/3_default_boy'
export const NATIVE_YSM_NOTICE = 'YSM 原模型静态展示，眼神/完整动画/装备未适配'

// Keep an invalid observation explicitly unavailable. Dropping it would allow
// a previously enabled YSM body to turn into a Minecraft skin silently.
export function projectNativeYsmState (value, playerUuid) {
  const uuid = typeof playerUuid === 'string' && UUID.test(playerUuid) ? playerUuid.toLowerCase() : null
  if (!uuid) throw Error('NATIVE_YSM_PLAYER_UUID_INVALID')
  const unavailable = reason => ({ available: false, source: NATIVE_YSM_SOURCE, playerUuid: uuid, reason })
  if (!value || typeof value !== 'object' || Array.isArray(value)) return unavailable('NATIVE_YSM_ATTACHMENT_INVALID')
  if (value.source !== NATIVE_YSM_SOURCE || typeof value.playerUuid !== 'string' || value.playerUuid.toLowerCase() !== uuid) {
    return unavailable('NATIVE_YSM_ATTACHMENT_IDENTITY_MISMATCH')
  }
  const copy = { source: NATIVE_YSM_SOURCE, playerUuid: uuid }
  for (const key of ['available', 'installed', 'enabled', 'mandatory']) {
    if (Object.hasOwn(value, key)) {
      if (typeof value[key] !== 'boolean') return unavailable('NATIVE_YSM_ATTACHMENT_INVALID')
      copy[key] = value[key]
    }
  }
  for (const key of ['modelId', 'texture', 'ysmVersion', 'jarSha256', 'reason']) {
    if (Object.hasOwn(value, key)) {
      if (typeof value[key] !== 'string' || value[key].length > 256) return unavailable('NATIVE_YSM_ATTACHMENT_INVALID')
      copy[key] = value[key]
    }
  }
  if (typeof copy.available !== 'boolean' || copy.available && typeof copy.enabled !== 'boolean' ||
      copy.installed === false && (copy.available !== true || copy.enabled !== false)) return unavailable('NATIVE_YSM_ATTACHMENT_INVALID')
  return copy
}

export function nativeYsmSourcePresent (manifest) {
  return Boolean(manifest?.sources?.some(source => /^ysm-/.test(source.name ?? '')) ||
    Object.keys(manifest?.assets ?? {}).some(path => path.startsWith('assets/yes_steve_model/')))
}

export function nativeSelfPlayerBinding (self, playerUuid, ysm = self?.ysm, { ysmAssetsPresent = false } = {}) {
  if (!UUID.test(playerUuid ?? '') || typeof self?.uuid !== 'string' || self.uuid.toLowerCase() !== playerUuid.toLowerCase()) {
    throw Error('NATIVE_SELF_PLAYER_IDENTITY_MISMATCH')
  }
  const uuid = playerUuid.toLowerCase()
  if (ysm === undefined && ysmAssetsPresent) throw Error('NATIVE_YSM_ATTACHMENT_WAITING')
  if (ysm !== undefined) {
    const state = projectNativeYsmState(ysm, uuid)
    if (!state.available) throw Error(state.reason?.startsWith('NATIVE_YSM_') ? state.reason : 'NATIVE_YSM_ATTACHMENT_UNAVAILABLE')
    if (state.enabled) {
      if (state.installed === false || typeof state.mandatory !== 'boolean') throw Error('NATIVE_YSM_ATTACHMENT_INVALID')
      if (state.ysmVersion !== NATIVE_YSM_VERSION || state.jarSha256 !== NATIVE_YSM_JAR_SHA256) throw Error('NATIVE_YSM_VERSION_UNSUPPORTED')
      if (state.modelId !== NATIVE_YSM_MODEL_ID) throw Error('NATIVE_YSM_MODEL_UNSUPPORTED')
      if (!['blue', 'red'].includes(state.texture)) throw Error('NATIVE_YSM_TEXTURE_UNSUPPORTED')
      return { kind: 'ysm', uuid, ysm: state, key: `ysm:${uuid}:${state.modelId}:${state.texture}:${state.mandatory}` }
    }
  }
  if (self.skin?.kind !== 'default') throw Error(self.skin?.reason || 'PLAYER_SKIN_PROFILE_UNAVAILABLE')
  return { kind: 'minecraft', uuid, skin: self.skin, key: `minecraft:${uuid}:${self.skin.assetPath}:${self.skin.sha256}` }
}
