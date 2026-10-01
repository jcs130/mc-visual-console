import { Group } from "three";

const MOVEMENT_EPSILON = 0.012;
const WALK_REFERENCE_SPEED = 0.2;
const MAX_TRACKED_SPEED = 0.65;
const LEG_PIVOT_Y = 0.75;

/**
 * Vanilla nitwits and unemployed villagers do not display a trading-rank
 * badge. Keep this policy separate from texture loading so a profession layer
 * can never accidentally imply a trade level that the server entity lacks.
 */
export function villagerTextureLayerPlan(appearance) {
  const professionKey = String(appearance?.professionKey || "none");
  const levelKey = String(appearance?.levelKey || "none");
  const hasProfession = professionKey !== "none";
  return Object.freeze({
    professionKey,
    levelKey,
    hasProfession,
    hasTradeLevel: hasProfession && professionKey !== "nitwit" && levelKey !== "none",
  });
}

/**
 * minecraft-renderer's villager OBJ contains static leg meshes whose vertices
 * are authored in entity-local coordinates. Wrap them at the real hip line so
 * they can swing without rotating around the entity's feet/world origin.
 */
export function ensureNativeVillagerRig(modelRoot, entity, options = {}) {
  if (!modelRoot?.traverse || !modelRoot?.userData) return null;
  const existing = modelRoot.userData.__lanternNativeVillagerRig;
  if (existing?.schemaVersion === 1) {
    existing.updateEntity(entity, options.now?.());
    return existing;
  }

  const leftLeg = findModelPart(modelRoot, "leg0");
  const rightLeg = findModelPart(modelRoot, "leg1");
  if (!leftLeg?.parent || !rightLeg?.parent) return null;

  const leftPivot = wrapAtHip(leftLeg, "__lantern_villager_left_leg", LEG_PIVOT_Y);
  const rightPivot = wrapAtHip(rightLeg, "__lantern_villager_right_leg", LEG_PIVOT_Y);
  if (!leftPivot || !rightPivot) return null;

  const basePosition = modelRoot.position.clone();
  const state = {
    lastPosition: null,
    lastEntityAt: null,
    lastRenderAt: null,
    targetSpeed: 0,
    speed: 0,
    phase: 0,
    renderedFrames: 0,
  };
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  let disposed = false;

  const controller = {
    schemaVersion: 1,
    updateEntity(nextEntity, suppliedAt = now()) {
      if (disposed) return;
      const at = finiteNumber(suppliedAt, now());
      const position = entityPosition(nextEntity);
      const elapsed = state.lastEntityAt === null ? 0 : Math.max(0, (at - state.lastEntityAt) / 1_000);
      const displacementSpeed = position && state.lastPosition && elapsed > 0.005
        ? Math.hypot(position.x - state.lastPosition.x, position.z - state.lastPosition.z) / elapsed
        : 0;
      const velocitySpeed = horizontalVelocity(nextEntity);
      // Position deltas remain authoritative when a protocol adapter omits or
      // leaves a stale velocity field on relative-move packets.
      state.targetSpeed = clamp(
        displacementSpeed > MOVEMENT_EPSILON ? displacementSpeed : velocitySpeed,
        0,
        MAX_TRACKED_SPEED,
      );
      state.lastPosition = position;
      state.lastEntityAt = at;
    },
    render(suppliedAt = now()) {
      if (disposed) return;
      const at = finiteNumber(suppliedAt, now());
      const delta = state.lastRenderAt === null
        ? 0
        : clamp((at - state.lastRenderAt) / 1_000, 0, 0.1);
      state.lastRenderAt = at;
      const alpha = delta <= 0 ? 1 : 1 - Math.exp(-10 * delta);
      state.speed += (state.targetSpeed - state.speed) * alpha;
      const weight = smoothstep(MOVEMENT_EPSILON, WALK_REFERENCE_SPEED, state.speed);
      if (weight > 0.001) state.phase += delta * (5.8 + Math.min(state.speed, 0.4) * 13);
      const stride = Math.sin(state.phase) * 0.52 * weight;
      leftPivot.rotation.x = stride;
      rightPivot.rotation.x = -stride;
      modelRoot.position.y = basePosition.y + (1 - Math.cos(state.phase * 2)) * 0.009 * weight;
      state.renderedFrames += 1;
    },
    getDiagnostics() {
      return Object.freeze({
        rig: "native-villager-obj",
        speed: state.speed,
        targetSpeed: state.targetSpeed,
        phase: state.phase,
        renderedFrames: state.renderedFrames,
        legPivotY: LEG_PIVOT_Y,
        disposed,
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      leftPivot.rotation.x = 0;
      rightPivot.rotation.x = 0;
      modelRoot.position.copy(basePosition);
      if (anchor.onBeforeRender === renderHook) anchor.onBeforeRender = previousBeforeRender;
      delete modelRoot.userData.__lanternNativeVillagerRig;
    },
  };

  // A Group does not receive onBeforeRender in Three.js. Use the first visible
  // leg mesh as a bounded render hook; the transform is visible on the next
  // scene-matrix update and does not create a separate animation timer.
  const anchor = leftLeg;
  const previousBeforeRender = anchor.onBeforeRender;
  const renderHook = function renderNativeVillager(...args) {
    previousBeforeRender?.apply(this, args);
    controller.render();
  };
  anchor.onBeforeRender = renderHook;
  modelRoot.userData.__lanternNativeVillagerRig = controller;
  controller.updateEntity(entity, options.now?.());
  return controller;
}

function findModelPart(root, expectedName) {
  let found = null;
  root.traverse((child) => {
    if (!found && child?.isMesh && String(child.name || "").toLowerCase() === expectedName) found = child;
  });
  return found;
}

function wrapAtHip(mesh, name, pivotY) {
  const parent = mesh?.parent;
  if (!parent) return null;
  const pivot = new Group();
  pivot.name = name;
  pivot.position.set(mesh.position.x, mesh.position.y + pivotY, mesh.position.z);
  mesh.position.set(0, -pivotY, 0);
  parent.add(pivot);
  pivot.add(mesh);
  return pivot;
}

function entityPosition(entity) {
  const value = entity?.pos || entity?.position;
  if (![value?.x, value?.y, value?.z].every(Number.isFinite)) return null;
  return { x: value.x, y: value.y, z: value.z };
}

function horizontalVelocity(entity) {
  const value = entity?.velocity;
  if (![value?.x, value?.z].every(Number.isFinite)) return 0;
  return Math.hypot(value.x, value.z);
}

function smoothstep(minimum, maximum, value) {
  const normalized = clamp((value - minimum) / Math.max(Number.EPSILON, maximum - minimum), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, finiteNumber(value, minimum)));
}
