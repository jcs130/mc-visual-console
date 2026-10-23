const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA = /^[a-f0-9]{64}$/
const ownConnections = new Set(['live_same_player_connection', 'numen_server_body', 'paper_server_observation'])

// The browser is a passive observer of one caller-owned game connection.
// A disconnect invalidates the old world, and frames cannot establish identity
// or resurrect an old epoch. This also protects inventory/player HUD consumers.
export function createNativeSession(registrySha256, { entityRegistrySha256 = null } = {}) {
  if (!SHA.test(registrySha256 || '')) throw Error('NATIVE_WORLD_REGISTRY_HASH_INVALID')
  if (entityRegistrySha256 !== null && !SHA.test(entityRegistrySha256)) throw Error('NATIVE_ENTITY_REGISTRY_HASH_INVALID')
  let identity = null, epoch = null, ready = false, effectSequence=-1
  return {
    receive(value) {
      if (!value || typeof value !== 'object') throw Error('NATIVE_WORLD_EVENT_INVALID')
      if (value.type === 'identity') {
        if (value.registrySha256 !== registrySha256 || !ownConnections.has(value.mode) || value.minecraftVersion !== '1.21.1' ||
            !/^\.?[A-Za-z0-9_]{1,16}$/.test(value.player || '') || (value.playerUuid != null && !UUID.test(value.playerUuid))) throw Error('NATIVE_WORLD_IDENTITY_MISMATCH')
        const changed = identity && (identity.player !== value.player || identity.playerUuid !== value.playerUuid || identity.mode !== value.mode || identity.entityId !== value.entityId)
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
      if (value.type === 'agent_visual') {
        if (!ready || value.epoch !== epoch || !['agentVisualization', 'agentPresentation'].includes(value.event)) return { kind: 'ignored' }
        const subject = value.value?.subject
        if (value.value?.available !== false && (!subject || subject.playerUuid?.toLowerCase() !== identity.playerUuid ||
            subject.playerName !== identity.player || subject.entityId !== identity.entityId)) throw Error('NATIVE_AGENT_VISUAL_IDENTITY_MISMATCH')
        return { kind: 'agent_visual', value }
      }
      if(value.type==='entity_collect') {
        if(!ready||value.epoch!==epoch)return {kind:'ignored'}
        if(value.playerUuid?.toLowerCase()!==identity.playerUuid||value.source!=='received_native_collect_packet'||
          ![value.collectedEntityId,value.collectorEntityId,value.sequence,value.count].every(Number.isSafeInteger)||value.count<0)throw Error('NATIVE_COLLECT_BINDING_MISMATCH')
        return {kind:'entity_collect',value}
      }
      if(value.type==='world_effect'){
        if(!ready||value.epoch!==epoch)return {kind:'ignored'}
        if(value.playerUuid?.toLowerCase()!==identity.playerUuid||value.source!=='received_native_packet_effect'||
          !Number.isSafeInteger(value.sequence)||!Number.isFinite(value.observedAt)||!['sound','sound_stop','particle'].includes(value.effect?.kind))throw Error('NATIVE_EFFECT_BINDING_MISMATCH')
        if(value.sequence<=effectSequence)return {kind:'ignored'}
        effectSequence=value.sequence;return {kind:'world_effect',value}
      }
      if (value.type === 'snapshot') {
        if (value.registrySha256 !== registrySha256 || value.mode !== identity.mode || !Number.isSafeInteger(value.epoch)) throw Error('NATIVE_WORLD_SNAPSHOT_MISMATCH')
        if (epoch !== null && value.epoch < epoch) return { kind: 'ignored' }
      } else if (!['frame', 'motion', 'presentation'].includes(value.type) || !ready || value.epoch !== epoch) return { kind: 'ignored' }
      if (value.type === 'motion' && (!identity.playerUuid || value.playerUuid?.toLowerCase() !== identity.playerUuid || value.motion?.epoch !== epoch)) throw Error('NATIVE_WORLD_MOTION_IDENTITY_MISMATCH')
      if (value.selfPlayer && (!identity.playerUuid || value.selfPlayer.uuid?.toLowerCase() !== identity.playerUuid || value.selfPlayer.name !== identity.player)) throw Error('NATIVE_WORLD_SELF_PLAYER_MISMATCH')
      if (value.presentation?.available && (!identity.playerUuid || value.presentation.playerUuid?.toLowerCase() !== identity.playerUuid)) throw Error('NATIVE_WORLD_PRESENTATION_IDENTITY_MISMATCH')
      if (value.entityState?.available && (entityRegistrySha256 === null || value.entityState.source !== 'received_native_entity_packets' ||
          value.entityState.registrySha256 !== entityRegistrySha256 || value.entityState.epoch !== value.epoch ||
          value.entityState.rotationUnit !== 'minecraft_degrees' || !Array.isArray(value.entityState.entities) ||
          value.entityState.entities.length > 512)) throw Error('NATIVE_ENTITY_STREAM_BINDING_MISMATCH')
      const reset = value.type === 'snapshot' && epoch !== value.epoch
      if(reset)effectSequence=-1
      epoch = value.epoch; ready = true
      return { kind: value.type, value, reset }
    }
  }
}
