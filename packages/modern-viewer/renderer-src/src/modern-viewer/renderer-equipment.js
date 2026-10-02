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
