import { Vector2, Matrix4 } from 'three';

/** Only render the existing native item/hand passes. Never draw the terrain,
 * sky, entities, postprocessing or cursor into the transparent OBS canvas. */
export function installObsHandsRenderer(world, { active = () => true, visible = () => true, now = () => performance.now() } = {}) {
  const renderer = world.renderer, original = world.render;
  if (renderer.getContext().getContextAttributes()?.alpha !== true) throw Error('OBS_HANDS_ALPHA_UNAVAILABLE');
  const size = new Vector2();
  renderer.setClearColor(0, 0);
  world.render = function () {
    renderer.getSize(size);
    world.camera.aspect = size.x / Math.max(1, size.y);
    world.camera.updateProjectionMatrix();
    renderer.setViewport(0, 0, size.x, size.y);
    renderer.setScissorTest(false);
    // HoldingBlock sets autoClear=false. Explicitly clear colour + depth on
    // EVERY frame, including detachment and hiding, to avoid ghost items.
    renderer.clear(true, true, true);
    world.updateSmoothFov?.();
    const show = active() && visible();
    // Keep swap clocks advancing while detached/hidden, without drawing old
    // meshes. A new subject must not display the previous subject during equip.
    world.holdingBlock.cameraGroup.visible = show && !world.holdingBlock.blockSwapAnimation?.switcher.isTransitioning;
    world.holdingBlockLeft.cameraGroup.visible = show && !world.holdingBlockLeft.blockSwapAnimation?.switcher.isTransitioning;
    world.holdingBlock.render(world.camera, renderer, world.ambientLight, world.directionalLight);
    world.holdingBlockLeft.render(world.camera, renderer, world.ambientLight, world.directionalLight);
    renderer.domElement.dataset.handsFrameAt = String(Math.round(now()));
  };
  return () => { world.render = original; renderer.clear(true, true, true); };
}

/** Eye inventory is already mirrored by the authenticated native connection.
 * Movement/use/arm animation belong to its attested camera target, not the Eye. */
export function obsHandAvatarState(state, session, tracked) {
  if (!state) return null;
  if (session?.mode !== 'observer') return session?.attached === false ? null : state;
  if (!session.attached) return null;
  const entity = state.entity?.id === session.entityId ? state.entity : tracked;
  if (entity?.id !== session.entityId || String(entity.uuid).toLowerCase() !== String(session.playerUuid).toLowerCase()) return null;
  const flags = Number(entity.metadata?.[8]) || 0;
  const offhand = state.offhand ?? state.equipment?.[1];
  return { ...state, entity, usingHeldItem: (flags & 1) !== 0, usingOffhand: (flags & 2) !== 0,
    shieldRaised: (flags & 3) === 3 && String(offhand?.name).replace(/^minecraft:/, '') === 'shield' };
}

/** Real use state + a monotonic clock, independent of 10 Hz snapshot frequency.
 * A missing heartbeat expires instead of replaying a stale eating animation. */
export class HeldItemUseClock {
  constructor() { this.reset(); }
  reset() { this.key = null; this.started = 0; this.updated = -Infinity; }
  update(state, now) {
    const hand = state?.usingOffhand === true ? 'left' : 'right';
    const slot = state?.hotbar?.[Number(state.quickBarSlot) || 0];
    const item = hand === 'left' ? state?.offhand : slot?.item ?? slot ?? state?.equipment?.[0] ?? state?.entity?.equipment?.[0];
    const key = state?.usingHeldItem === true && item?.name ? `${hand}:${item.name}` : null;
    if (key !== this.key || now - this.updated > 1500) this.started = now;
    this.key = key; this.updated = now;
  }
  sample(now) {
    return this.key && now - this.updated <= 1500
      ? { hand: this.key.startsWith('left:') ? 'left' : 'right', name: this.key.slice(this.key.indexOf(':') + 1).replace(/^minecraft:/, ''), ticks: Math.max(1, (now - this.started) / 50) } : null;
  }
}

// Vanilla's eat/drink arm transform: the same original item geometry and UVs
// are moved toward the mouth. Only a real use flag and known food/drink enter it.
export function consumeItemPose(ticks, duration = 32) {
  const remaining = Math.max(0, duration - ticks), fraction = remaining / duration;
  const bob = fraction < .8 ? Math.abs(Math.cos(remaining / 4 * Math.PI) * .1) : 0;
  const amount = 1 - Math.pow(Math.min(1, fraction), 27);
  return { x: amount * .6, y: bob - amount * .5, z: 0, yaw: amount * 90 * Math.PI / 180,
    pitch: amount * 10 * Math.PI / 180, roll: amount * 30 * Math.PI / 180 };
}

export function installHeldItemUseMotion(world, clock, { foods = {}, now = () => performance.now() } = {}) {
  const restore = [], matrix = new Matrix4(), part = new Matrix4();
  for (const [hand, holding] of [['right', world.holdingBlock], ['left', world.holdingBlockLeft]]) {
    const original = holding.updateCameraGroup;
    holding.updateCameraGroup = function (...args) {
      const use = clock.sample(now());
      original.apply(this, args);
      if (!use || use.hand !== hand) return;
      const drink = ['potion', 'milk_bucket', 'honey_bottle'].includes(use.name);
      if (!drink && !foods[use.name]) return;
      const pose = consumeItemPose(use.ticks, use.name === 'dried_kelp' ? 16 : 32);
      matrix.makeTranslation(pose.x, pose.y, pose.z);
      matrix.multiply(part.makeRotationY(pose.yaw));
      matrix.multiply(part.makeRotationX(pose.pitch));
      matrix.multiply(part.makeRotationZ(pose.roll));
      this.armTransformGroup.matrix.premultiply(matrix);
      this.armTransformGroup.matrixWorldNeedsUpdate = true;
    };
    restore.push(() => { holding.updateCameraGroup = original; });
  }
  return () => restore.forEach(fn => fn());
}
