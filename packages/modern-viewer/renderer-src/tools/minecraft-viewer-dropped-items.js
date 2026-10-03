/** Ground item animation on the rendered item mesh; network position stays authoritative. */
const cortiDroppedItemMeshes = new Map();
let cortiDroppedItemFrameId = 0;
let cortiDroppedItemLastFrameAt = null;
let cortiDroppedItemRetryTimer = null;
let cortiDroppedItemAnimationReady = false;

function cortiDroppedItemPhase(id) {
  let hash = 2166136261;
  for (const character of String(id)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296 * Math.PI * 2;
}

function cortiDroppedItemPose(elapsedSeconds, phase, baseY, baseYaw) {
  const seconds = Math.max(0, elapsedSeconds);
  const entrance = Math.min(1, seconds / 0.25);
  return {
    y: baseY + Math.sin(seconds * 2 + phase) * 0.09 * entrance,
    yaw: baseYaw + seconds,
  };
}

function cortiScheduleDroppedItemFrame() {
  if (cortiDroppedItemFrameId || document.hidden || !cortiDroppedItemMeshes.size) return;
  cortiDroppedItemFrameId = requestAnimationFrame(cortiAnimateDroppedItems);
}

function cortiScheduleDroppedItemRetry() {
  if (cortiDroppedItemRetryTimer !== null || document.hidden) return;
  cortiDroppedItemRetryTimer = setTimeout(() => {
    cortiDroppedItemRetryTimer = null;
    cortiReconcileDroppedItems();
  }, 200);
}

function cortiReconcileDroppedItems() {
  if (!cortiDroppedItemAnimationReady || !rendererReady || document.hidden) return;
  const rendered = globalThis.world?.entities?.entities;
  if (!rendered) return;
  let waitingForMesh = false;
  for (const [id, entity] of entityCache) {
    if (canonicalEntityName(entity?.name) !== 'item') continue;
    const root = rendered[id];
    const mesh = root?.children?.find(child => child.name === 'mesh');
    if (!mesh) { waitingForMesh = true; continue; }
    if (cortiDroppedItemMeshes.get(id)?.mesh === mesh) continue;
    // Upstream rotates in onBeforeRender, which skips Group-based item models.
    // The single animation loop below handles both Mesh and Group models.
    mesh.onBeforeRender = () => {};
    cortiDroppedItemMeshes.set(id, {
      root, mesh, baseY: mesh.position.y, baseYaw: mesh.rotation.y,
      elapsedSeconds: 0, phase: cortiDroppedItemPhase(id),
    });
  }
  for (const [id, entry] of cortiDroppedItemMeshes) {
    if (canonicalEntityName(entityCache.get(id)?.name) !== 'item' || rendered[id] !== entry.root ||
        !entry.root.children?.includes(entry.mesh)) {
      cortiDroppedItemMeshes.delete(id);
    }
  }
  cortiScheduleDroppedItemFrame();
  if (waitingForMesh) cortiScheduleDroppedItemRetry();
}

function cortiAnimateDroppedItems(now) {
  cortiDroppedItemFrameId = 0;
  if (!rendererReady || document.hidden) return;
  const deltaSeconds = cortiDroppedItemLastFrameAt === null ? 0
    : Math.max(0, Math.min(0.1, (now - cortiDroppedItemLastFrameAt) / 1000));
  cortiDroppedItemLastFrameAt = now;
  const rendered = globalThis.world?.entities?.entities;
  for (const [id, entry] of cortiDroppedItemMeshes) {
    if (canonicalEntityName(entityCache.get(id)?.name) !== 'item' || rendered?.[id] !== entry.root ||
        !entry.root.children?.includes(entry.mesh)) {
      cortiDroppedItemMeshes.delete(id);
      continue;
    }
    entry.elapsedSeconds += deltaSeconds;
    const pose = cortiDroppedItemPose(entry.elapsedSeconds, entry.phase, entry.baseY, entry.baseYaw);
    entry.mesh.position.y = pose.y;
    entry.mesh.rotation.y = pose.yaw;
  }
  if (!cortiDroppedItemMeshes.size) cortiDroppedItemLastFrameAt = null;
  cortiScheduleDroppedItemFrame();
}

function cortiInitializeDroppedItems() {
  if (cortiDroppedItemAnimationReady) return;
  cortiDroppedItemAnimationReady = true;
  if (typeof socket !== 'undefined') socket.on('entity', update => {
    const id = String(update?.id ?? '');
    if (canonicalEntityName(entityCache.get(id)?.name) === 'item' || cortiDroppedItemMeshes.has(id)) {
      cortiReconcileDroppedItems();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (cortiDroppedItemFrameId) cancelAnimationFrame(cortiDroppedItemFrameId);
      cortiDroppedItemFrameId = 0;
      cortiDroppedItemLastFrameAt = null;
      if (cortiDroppedItemRetryTimer !== null) clearTimeout(cortiDroppedItemRetryTimer);
      cortiDroppedItemRetryTimer = null;
    } else cortiReconcileDroppedItems();
  });
  window.addEventListener('pagehide', () => {
    if (cortiDroppedItemFrameId) cancelAnimationFrame(cortiDroppedItemFrameId);
    cortiDroppedItemLastFrameAt = null;
    if (cortiDroppedItemRetryTimer !== null) clearTimeout(cortiDroppedItemRetryTimer);
    cortiDroppedItemMeshes.clear();
  }, { once: true });
  cortiReconcileDroppedItems();
}

globalThis.__cortiDroppedItems = {
  get animatedCount() { return cortiDroppedItemMeshes.size; },
};
