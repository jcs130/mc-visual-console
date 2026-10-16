import { DataTexture, NearestFilter, RGFormat, Vector3 } from "three";

export const ROOM_RADIUS = 6;
export const MAX_ROOM_RADIUS = 96;
export const ROOM_EDGE = 0.75;
export const APERTURE_WIDTH = 1.3;
export const APERTURE_HEIGHT = 1.85;
export const APERTURE_EDGE = 0.22;
export const CEILING_SCAN_HEIGHT = 64;
export const CUTAWAY_MATERIAL_VERSION = 8;
export const OBSTRUCTION_OPACITY = 0.35;

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
  return covered ? "cutaway" : "foreground-cutaway";
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
    // 0 disabled, 2 covered room, 3 local foreground. No screen-space peephole.
    u_lanternCutawayEnabled: { value: 0 },
    u_lanternReveal: { value: 0 },
    u_lanternTransparencyPass: { value: 0 },
    u_lanternObstructionOpacity: { value: OBSTRUCTION_OPACITY },
    u_lanternCutawayY: { value: 0 },
    u_lanternFootY: { value: 0 },
    u_lanternRoomRadius: { value: ROOM_RADIUS },
    u_lanternRoomMaskEnabled: { value: 0 },
    u_lanternBodyCorridor: { value: 0 },
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

// A stepped exterior floor may not extend to the projection of a foreground
// wall. Open a bounded, floor-safe sight corridor in that case; do not rely on
// a tiny screen-space circle or cut anything behind the observed actor.
function foregroundCorridor(point, camera, target, floorMask) {
  if (!floorMask?.contains(target)) return 0;
  const dx = target.x - camera.x, dz = target.z - camera.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq < 0.01) return 0;
  const px = point.x - camera.x, pz = point.z - camera.z;
  const along = (px * dx + pz * dz) / lengthSq;
  if (along < 0 || along > 0.95) return 0;
  return 1 - smoothstep(1.35, 1.65, Math.abs(px * dz - pz * dx) / Math.sqrt(lengthSq));
}

// Swimming, climbing and partial support blocks can have a measured body
// position without a two-block-clear floor seed. The bounded 3D sightline
// still removes actual foreground occluders, without inventing a floor.
function bodySightCorridor(point, camera, target) {
  const direction = sub(target, camera), offset = sub(point, camera);
  const lengthSq = dot(direction, direction);
  if (lengthSq < .01) return 0;
  const along = dot(offset, direction) / lengthSq;
  if (along < 0 || along > 1) return 0;
  const lateral = Math.hypot(offset.x - direction.x * along,
    offset.y - direction.y * along, offset.z - direction.z * along);
  return 1 - smoothstep(1.35, 1.65, lateral);
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
export function cutawayMask(point, { camera, target, right, up, forward, footY, cutoffY, covered, roomRadius = ROOM_RADIUS, floorMask = null, bodyCorridor = false }) {
  // Preserve the feet and lower terrain. Floor-wide removal requires a
  // connected floor; a measured body's sight corridor does not.
  if (point.y <= footY) return 0;
  if (bodyCorridor && !floorMask?.contains(target)) return bodySightCorridor(point, camera, target);
  if (!floorMask) return 0;
  const localFloorY = floorMask?.floorYAt?.(point);
  if (localFloorY != null && point.y <= localFloorY + 0.05) return 0;
  const corridor = foregroundCorridor(point, camera, target, floorMask);
  if (corridor <= 0 && floorMask.isOpen?.(point) && point.y <= localFloorY + 1.95) return 0;
  let mask = Math.max(corridor, covered && point.y > (localFloorY == null ? cutoffY : localFloorY + 1.95)
    ? floorCoverage(point, target, roomRadius, floorMask) : 0);
  const floor = projectedRoomFloor(point, camera, footY, floorMask);
  if (floor) mask = Math.max(mask, floorCoverage(floor, target, roomRadius, floorMask));
  return mask;
}

// Connected floor columns remove roofs; their camera rays remove foreground
// cave walls as well. The floor and unrelated terrain behind it remain opaque.
// Ordered coverage keeps opaque depth testing: chunk sorting cannot make walls
// flicker, and the fully open centre has no residual checkerboard over the body.
export const CUTAWAY_FRAGMENT = `
uniform float u_lanternCutawayEnabled;
uniform float u_lanternReveal;
uniform float u_lanternTransparencyPass;
uniform float u_lanternObstructionOpacity;
uniform float u_lanternCutawayY;
uniform float u_lanternFootY;
uniform float u_lanternRoomRadius;
uniform float u_lanternRoomMaskEnabled;
uniform float u_lanternBodyCorridor;
uniform sampler2D u_lanternRoomMask;
uniform vec3 u_lanternRoomMaskOrigin;
uniform float u_lanternRoomMaskSize;
uniform vec3 u_lanternCutawayCamera;
uniform vec3 u_lanternCutawayTarget;
uniform vec3 u_lanternCameraRight;
uniform vec3 u_lanternCameraUp;
uniform vec3 u_lanternCameraForward;
in vec3 v_lanternCutawayPosition;
vec3 lanternFloorAt(vec2 xz) {
  float coverage = 1.0 - smoothstep(u_lanternRoomRadius - ${ROOM_EDGE}, u_lanternRoomRadius, distance(xz, u_lanternCutawayTarget.xz));
  if (u_lanternRoomMaskEnabled < 0.5) return vec3(coverage, u_lanternCutawayY - 1.95, 0.0);
  vec2 cell = floor(xz - u_lanternRoomMaskOrigin.xz);
  if (any(lessThan(cell, vec2(0.0))) || any(greaterThanEqual(cell, vec2(u_lanternRoomMaskSize)))) return vec3(0.0);
  vec2 floorState = texture2D(u_lanternRoomMask, (cell + 0.5) / u_lanternRoomMaskSize).rg;
  return vec3(coverage * step(0.25, floorState.r), u_lanternRoomMaskOrigin.y + floor(floorState.g * 255.0 + 0.5) - 128.0, step(0.75, floorState.r));
}
float lanternCutawayMask() {
  if (u_lanternCutawayEnabled < 0.5 || u_lanternReveal <= 0.0) return 0.0;
  vec3 point = v_lanternCutawayPosition;
  if (point.y <= u_lanternFootY) return 0.0;
  if (u_lanternBodyCorridor > 0.5 && (u_lanternRoomMaskEnabled < 0.5 || lanternFloorAt(u_lanternCutawayTarget.xz).x <= 0.0)) {
    vec3 direction = u_lanternCutawayTarget - u_lanternCutawayCamera;
    vec3 offset = point - u_lanternCutawayCamera;
    float lengthSq = dot(direction, direction);
    if (lengthSq < 0.01) return 0.0;
    float along = dot(offset, direction) / lengthSq;
    if (along < 0.0 || along > 1.0) return 0.0;
    float lateral = length(offset - direction * along);
    return (1.0 - smoothstep(1.35, 1.65, lateral)) * u_lanternReveal;
  }
  if (u_lanternRoomMaskEnabled < 0.5) return 0.0;
  float mask = 0.0;
  if (u_lanternCutawayEnabled > 1.5) {
    vec3 faceNormal = normalize(cross(dFdx(point), dFdy(point)));
    if (!gl_FrontFacing) faceNormal = -faceNormal;
    vec3 localFloor = lanternFloorAt(point.xz - faceNormal.xz * 0.01);
    if (u_lanternRoomMaskEnabled > 0.5 && localFloor.x > 0.0 && point.y <= localFloor.y + 0.05) return 0.0;
    vec2 direction = u_lanternCutawayTarget.xz - u_lanternCutawayCamera.xz;
    vec2 offset = point.xz - u_lanternCutawayCamera.xz;
    float lengthSq = dot(direction, direction);
    if (lengthSq > 0.01 && lanternFloorAt(u_lanternCutawayTarget.xz).x > 0.0) {
      float along = dot(offset, direction) / lengthSq;
      if (along >= 0.0 && along <= 0.95) {
        float lateral = abs(offset.x * direction.y - offset.y * direction.x) / sqrt(lengthSq);
        mask = 1.0 - smoothstep(1.35, 1.65, lateral);
      }
    }
    // Keep furniture and surface details inside the open room. Only a wall
    // boundary or geometry above that room can occlude its floor.
    if (mask <= 0.0 && localFloor.x > 0.0 && localFloor.z > 0.5 && point.y <= localFloor.y + 1.95) return 0.0;
    if (u_lanternCutawayEnabled < 2.5 && point.y > localFloor.y + 1.95) mask = max(mask, localFloor.x);
    if (u_lanternRoomMaskEnabled > 0.5 && u_lanternCutawayCamera.y > u_lanternFootY && point.y < u_lanternCutawayCamera.y - 0.001) {
      vec3 ray = point - u_lanternCutawayCamera;
      float floorY = u_lanternFootY;
      for (int iteration = 0; iteration < 3; iteration++) {
        float along = (floorY - u_lanternCutawayCamera.y) / ray.y;
        vec2 hit = u_lanternCutawayCamera.xz + ray.xz * along;
        vec3 projectedFloor = lanternFloorAt(hit);
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
  return clamp(mask * u_lanternReveal, 0.0, 1.0);
}
float lanternSurfaceOpacity = 1.0;
void lanternApplyCutaway() {
  float mask = lanternCutawayMask();
  if (u_lanternTransparencyPass < 0.5) {
    if (mask > 0.001) discard;
  } else {
    if (mask <= 0.001) discard;
    lanternSurfaceOpacity = mix(1.0, u_lanternObstructionOpacity, mask);
  }
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
  const output = /out\s+vec4\s+(\w+)\s*;/.exec(fragment)?.[1] ?? 'gl_FragColor';
  material.fragmentShader = material.fragmentShader.replace(/}\s*$/, `${output}.a *= lanternSurfaceOpacity;\n}`);
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
    if (this.userData?.lanternTransparencyPass) shader.uniforms.u_lanternTransparencyPass = { value: 1 };
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
    shader.fragmentShader = shader.fragmentShader.replace(/}\s*$/, 'gl_FragColor.a *= lanternSurfaceOpacity;\n}');
  };
  material.customProgramCacheKey = () => `${programKey}:lantern-visibility-${CUTAWAY_MATERIAL_VERSION}`;
  material.userData.lanternVisibilityVersion = CUTAWAY_MATERIAL_VERSION;
  material.needsUpdate = true;
  return true;
}
