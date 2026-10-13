import { NATIVE_YSM_MODELS } from './native-ysm-models.js'
import { NATIVE_YSM_JAR_SHA256 } from './native-ysm-state.js'
import { PLAYER_CLIENT_JAR_SHA256 } from './native-player.js'

// Offer only original profiles with exact resources in this deployment.
// Rendering still verifies the actual bytes and original definition on load.
export function nativeAppearanceChoices (manifest) {
  const choices = [{ id: 'server', label: '跟随服务器' }]
  if (manifest?.clientJarSha256 !== PLAYER_CLIENT_JAR_SHA256) return choices
  const sources = manifest.sources?.filter(source => /^ysm-2\.6\.5-neoforge\+mc1\.21\.1(?:-release)?\.jar$/.test(source.name ?? ''))
  if (sources?.length !== 1 || sources[0].sha256 !== NATIVE_YSM_JAR_SHA256 || sources[0].explicitOverride) return choices
  for (const profile of Object.values(NATIVE_YSM_MODELS)) for (const texture of profile.textures) {
    if (!['definition', 'model', 'animation', texture].every(kind => {
      const entry = manifest.assets?.[profile.assets[kind]]
      return entry?.sha256 === profile.hashes[kind] && entry.source === sources[0].name && !entry.overriddenSources?.length &&
        !entry.variants?.some(variant => variant.sha256 !== entry.sha256)
    })) continue
    choices.push({ id: `native:${profile.id}:${texture}`, label: `YSM ${profile.name} · ${texture}`, modelId: profile.id, texture })
  }
  return choices
}

export function assertNativeAppearanceIdentity (self, playerUuid) {
  if (typeof playerUuid !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(playerUuid) ||
      typeof self?.uuid !== 'string' || self.uuid.toLowerCase() !== playerUuid.toLowerCase()) throw Error('NATIVE_SELF_PLAYER_IDENTITY_MISMATCH')
}
export function nativeWebAppearanceBinding (self, playerUuid, selection, manifest) {
  assertNativeAppearanceIdentity(self, playerUuid)
  const choice = nativeAppearanceChoices(manifest).find(row => row.id === selection)
  if (!choice?.modelId) throw Error('NATIVE_WEB_APPEARANCE_UNAVAILABLE')
  const uuid = playerUuid.toLowerCase()
  return { kind: 'ysm', uuid, webAppearance: { modelId: choice.modelId, texture: choice.texture }, key: `web:${uuid}:${selection}` }
}
