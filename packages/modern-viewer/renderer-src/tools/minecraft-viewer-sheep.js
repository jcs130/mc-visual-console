/** Tint only the wool layer of the native 1.20.6 sheep model. */
const cortiSheepColors = Object.freeze([
  0xf9fffe, 0xf9801d, 0xc74ebd, 0x3ab3da,
  0xfed83d, 0x80c71f, 0xf38baa, 0x474f52,
  0x9d9d97, 0x169c9c, 0x8932b8, 0x3c44aa,
  0x835432, 0x5e7c16, 0xb02e26, 0x1d1d21,
]);

function cortiApplySheepAppearance(entity, attempt = 0) {
  if (canonicalEntityName(entity?.name) !== 'sheep') return;
  const id = String(entity.id);
  const sceneEntity = globalThis.world?.entities?.entities?.[id];
  const wool = sceneEntity?.children?.find((child) => child.name === 'mesh')
    ?.children?.find((child) => child.name === 'geometry_wool');
  if (!wool) {
    if (attempt < 6) requestAnimationFrame(() => {
      const current = entityCache.get(id);
      if (current && canonicalEntityName(current.name) === 'sheep') cortiApplySheepAppearance(current, attempt + 1);
    });
    return;
  }
  const appearance = entity.sheepAppearance;
  const colorId = Number.isInteger(appearance?.colorId) && appearance.colorId >= 0
    && appearance.colorId < cortiSheepColors.length ? appearance.colorId : 0;
  wool.material?.color?.setHex(cortiSheepColors[colorId]);
  wool.visible = appearance?.sheared !== true && !isEntityInvisible(entity);
}
