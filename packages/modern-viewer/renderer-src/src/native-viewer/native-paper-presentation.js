// Paper sends inventory only when it changes, while the same body's motion is
// sampled every tick. Advance the cached presentation from that verified sample
// so animation never ages out just because the player keeps the same items.
// Do not refresh a different body, an old sample or any client-owned protocol.
export function advancePaperPresentation(presentation, event, playerUuid) {
  const self=event?.selfPlayer, motion=event?.motion
  if(presentation?.source!=='paper_server_observation'||presentation.available!==true||
    presentation.playerUuid!==playerUuid||presentation.self?.uuid!==playerUuid||
    self?.uuid!==playerUuid||self.entityId!==presentation.self.entityId||
    motion?.source!=='same_player_physics_tick'||motion.schemaVersion!==1||motion.tickMs!==50||
    motion.epoch!==event.epoch||!Number.isSafeInteger(motion.tick)||motion.tick<0||
    !Number.isFinite(motion.sampledAt)||!Number.isFinite(presentation.sampledAt)||
    motion.sampledAt<presentation.sampledAt)return presentation
  // Generic snapshots may carry a null attribute value even though the Paper
  // presentation has the actual maximum health/armor. Those HUD values and item
  // slots arrive on their own change lane; a movement sample cannot erase them.
  const fields='position yaw pitch eyeHeight bodyYaw headYaw velocity onGround sprinting flying inWater sneaking crouching locomotion pose spinAttack swinging usingItem useItemRemainingTicks attackAnim climbing isPassenger vehicleType'.split(' ')
  const movement=Object.fromEntries(fields.filter(key=>Object.hasOwn(self,key)).map(key=>[key,self[key]]))
  return {...presentation,sampledAt:motion.sampledAt,self:{...presentation.self,...movement}}
}
