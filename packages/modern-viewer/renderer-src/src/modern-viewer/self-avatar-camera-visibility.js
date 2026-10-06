import { Vector3 } from "three";

// The renderer recomputes entity visibility immediately before each draw. Run
// after that pass so a wall-squeezed camera cannot render inside the local
// player's skin, armor, or held items. Leave terrain and camera collision alone.
export function installSelfAvatarCameraVisibility(world, getSelfId, {
  hideDistance = 1.75,
  showDistance = 2.2,
  getUpperCutawayY = () => null,
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

  function update() {
    const id = getSelfId?.();
    selfId = id === undefined || id === null ? null : String(id);
    // The native renderer resets visibility on every draw. Applying the roof
    // policy on its slower terrain-check timer lets upper-floor mobs reappear.
    const cutawayY = getUpperCutawayY();
    hiddenUpperEntities = 0;
    if (Number.isFinite(cutawayY)) {
      for (const [entityId, object] of Object.entries(entities.entities ?? {})) {
        if (entityId === selfId) continue;
        const entity = object.originalEntity;
        // originalEntity keeps the creation packet. Tracked coordinates follow
        // movement tweens and floating-origin shifts, including vertical travel.
        const currentPosition = world.sceneOrigin?.getWorldPosition?.(object);
        const y = Number(currentPosition?.y ?? entity?.pos?.y ?? entity?.position?.y);
        if (Number.isFinite(y) && y >= Math.floor(cutawayY) + 2) {
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
    hiddenForNearCamera = distance < (hiddenForNearCamera ? showDistance : hideDistance);
    const entity = avatar.originalEntity;
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
      return { selfId, distance, hiddenForNearCamera, hiddenUpperEntities };
    },
    dispose() {
      if (entities.render === wrappedRender) entities.render = originalRender;
    },
  };
}
