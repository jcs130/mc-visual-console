export function rendererEquipmentItem(item, itemsByName) {
  if (!item || typeof item !== "object" || typeof item.name !== "string") return item;
  const name = item.name.replace(/^minecraft:/, "");
  const registryId = itemsByName?.[name]?.id;
  return {
    ...item,
    name,
    itemId: Number.isFinite(registryId) ? registryId : name,
  };
}

export function rendererEntityEquipment(entity, itemsByName) {
  if (!Array.isArray(entity?.equipment)) return entity;
  return {
    ...entity,
    equipment: entity.equipment.map((item) => rendererEquipmentItem(item, itemsByName)),
  };
}

const installs = new WeakMap();
// minecraft-renderer 0.1.96 routes equipment[0] to `left` for mobs and
// equipment[1] to `right`. Those are logical slots, not the entity's arms.
// Correct only this adapter boundary; never swap the authoritative equipment
// array (YSM, native actors, inventory and other consumers need the real slots).
export function installRendererEquipmentHandedness(entities) {
  if (!entities || typeof entities.addItemModel !== 'function') return () => {};
  if (installs.has(entities)) return installs.get(entities);
  const original = entities.addItemModel;
  function corrected(entity, requestedArm, item, isPlayer = false) {
    let arm = requestedArm;
    if (!isPlayer && ['left', 'right'].includes(arm)) {
      const source = entity.originalEntity;
      // Java Mob.DATA_MOB_FLAGS_ID bit 1 is LeftHanded. Explicit mainArm wins
      // when a validated host already supplied it. Players have separate state.
      const left = source?.mainArm === 'left' || (source?.mainArm !== 'right' && !!(Number(source?.metadata?.[15]) & 2));
      if (!left) arm = arm === 'left' ? 'right' : 'left';
    }
    return original.call(this, entity, arm, item, isPlayer);
  }
  entities.addItemModel = corrected;
  const restore = () => {
    if (entities.addItemModel === corrected) entities.addItemModel = original;
    installs.delete(entities);
  };
  installs.set(entities, restore); return restore;
}
