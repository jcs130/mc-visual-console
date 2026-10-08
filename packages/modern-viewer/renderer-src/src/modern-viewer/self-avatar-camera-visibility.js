import { Plane, Vector3 } from "three";

export function inUpperCutawayRegion(position, region) {
  if (!region) return true;
  const { center, camera, radius, corridorRadius, hitAlong, halfSpan } = region;
  if (Math.hypot(position.x - center.x, position.z - center.z) < radius) return true;
  const dx = center.x - camera.x, dz = center.z - camera.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq < 0.0001) return false;
  const along = ((position.x - camera.x) * dx + (position.z - camera.z) * dz) / lengthSq;
  if (along < Math.max(0, hitAlong - halfSpan) || along > 1 + halfSpan) return false;
  const closest = Math.max(0, Math.min(1, along));
  return Math.hypot(position.x - camera.x - closest * dx, position.z - camera.z - closest * dz) < corridorRadius;
}

// The renderer recomputes entity visibility immediately before each draw. Run
// after that pass so a wall-squeezed camera cannot render inside the local
// player's skin, armor, or held items. Leave terrain and camera collision alone.
export function installSelfAvatarCameraVisibility(world, getSelfId, {
  cameraBodyMargin = 0.04,
  getUpperCutawayY = () => null,
  getUpperCutawayRegion = () => null,
} = {}) {
  const entities = world?.entities;
  if (typeof entities?.render !== "function") return null;
  const originalRender = entities.render;
  const cameraPosition = new Vector3();
  const avatarPosition = new Vector3();
  let hiddenForNearCamera = false;
  let distance = null;
  let selfId = null;
  let hiddenUpperEntities = 0;
  const upperLayerPlane = new Plane(new Vector3(0, -1, 0), 0);
  let cutawayWorldY = null;
  const clippedObjects = new Map();
  let lastMaterialScanAt = -Infinity;
  const decorationPosition = new Vector3();

  function removeUpperLayerPlane() {
    for (const [node, record] of clippedObjects) restoreDecoration(node, record);
    clippedObjects.clear();
    lastMaterialScanAt = -Infinity;
  }

  function restoreDecoration(node, record) {
    if (node.material === record.applied) node.material = record.original;
    const originals = Array.isArray(record.original) ? record.original : [record.original];
    for (const material of Array.isArray(record.applied) ? record.applied : [record.applied]) {
      if (material && !originals.includes(material)) material.dispose();
    }
  }

  function worldPosition(object) {
    const tracked = world.sceneOrigin?.getWorldPosition?.(object);
    if (tracked) return tracked;
    object.getWorldPosition(decorationPosition);
    const origin = world.sceneOrigin;
    return { x: origin?.toWorldX?.(decorationPosition.x) ?? decorationPosition.x,
      y: origin?.toWorldY?.(decorationPosition.y) ?? decorationPosition.y,
      z: origin?.toWorldZ?.(decorationPosition.z) ?? decorationPosition.z };
  }

  function clipDecorations(region) {
    const now = performance.now();
    if (now - lastMaterialScanAt < 250) return;
    lastMaterialScanAt = now;
    const entityRoots = new Set(Object.values(entities.entities ?? {}));
    if (entities.playerEntity) entityRoots.add(entities.playerEntity);
    const active = new Set();
    const visit = node => {
      if (entityRoots.has(node)) return;
      if (node.isMesh && inUpperCutawayRegion(worldPosition(node), region)) {
        const record = clippedObjects.get(node);
        if (record && node.material !== record.applied) {
          restoreDecoration(node, record);
          clippedObjects.delete(node);
        }
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        if (materials.some(material => material && !material.isShaderMaterial)) {
          active.add(node);
          if (!clippedObjects.has(node)) {
            const original = node.material;
            const clones = materials.map(material => {
              if (!material || material.isShaderMaterial) return material;
              const clone = material.clone();
              clone.clippingPlanes = [...(material.clippingPlanes ?? []), upperLayerPlane];
              return clone;
            });
            node.material = Array.isArray(original) ? clones : clones[0];
            clippedObjects.set(node, { original, applied: node.material });
          }
        }
      }
      for (const child of node.children ?? []) visit(child);
    };
    if (world.scene) visit(world.scene);
    for (const [node, record] of clippedObjects) if (!active.has(node)) {
      restoreDecoration(node, record);
      clippedObjects.delete(node);
    }
  }

  function update() {
    const id = getSelfId?.();
    selfId = id === undefined || id === null ? null : String(id);
    // The native renderer resets visibility on every draw. Applying the roof
    // policy on its slower terrain-check timer lets upper-floor mobs reappear.
    const cutawayY = getUpperCutawayY();
    const region = getUpperCutawayRegion();
    cutawayWorldY = Number.isFinite(cutawayY) ? Math.floor(cutawayY) + 1.95 : null;
    if (cutawayWorldY !== null && world.renderer) {
      // Local material clipping covers signs and banners without cutting the
      // player while jumping or standing on a partial block.
      upperLayerPlane.constant = world.sceneOrigin?.toSceneY?.(cutawayWorldY) ?? cutawayWorldY;
      world.renderer.localClippingEnabled = true;
      clipDecorations(region);
    } else {
      removeUpperLayerPlane();
    }
    hiddenUpperEntities = 0;
    if (Number.isFinite(cutawayY)) {
      for (const [entityId, object] of Object.entries(entities.entities ?? {})) {
        if (entityId === selfId) continue;
        const entity = object.originalEntity;
        // originalEntity keeps the creation packet. Tracked coordinates follow
        // movement tweens and floating-origin shifts, including vertical travel.
        const currentPosition = worldPosition(object);
        const y = Number(currentPosition?.y ?? entity?.pos?.y ?? entity?.position?.y);
        if (Number.isFinite(y) && y >= Math.floor(cutawayY) + 2 && inUpperCutawayRegion(currentPosition, region)) {
          object.visible = false;
          hiddenUpperEntities += 1;
        }
      }
    }
    // minecraft-renderer has a second special self mesh. Its own render pass
    // sets visible=true every frame, even though this viewer streams the
    // player as a normal entity. Suppress the duplicate on the same frame.
    const special = entities.playerEntity;
    // This controller is installed only for the normal world-avatar pipeline.
    // The special local mesh may still carry the previous respawn ID.
    if (selfId !== null && special) {
      special.visible = false;
    }
    const avatar = id === undefined || id === null
      ? null
      : entities.entities?.[String(id)];
    if (!avatar || !world.camera?.getWorldPosition || !avatar.getWorldPosition) {
      hiddenForNearCamera = false;
      distance = null;
      return;
    }

    world.camera.getWorldPosition(cameraPosition);
    avatar.getWorldPosition(avatarPosition);
    distance = cameraPosition.distanceTo(avatarPosition);
    if (!Number.isFinite(distance)) return;
    const entity = avatar.originalEntity;
    // A collision-shortened third-person orbit still shows the body unless
    // the near plane enters it. Distance to the feet alone hides a standing
    // player even when the camera is outside the skin and has a clear view.
    const width = Number(entity?.width) || 0.6;
    const height = Number(entity?.height) || 1.8;
    const margin = Math.max(0, Number(world.camera.near) || 0) + cameraBodyMargin
      + (hiddenForNearCamera ? 0.03 : 0);
    const halfWidth = width / 2 + margin;
    hiddenForNearCamera = Math.abs(cameraPosition.x - avatarPosition.x) < halfWidth
      && Math.abs(cameraPosition.z - avatarPosition.z) < halfWidth
      && cameraPosition.y > avatarPosition.y - margin
      && cameraPosition.y < avatarPosition.y + height + margin;
    const flags = Number(entity?.metadata?.[0]) || 0;
    const invisible = entity?.invisible === true || entity?.isInvisible === true || (flags & 0x20) !== 0;
    // Section occlusion follows the game camera and may be stale while the
    // observer camera or chunks move. The tracked self still uses depth testing.
    avatar.visible = !hiddenForNearCamera && !invisible;
  }

  const wrappedRender = function (...args) {
    const result = originalRender.apply(this, args);
    update();
    return result;
  };
  entities.render = wrappedRender;

  return {
    get diagnostics() {
      return { selfId, distance, hiddenForNearCamera, hiddenUpperEntities, cutawayWorldY };
    },
    dispose() {
      removeUpperLayerPlane();
      if (entities.render === wrappedRender) entities.render = originalRender;
    },
  };
}
