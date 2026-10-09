import { DataTexture, NearestFilter, RGFormat, Vector3 } from "three";

export const ROOM_RADIUS = 6;
export const MAX_ROOM_RADIUS = 96;
export const ROOM_EDGE = 0.75;
export const APERTURE_WIDTH = 1.3;
export const APERTURE_HEIGHT = 1.85;
export const APERTURE_EDGE = 0.22;
export const CEILING_SCAN_HEIGHT = 64;
export const CUTAWAY_MATERIAL_VERSION = 4;

export function hasRoomCeiling(avatar, cache) {
  const x = Math.floor(avatar.x), y = Math.floor(avatar.y), z = Math.floor(avatar.z);
  for (let height = 2; height <= CEILING_SCAN_HEIGHT; height += 1) {
    let surrounding = 0;
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (cache.isSolidBlock(x + dx, y + height, z + dz)) surrounding += 1;
    }
    if (surrounding >= 3) return true;
  }
  return false;
}

const corner = new Vector3();
const cameraPosition = new Vector3();

// Cover the visible floor, including its far corners when zooming out. The
// bound prevents an almost horizontal observer camera from slicing the world.
export function roomRevealRadius(camera, target, floorY, coveredRoom = true) {
  // A cave entrance with no roof needs a local opening, not a viewport-sized
  // slice through an outdoor mountain. Enclosed rooms follow the full view.
  if (!coveredRoom) return ROOM_RADIUS;
  camera.getWorldPosition(cameraPosition);
  let radius = ROOM_RADIUS;
  for (const x of [-1, 1]) for (const y of [-1, 1]) {
    corner.set(x, y, 1).unproject(camera).sub(cameraPosition);
    const along = (floorY - cameraPosition.y) / corner.y;
    if (along <= 0 || !Number.isFinite(along)) continue;
    radius = Math.max(radius, Math.hypot(cameraPosition.x + corner.x * along - target.x,
      cameraPosition.z + corner.z * along - target.z) + ROOM_EDGE);
  }
  return Math.min(MAX_ROOM_RADIUS, radius);
}

export function hasDeepRoof(avatar, cache) {
  const x = Math.floor(avatar.x), y = Math.floor(avatar.y), z = Math.floor(avatar.z);
  let solids = 0;
  for (let height = 2; height <= 10; height += 1) {
    if (cache.isSolidBlock(x, y + height, z)) solids += 1;
  }
  return solids >= 5;
}

export function roomCutoffWorldY(y, covered) {
  return covered ? Math.floor(y) + 1.95 : y + 0.05;
}

export function roomOcclusionMode(dungeon, covered = false) {
  return dungeon && covered ? "cutaway" : "translucent";
}

// Exponential smoothing is independent of refresh rate and stops after a tab
// resumes. No extra animation loop, mesh rebuild, or material recompilation.
export function advanceReveal(current, active, elapsedMs) {
  const target = active ? 1 : 0;
  const elapsed = Math.max(0, Math.min(250, Number(elapsedMs) || 0));
  const next = target + (current - target) * Math.exp(-elapsed / (active ? 55 : 85));
  return Math.abs(next - target) < 0.005 ? target : next;
}

export function createCutawayUniforms() {
  const mask = new DataTexture(new Uint8Array([255, 128]), 1, 1, RGFormat);
  mask.minFilter = mask.magFilter = NearestFilter;
  mask.needsUpdate = true;
  return {
    // 0 disabled, 1 body aperture, 2 covered room, 3 local cave entrance.
    u_lanternCutawayEnabled: { value: 0 },
    u_lanternReveal: { value: 0 },
    u_lanternCutawayY: { value: 0 },
    u_lanternFootY: { value: 0 },
    u_lanternRoomRadius: { value: ROOM_RADIUS },
    u_lanternRoomMaskEnabled: { value: 0 },
    u_lanternRoomMask: { value: mask },
    u_lanternRoomMaskOrigin: { value: new Vector3() },
    u_lanternRoomMaskSize: { value: 1 },
    u_lanternCutawayCamera: { value: new Vector3() },
    u_lanternCutawayTarget: { value: new Vector3() },
    u_lanternCameraRight: { value: new Vector3(1, 0, 0) },
    u_lanternCameraUp: { value: new Vector3(0, 1, 0) },
    u_lanternCameraForward: { value: new Vector3(0, 0, -1) },
  };
}

export function setRoomFloorMask(uniforms, mask) {
  let texture = uniforms.u_lanternRoomMask.value;
  if (texture.image.width !== mask.width) {
    texture.dispose();
    texture = new DataTexture(mask.data, mask.width, mask.width, RGFormat);
    texture.minFilter = texture.magFilter = NearestFilter;
    uniforms.u_lanternRoomMask.value = texture;
  } else texture.image.data = mask.data;
  texture.needsUpdate = true;
  uniforms.u_lanternRoomMaskSize.value = mask.width;
  uniforms.u_lanternRoomMaskEnabled.value = 1;
}

const smoothstep = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

function floorCoverage(point, target, radius, floorMask) {
  if (floorMask && !floorMask.contains(point)) return 0;
  return 1 - smoothstep(radius - ROOM_EDGE, radius, Math.hypot(point.x - target.x, point.z - target.z));
}

// A wall may stand outside the walkable footprint yet hide the floor behind
// it. Intersect that pixel's camera ray with the connected floor, correcting
// its height for steps. Bounded iteration rejects ambiguous multi-level rays.
export function projectedRoomFloor(point, camera, footY, floorMask) {
  if (!floorMask || !Number.isFinite(camera?.y) || !Number.isFinite(point.y)
    || camera.y <= footY || point.y >= camera.y - 0.001) return null;
  const ray = sub(point, camera);
  let floorY = footY;
  for (let iteration = 0; iteration < 3; iteration++) {
    const along = (floorY - camera.y) / ray.y;
    const hit = { x: camera.x + ray.x * along, y: floorY, z: camera.z + ray.z * along };
    if (!floorMask.contains(hit)) return null;
    const nextY = (floorMask.floorYAt?.(hit) ?? footY - 0.05) + 0.05;
    if (Math.abs(nextY - floorY) < 0.01) return along > 1.001 ? hit : null;
    floorY = nextY;
  }
  return null;
}

/** CPU reference for the terrain mask; coordinates may use any shared origin. */
export function cutawayMask(point, { camera, target, right, up, forward, footY, cutoffY, covered, roomRadius = ROOM_RADIUS, floorMask = null }) {
  const localFloorY = floorMask?.floorYAt?.(point);
  if (localFloorY != null && point.y <= localFloorY + 0.05) return 0;
  let mask = covered && point.y > (localFloorY == null ? cutoffY : localFloorY + 1.95)
    ? floorCoverage(point, target, roomRadius, floorMask) : 0;
  if (covered) {
    const floor = projectedRoomFloor(point, camera, footY, floorMask);
    if (floor) mask = Math.max(mask, floorCoverage(floor, target, roomRadius, floorMask));
  }
  const targetDepth = dot(sub(target, camera), forward);
  const depth = dot(sub(point, camera), forward);
  if (point.y <= footY || targetDepth <= 0.01 || depth <= 0.05 || depth > targetDepth + 0.65) return mask;
  const scale = depth / targetDepth;
  const offset = sub(point, {
    x: camera.x + (target.x - camera.x) * scale,
    y: camera.y + (target.y - camera.y) * scale,
    z: camera.z + (target.z - camera.z) * scale,
  });
  const radius = Math.hypot(dot(offset, right) / (scale * APERTURE_WIDTH), dot(offset, up) / (scale * APERTURE_HEIGHT));
  return Math.max(mask, 1 - smoothstep(1 - APERTURE_EDGE, 1, radius));
}

// Connected floor columns remove roofs; their camera rays remove foreground
// cave walls as well. The floor and unrelated terrain behind it remain opaque.
// Ordered coverage keeps opaque depth testing: chunk sorting cannot make walls
// flicker, and the fully open centre has no residual checkerboard over the body.
export const CUTAWAY_FRAGMENT = `
uniform float u_lanternCutawayEnabled;
uniform float u_lanternReveal;
uniform float u_lanternCutawayY;
uniform float u_lanternFootY;
uniform float u_lanternRoomRadius;
uniform float u_lanternRoomMaskEnabled;
uniform sampler2D u_lanternRoomMask;
uniform vec3 u_lanternRoomMaskOrigin;
uniform float u_lanternRoomMaskSize;
uniform vec3 u_lanternCutawayCamera;
uniform vec3 u_lanternCutawayTarget;
uniform vec3 u_lanternCameraRight;
uniform vec3 u_lanternCameraUp;
uniform vec3 u_lanternCameraForward;
in vec3 v_lanternCutawayPosition;
vec2 lanternFloorAt(vec2 xz) {
  float coverage = 1.0 - smoothstep(u_lanternRoomRadius - ${ROOM_EDGE}, u_lanternRoomRadius, distance(xz, u_lanternCutawayTarget.xz));
  if (u_lanternRoomMaskEnabled < 0.5) return vec2(coverage, u_lanternCutawayY - 1.95);
  vec2 cell = floor(xz - u_lanternRoomMaskOrigin.xz);
  if (any(lessThan(cell, vec2(0.0))) || any(greaterThanEqual(cell, vec2(u_lanternRoomMaskSize)))) return vec2(0.0);
  vec2 floorState = texture2D(u_lanternRoomMask, (cell + 0.5) / u_lanternRoomMaskSize).rg;
  return vec2(coverage * floorState.r, u_lanternRoomMaskOrigin.y + floor(floorState.g * 255.0 + 0.5) - 128.0);
}
void lanternApplyCutaway() {
  if (u_lanternCutawayEnabled < 0.5 || u_lanternReveal <= 0.0) return;
  vec3 point = v_lanternCutawayPosition;
  float mask = 0.0;
  if (u_lanternCutawayEnabled > 1.5) {
    vec3 faceNormal = normalize(cross(dFdx(point), dFdy(point)));
    if (!gl_FrontFacing) faceNormal = -faceNormal;
    vec2 localFloor = lanternFloorAt(point.xz - faceNormal.xz * 0.01);
    if (u_lanternRoomMaskEnabled > 0.5 && localFloor.x > 0.0 && point.y <= localFloor.y + 0.05) return;
    if (point.y > localFloor.y + 1.95) mask = localFloor.x;
    if (u_lanternRoomMaskEnabled > 0.5 && u_lanternCutawayCamera.y > u_lanternFootY && point.y < u_lanternCutawayCamera.y - 0.001) {
      vec3 ray = point - u_lanternCutawayCamera;
      float floorY = u_lanternFootY;
      for (int iteration = 0; iteration < 3; iteration++) {
        float along = (floorY - u_lanternCutawayCamera.y) / ray.y;
        vec2 hit = u_lanternCutawayCamera.xz + ray.xz * along;
        vec2 projectedFloor = lanternFloorAt(hit);
        if (projectedFloor.x <= 0.0) break;
        float nextY = projectedFloor.y + 0.05;
        if (abs(nextY - floorY) < 0.01) {
          if (along > 1.001) mask = max(mask, projectedFloor.x);
          break;
        }
        floorY = nextY;
      }
    }
  }
  float targetDepth = dot(u_lanternCutawayTarget - u_lanternCutawayCamera, u_lanternCameraForward);
  float depth = dot(point - u_lanternCutawayCamera, u_lanternCameraForward);
  if (point.y > u_lanternFootY && targetDepth > 0.01 && depth > 0.05 && depth <= targetDepth + 0.65) {
    float scale = depth / targetDepth;
    vec3 offset = point - mix(u_lanternCutawayCamera, u_lanternCutawayTarget, scale);
    vec2 aperture = vec2(dot(offset, u_lanternCameraRight) / ${APERTURE_WIDTH}, dot(offset, u_lanternCameraUp) / ${APERTURE_HEIGHT}) / scale;
    mask = max(mask, 1.0 - smoothstep(${1 - APERTURE_EDGE}, 1.0, length(aperture)));
  }
  float coverage = 1.0 - mask * u_lanternReveal;
  if (coverage <= 0.001) discard;
  if (coverage >= 0.999) return;
  vec2 pixel = mod(floor(gl_FragCoord.xy), 4.0);
  vec2 low = mod(pixel, 2.0), high = floor(pixel * 0.5);
  float lowRank = low.y < 0.5 ? (low.x < 0.5 ? 0.0 : 2.0) : (low.x < 0.5 ? 3.0 : 1.0);
  float highRank = high.y < 0.5 ? (high.x < 0.5 ? 0.0 : 2.0) : (high.x < 0.5 ? 3.0 : 1.0);
  if ((4.0 * lowRank + highRank + 0.5) / 16.0 >= coverage) discard;
}
`;

export function patchCutawayMaterial(material, uniforms) {
  if (material.userData?.lanternVisibilityVersion === CUTAWAY_MATERIAL_VERSION) return true;
  if (material.isMaterial && !material.isShaderMaterial) return patchStandardMaterial(material, uniforms);
  const vertex = String(material.vertexShader || ""), fragment = String(material.fragmentShader || "");
  const relative = /(vec3\s+relativePos\s*=\s*[^;]+;)/u;
  if (!relative.test(vertex) || !vertex.includes("void main() {") || !fragment.includes("void main() {")) return false;
  material.vertexShader = vertex.replace("void main() {", "out vec3 v_lanternCutawayPosition;\nvoid main() {")
    .replace(relative, "$1\n  v_lanternCutawayPosition = relativePos;");
  material.fragmentShader = fragment.replace("void main() {", `${CUTAWAY_FRAGMENT.replace("texture2D(", "texture(")}\nvoid main() {\n  lanternApplyCutaway();`);
  material.uniforms = Object.assign(material.uniforms || {}, uniforms);
  material.userData ||= {};
  material.userData.lanternVisibilityVersion = CUTAWAY_MATERIAL_VERSION;
  material.needsUpdate = true;
  return true;
}

function patchStandardMaterial(material, uniforms) {
  const previous = material.onBeforeCompile;
  const programKey = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    shader.uniforms = Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `varying vec3 v_lanternCutawayPosition;\n${shader.vertexShader}`
      .replace("#include <project_vertex>", `#include <project_vertex>
        vec4 lanternPosition = vec4(transformed, 1.0);
        #ifdef USE_BATCHING
          lanternPosition = batchingMatrix * lanternPosition;
        #endif
        #ifdef USE_INSTANCING
          lanternPosition = instanceMatrix * lanternPosition;
        #endif
        v_lanternCutawayPosition = (modelMatrix * lanternPosition).xyz;`);
    shader.fragmentShader = shader.fragmentShader.replace("void main() {",
      `${CUTAWAY_FRAGMENT.replace("in vec3 v_lanternCutawayPosition;", "varying vec3 v_lanternCutawayPosition;")}\nvoid main() {\nlanternApplyCutaway();`);
  };
  material.customProgramCacheKey = () => `${programKey}:lantern-visibility-${CUTAWAY_MATERIAL_VERSION}`;
  material.userData.lanternVisibilityVersion = CUTAWAY_MATERIAL_VERSION;
  material.needsUpdate = true;
  return true;
}
