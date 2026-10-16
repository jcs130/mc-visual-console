import { Color, Vector3 } from 'three';

const waterNames = new Set(['water', 'bubble_column', 'kelp', 'kelp_plant', 'seagrass', 'tall_seagrass']);
const wet = block => waterNames.has(block?.name) || block?.getProperties?.().waterlogged === true;

/** Visual camera medium only. Body contact is not an underwater camera. */
export function cameraWaterDepth(position, blockAt) {
  if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) return null;
  const x = Math.floor(position.x), y = Math.floor(position.y), z = Math.floor(position.z);
  const block = blockAt(x, y, z);
  if (!block) return null;
  if (!wet(block)) return -1;
  const above = blockAt(x, y + 1, z);
  const level = Number(block.getProperties?.().level ?? 0);
  const height = wet(above) ? 1 : (8 - (level >= 8 ? 0 : Math.max(0, Math.min(7, level)))) / 9;
  return y + height - position.y;
}

export class CameraWaterTransition {
  amount = 0;
  submerged = false;
  at = null;
  update(depth, now) {
    // Unknown streamed geometry never inherits the actor's water flag.
    if (depth === null) this.submerged = false;
    else if (this.submerged ? depth < -0.02 : depth > 0.02) this.submerged = !this.submerged;
    const dt = this.at === null ? 0 : Math.min(100, Math.max(0, now - this.at));
    this.at = now;
    const target = this.submerged ? 1 : 0;
    this.amount += (target - this.amount) * (1 - Math.exp(-dt / 140));
    if (Math.abs(this.amount - target) < .001) this.amount = target;
    return this.amount;
  }
}

// Minecraft 1.21.1 FogRenderer.setupFog: water starts at -8, ends at 96;
// a LocalPlayer scales the end by max(.25, getWaterVision()), then the
// actual render distance caps it. A free observation camera is not that
// LocalPlayer. Water Breathing alone does not select a 5/100 block cutoff.
export function cameraWaterFogRange({ observer = false, waterVision, viewDistance } = {}) {
  const vision = Number.isFinite(waterVision) ? Math.max(0, Math.min(1, waterVision)) : 0;
  const end = 96 * (observer ? 1 : Math.max(.25, vision));
  const cap = Number.isFinite(viewDistance) && viewDistance > 0 ? viewDistance * 16 : end;
  return { near: -8, far: Math.min(end, cap), visionKnown: observer || Number.isFinite(waterVision) };
}

export function installCameraWater(world, blockAt, now = () => performance.now(), options = {}) {
  const transition = new CameraWaterTransition(), cameraPosition = new Vector3();
  // Keep the pinned renderer's existing water palette; only its camera-medium
  // selection and abrupt transitions change here. Biome colour parity is separate.
  const waterColor = new Color(0, 0, 1), voidColor = new Color(0, 0, .6);
  const previous = world.scene.onBeforeRender;
  world.scene.onBeforeRender = function (...args) {
    previous?.apply(this, args);
    const camera = args[2] ?? world.camera;
    if (camera.userData?.offscreenTerrain === true) return;
    camera.getWorldPosition(cameraPosition);
    const position = {
      x: world.sceneOrigin.toWorldX(cameraPosition.x),
      y: world.sceneOrigin.toWorldY(cameraPosition.y),
      z: world.sceneOrigin.toWorldZ(cameraPosition.z),
    };
    const depth = cameraWaterDepth(position, blockAt);
    const amount = transition.update(depth, now());
    // The native sky update restores the dry scene before every rendered frame.
    const fog = world.scene.fog;
    const range = cameraWaterFogRange({
      observer: options.observer === true,
      waterVision: options.waterVision?.(),
      viewDistance: world.viewDistance,
    });
    if (fog && amount > 0) {
      fog.color.lerp(waterColor, amount);
      fog.near += (range.near - fog.near) * amount;
      fog.far += (range.far - fog.far) * amount;
      world.scene.background?.isColor && world.scene.background.lerp(waterColor, amount);
      world.skyboxRenderer.skyMesh?.material?.color?.lerp(waterColor, amount);
      world.skyboxRenderer.voidMesh?.material?.color?.lerp(voidColor, amount);
    }
    world.cameraMedium = { source: 'camera-streamed-block', known: depth !== null, submerged: transition.submerged, amount, position,
      waterFog: { ...range, rangeSource: 'java-1.21.1-FogRenderer', colourSource: 'legacy-renderer-palette',
        biomeColourParityVerified: false } };
  };
  return transition;
}
