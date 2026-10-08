import { Vector3 } from "three";

export const ROOM_RADIUS = 6;
export const ROOM_EDGE = 0.75;
export const APERTURE_WIDTH = 1.3;
export const APERTURE_HEIGHT = 1.85;
export const APERTURE_EDGE = 0.22;
export const CEILING_SCAN_HEIGHT = 16;

export function hasRoomCeiling(avatar, cache) {
  const x = Math.floor(avatar.x), y = Math.floor(avatar.y), z = Math.floor(avatar.z);
  for (let height = 2; height <= CEILING_SCAN_HEIGHT; height += 1) {
    if (!cache.isSolidBlock(x, y + height, z)) continue;
    let surrounding = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (cache.isSolidBlock(x + dx, y + height, z + dz)) surrounding += 1;
    }
    if (surrounding >= 2) return true;
  }
  return false;
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
  return {
    u_lanternCutawayEnabled: { value: 0 },
    u_lanternReveal: { value: 0 },
    u_lanternCutawayY: { value: 0 },
    u_lanternFootY: { value: 0 },
    u_lanternCutawayCamera: { value: new Vector3() },
    u_lanternCutawayTarget: { value: new Vector3() },
    u_lanternCameraRight: { value: new Vector3(1, 0, 0) },
    u_lanternCameraUp: { value: new Vector3(0, 1, 0) },
    u_lanternCameraForward: { value: new Vector3(0, 0, -1) },
  };
}

const smoothstep = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

/** CPU reference for the terrain mask; coordinates may use any shared origin. */
export function cutawayMask(point, { camera, target, right, up, forward, footY, cutoffY, covered }) {
  let mask = covered && point.y > cutoffY
    ? 1 - smoothstep(ROOM_RADIUS - ROOM_EDGE, ROOM_RADIUS, Math.hypot(point.x - target.x, point.z - target.z))
    : 0;
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

// An aperture in camera space removes only pixels in front of the character.
// A world-XZ corridor removes unrelated high terrain in the same columns.
// Ordered coverage keeps opaque depth testing: chunk sorting cannot make walls
// flicker, and the fully open centre has no residual checkerboard over the body.
export const CUTAWAY_FRAGMENT = `
uniform float u_lanternCutawayEnabled;
uniform float u_lanternReveal;
uniform float u_lanternCutawayY;
uniform float u_lanternFootY;
uniform vec3 u_lanternCutawayCamera;
uniform vec3 u_lanternCutawayTarget;
uniform vec3 u_lanternCameraRight;
uniform vec3 u_lanternCameraUp;
uniform vec3 u_lanternCameraForward;
in vec3 v_lanternCutawayPosition;
void lanternApplyCutaway() {
  if (u_lanternCutawayEnabled < 0.5 || u_lanternReveal <= 0.0) return;
  vec3 point = v_lanternCutawayPosition;
  float mask = 0.0;
  if (u_lanternCutawayEnabled > 1.5 && point.y > u_lanternCutawayY) {
    mask = 1.0 - smoothstep(${ROOM_RADIUS - ROOM_EDGE}, ${ROOM_RADIUS.toFixed(1)}, distance(point.xz, u_lanternCutawayTarget.xz));
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
  if (material.userData?.lanternVisibilityVersion === 2) return true;
  const vertex = String(material.vertexShader || ""), fragment = String(material.fragmentShader || "");
  const relative = /(vec3\s+relativePos\s*=\s*[^;]+;)/u;
  if (!relative.test(vertex) || !vertex.includes("void main() {") || !fragment.includes("void main() {")) return false;
  material.vertexShader = vertex.replace("void main() {", "out vec3 v_lanternCutawayPosition;\nvoid main() {")
    .replace(relative, "$1\n  v_lanternCutawayPosition = relativePos;");
  material.fragmentShader = fragment.replace("void main() {", `${CUTAWAY_FRAGMENT}\nvoid main() {\n  lanternApplyCutaway();`);
  material.uniforms = Object.assign(material.uniforms || {}, uniforms);
  material.userData ||= {};
  material.userData.lanternVisibilityVersion = 2;
  material.needsUpdate = true;
  return true;
}
