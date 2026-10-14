// Read the same 1.21.1 Mineflayer body's public settings/use state and its
// serialized arm-animation packet. No calls to swingArm, no extra game writes.
export function observeVanillaHands(bot, { now = Date.now } = {}) {
  let serializer, outgoing, swing = null, sequence = 0, identity = null
  const reset = () => { swing = null; identity = null }
  const attach = () => {
    if (serializer && outgoing) serializer.off('data', outgoing)
    serializer = bot._client.serializer; outgoing = null
    if (!serializer?.createPacketBuffer || bot.version !== '1.21.1' || bot._client.state !== 'play') return
    let packet
    try { packet = serializer.createPacketBuffer({ name: 'arm_animation', params: { hand: 0 } }) }
    catch { return } // An optional visual observer must never break connection setup.
    const prefix = packet.subarray(0, -1)
    outgoing = bytes => {
      if (bot._client.state !== 'play' || bytes.length !== packet.length || !bytes.subarray(0, -1).equals(prefix) || ![0, 1].includes(bytes.at(-1))) return
      const haste = bot.entity?.effects?.[bot.registry?.effectsByName?.Haste?.id]
      const fatigue = bot.entity?.effects?.[bot.registry?.effectsByName?.MiningFatigue?.id]
      const durationTicks = haste ? 6 - (haste.amplifier + 1) : fatigue ? 6 + 2 * (fatigue.amplifier + 1) : 6
      const time = now()
      const key = `${bot._client.uuid}:${bot.entity?.id}`
      if (key !== identity) { swing = null; identity = key }
      // LivingEntity.swing does not restart the first half of a current swing.
      if (swing && time - swing.startedAt < swing.durationTicks * 25) return
      swing = { sequence: ++sequence, hand: bytes.at(-1) === 1 ? 'offhand' : 'mainhand', startedAt: time, durationTicks: Math.max(1, durationTicks) }
    }
    serializer.on('data', outgoing)
  }
  bot._client.on('state', attach); bot.on?.('spawn', reset); bot.on?.('respawn', reset); bot.on?.('end', reset); attach()
  return {
    snapshot() {
      const uuid = bot._client.uuid, entity = bot.entity, key = `${uuid}:${entity?.id}`
      if (identity !== key) { swing = null; identity = key }
      if (!uuid || !entity || (entity.uuid && entity.uuid.toLowerCase() !== uuid.toLowerCase()) || !['left', 'right'].includes(bot.settings?.mainHand)) return null
      const time = now(), living = entity.metadata?.[8], pose = entity.metadata?.[6]
      const usingItem = typeof bot.usingHeldItem === 'boolean' ? bot.usingHeldItem : typeof living === 'number' ? !!(living & 1) : null
      const active = swing && time - swing.startedAt < swing.durationTicks * 50 ? { ...swing } : null
      return { source: 'same_player_vanilla_hand_packets', playerUuid: uuid.toLowerCase(), entityId: entity.id,
        sampledAt: time, mainArm: bot.settings.mainHand, usingItem, activeHand: typeof living === 'number' && living & 2 ? 'offhand' : 'mainhand',
        crouching: typeof entity.crouching === 'boolean' ? entity.crouching : !!((entity.metadata?.[0] ?? 0) & 2),
        spinAttack: pose === 4, swing: active }
    },
    close() { if (serializer && outgoing) serializer.off('data', outgoing); bot._client.off('state', attach)
      bot.off?.('spawn', reset); bot.off?.('respawn', reset); bot.off?.('end', reset) }
  }
}
