// Read the same 1.21.1 Mineflayer body's public settings/use state and its
// serialized arm-animation packet. No calls to swingArm, no extra game writes.
import { observeSentPackets } from './viewer-agent.mjs'
import { vanillaItemStack } from './vanilla-item-stack.mjs'

export function observeVanillaHands(bot, { now = Date.now } = {}) {
  let serializer, outgoing, swing = null, use = null, sequence = 0, identity = null
  const reset = () => { swing = null; use = null; identity = null }
  const own = () => {
    const key=`${bot._client.uuid}:${bot.entity?.id}`
    if(key!==identity){swing=null;use=null;identity=key}
  }
  const itemInHand = hand => hand==='offhand'?bot.inventory?.slots?.[45]:bot.heldItem
  const stackKey = item => item ? vanillaItemStack(item,bot.registry).item?.snbt ?? null : null
  const stopSent = observeSentPackets(bot._client,(name,data)=>{
    if(bot.version!=='1.21.1'||bot._client.state!=='play')return
    own()
    if(name==='block_dig'&&data?.status===5){use=null;return}
    if(name!=='use_item'||![0,1].includes(data?.hand))return
    const hand=data.hand===1?'offhand':'mainhand',item=itemInHand(hand),key=stackKey(item)
    use=null
    if(!key||!item || item.components.some(c=>c.type==='food') || item.removedComponents.includes('food'))return
    // Locked FoodProperties.Builder defaults 1.6s, fast (only dried kelp)
    // 0.8s; MilkBucketItem/PotionItem 32 ticks, HoneyBottleItem 40 ticks.
    const drink=['milk_bucket','potion','honey_bottle'].includes(item.name)
    if(!drink&&!bot.registry?.foodsByName?.[item.name])return
    use={hand,name:`minecraft:${item.name}`,kind:drink?'drink':'eat',startedAt:now(),
      durationTicks:item.name==='honey_bottle'?40:item.name==='dried_kelp'?16:32,key}
  })
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
      if (key !== identity) { swing = null; use = null; identity = key }
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
      if (identity !== key) { swing = null; use = null; identity = key }
      if (!uuid || !entity || (entity.uuid && entity.uuid.toLowerCase() !== uuid.toLowerCase()) || !['left', 'right'].includes(bot.settings?.mainHand)) return null
      const time = now(), living = entity.metadata?.[8], pose = entity.metadata?.[6]
      const usingItem = typeof bot.usingHeldItem === 'boolean' ? bot.usingHeldItem : typeof living === 'number' ? !!(living & 1) : null
      if(usingItem!==true || use && (stackKey(itemInHand(use.hand))!==use.key || time<use.startedAt || time-use.startedAt>=use.durationTicks*50))use=null
      const active = swing && time - swing.startedAt < swing.durationTicks * 50 ? { ...swing } : null
      return { source: 'same_player_vanilla_hand_packets', playerUuid: uuid.toLowerCase(), entityId: entity.id,
        sampledAt: time, mainArm: bot.settings.mainHand, usingItem, activeHand: use?.hand ?? (typeof living === 'number' && living & 2 ? 'offhand' : 'mainhand'),
        use:use?{hand:use.hand,name:use.name,kind:use.kind,startedAt:use.startedAt,durationTicks:use.durationTicks,source:'observed_use_packet_vanilla_duration'}:null,
        crouching: typeof entity.crouching === 'boolean' ? entity.crouching : !!((entity.metadata?.[0] ?? 0) & 2),
        spinAttack: pose === 4, swing: active }
    },
    close() { stopSent(); if (serializer && outgoing) serializer.off('data', outgoing); bot._client.off('state', attach)
      bot.off?.('spawn', reset); bot.off?.('respawn', reset); bot.off?.('end', reset) }
  }
}
