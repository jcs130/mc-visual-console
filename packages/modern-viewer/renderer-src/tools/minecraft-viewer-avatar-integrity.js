/** Keep only the current local avatar after reconnects and match armor to the skin. */
function cortiPruneSelfEntities(entity) {
  if (entity?.isSelf !== true || entity.id === undefined) return;
  const currentId = String(entity.id);
  if (String(pendingAvatarState?.entity?.id ?? '') !== currentId) return;
  for (const [id, previous] of entityCache) {
    if (id !== currentId && previous?.isSelf === true) {
      handleEntity({ id: previous.id, delete: true }, false);
    }
  }
}

function cortiAlignAvatarArmor(entity) {
  if (!usesWorldAvatar || entity?.id === undefined) return;
  const rendered = globalThis.world?.entities?.entities?.[String(entity.id)];
  if (!rendered?.children) return;
  const skin = rendered.children.find((child) => child.name === 'mesh');
  if (!skin) return;
  // The body is animated within a small static geometry bound. Third-person
  // orbit and dungeon cameras can otherwise cull it for a single frame.
  if (!skin.userData.cortiStableVisibility) {
    skin.traverse((part) => { if (part.isMesh) part.frustumCulled = false; });
    skin.userData.cortiStableVisibility = true;
  }
  for (const child of rendered.children) {
    if (!String(child.name).startsWith('geometry_armor_')) continue;
    // The skinview3d wrapper faces 180 degrees from renderer armor roots.
    child.rotation.y = skin.rotation.y + Math.PI;
    child.frustumCulled = false;
  }
  // The renderer has a second, special self mesh for its own third-person
  // implementation. This viewer streams the avatar as a normal world entity.
  const special = globalThis.world?.entities?.playerEntity;
  if (special?.originalEntity?.id === entity.id) special.visible = false;
}
