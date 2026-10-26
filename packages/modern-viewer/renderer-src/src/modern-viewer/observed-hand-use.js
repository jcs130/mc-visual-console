const itemName = item => String(item?.name ?? '').replace(/^minecraft:/, '');

/** Same-connection use state. Holding a shield alone never means blocking. */
export function observedHandUse(entity, ownState) {
  const equipment = [...(entity?.equipment ?? [])];
  if (ownState) {
    if (Array.isArray(ownState.hotbar)) equipment[0] = ownState.hotbar.find(slot => slot?.selected)?.item ?? null;
    if (Object.hasOwn(ownState, 'offhand')) equipment[1] = ownState.offhand;
  }
  const flags = entity?.metadata?.[8];
  let usingItem = typeof flags === 'number' ? Boolean(flags & 1) : false;
  let activeHand = typeof flags === 'number' && flags & 2 ? 'offhand' : 'mainhand';
  if (ownState && typeof ownState.usingHeldItem === 'boolean') {
    usingItem = ownState.usingHeldItem;
    activeHand = ownState.usingOffhand === true ? 'offhand' : 'mainhand';
  }
  // Older hosts only emitted the offhand boolean. New hosts also name the hand.
  if (ownState?.shieldRaised === true) {
    const hand = ownState.shieldHand === 'mainhand' ? 'mainhand' : 'offhand';
    if (itemName(equipment[hand === 'offhand' ? 1 : 0]) === 'shield') {
      usingItem = true; activeHand = hand;
    }
  }
  if (entity?.bodyState?.canAct === false || entity?.sleepState?.sleeping === true || ownState?.health === 0) usingItem = false;
  const shieldRaised = usingItem && itemName(equipment[activeHand === 'offhand' ? 1 : 0]) === 'shield';
  const mainArm=ownState?.mainArm??entity?.mainArm??(entity?.metadata?.[18]===0?'left':'right');
  return { usingItem, activeHand, mainArm, equipment, shieldRaised, shieldHand: shieldRaised ? activeHand : null };
}
