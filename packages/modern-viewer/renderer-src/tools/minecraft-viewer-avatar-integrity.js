/** Keep only the current local avatar after reconnects and match armor to the skin. */
const cortiRetiredSelfIds = new Set();

function cortiPruneSelfEntities(entity) {
  const current = pendingAvatarState?.entity;
  if (current?.id === undefined || current?.id === null) return false;
  const currentId = String(current.id);
  const incomingId = String(entity.id);
  cortiRetiredSelfIds.delete(currentId);
  const sameOwner = (candidate) => {
    if (canonicalEntityName(candidate?.name) !== 'player') return false;
    if (candidate.isSelf === true) return true;
    if (candidate.uuid && current.uuid) return candidate.uuid === current.uuid;
    return Boolean(candidate.username && current.username && candidate.username === current.username);
  };
  if (incomingId !== currentId && (cortiRetiredSelfIds.has(incomingId) || sameOwner(entity))) {
    cortiRetiredSelfIds.add(incomingId);
    handleEntity({ id: entity.id, delete: true }, false);
    return true;
  }
  if (incomingId !== currentId) return false;
  for (const [id, previous] of entityCache) {
    if (id !== currentId && sameOwner(previous)) {
      cortiRetiredSelfIds.add(id);
      handleEntity({ id: previous.id, delete: true }, false);
    }
  }
  return false;
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
    child.traverse((part) => { if (part.isMesh) part.frustumCulled = false; });
  }
  // The renderer has a second, special self mesh for its own third-person
  // implementation. This viewer streams the avatar as a normal world entity.
  const special = globalThis.world?.entities?.playerEntity;
  if (special && String(pendingAvatarState?.entity?.id) === String(entity.id)) special.visible = false;
}
