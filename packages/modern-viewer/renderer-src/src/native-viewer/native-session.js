const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA = /^[a-f0-9]{64}$/
const ownConnection = 'live_same_player_connection'

// The browser is a passive observer of one caller-owned game connection.
// A disconnect invalidates the old world, and frames cannot establish identity
// or resurrect an old epoch. This also protects inventory/player HUD consumers.
export function createNativeSession(registrySha256) {
  if (!SHA.test(registrySha256 || '')) throw Error('NATIVE_WORLD_REGISTRY_HASH_INVALID')
  let identity = null, epoch = null, ready = false
  return {
    receive(value) {
      if (!value || typeof value !== 'object') throw Error('NATIVE_WORLD_EVENT_INVALID')
      if (value.type === 'identity') {
        if (value.registrySha256 !== registrySha256 || value.mode !== ownConnection || value.minecraftVersion !== '1.21.1' ||
            !/^[A-Za-z0-9_]{1,16}$/.test(value.player || '') || (value.playerUuid != null && !UUID.test(value.playerUuid))) throw Error('NATIVE_WORLD_IDENTITY_MISMATCH')
        const changed = identity && (identity.player !== value.player || identity.playerUuid !== value.playerUuid)
        if (changed) { ready = false; epoch = null }
        identity = { ...value, playerUuid: value.playerUuid?.toLowerCase() || null }
        return { kind: 'identity', value: identity, reset: Boolean(changed) }
      }
      if (value.type === 'unavailable' || value.type === 'waiting') {
        const reset = value.type === 'unavailable' || epoch !== value.epoch
        ready = false; epoch = value.epoch ?? null
        return { kind: 'unavailable', value, reset }
      }
      if (!identity) throw Error('NATIVE_WORLD_IDENTITY_MISSING')
      if (value.type === 'snapshot') {
        if (value.registrySha256 !== registrySha256 || value.mode !== ownConnection || !Number.isSafeInteger(value.epoch)) throw Error('NATIVE_WORLD_SNAPSHOT_MISMATCH')
        if (epoch !== null && value.epoch < epoch) return { kind: 'ignored' }
      } else if (value.type !== 'frame' || !ready || value.epoch !== epoch) return { kind: 'ignored' }
      if (value.selfPlayer && (!identity.playerUuid || value.selfPlayer.uuid?.toLowerCase() !== identity.playerUuid || value.selfPlayer.name !== identity.player)) throw Error('NATIVE_WORLD_SELF_PLAYER_MISMATCH')
      if (value.presentation?.available && (!identity.playerUuid || value.presentation.playerUuid?.toLowerCase() !== identity.playerUuid)) throw Error('NATIVE_WORLD_PRESENTATION_IDENTITY_MISMATCH')
      const reset = value.type === 'snapshot' && epoch !== value.epoch
      epoch = value.epoch; ready = true
      return { kind: value.type, value, reset }
    }
  }
}
