const TAU = Math.PI * 2;

function finitePoint(value) {
  return value
    && Number.isFinite(Number(value.x))
    && Number.isFinite(Number(value.y))
    && Number.isFinite(Number(value.z));
}

function normalizeRadians(value) {
  if (!Number.isFinite(value)) return 0;
  let normalized = value % TAU;
  if (normalized > Math.PI) normalized -= TAU;
  if (normalized < -Math.PI) normalized += TAU;
  return Object.is(normalized, -0) ? 0 : normalized;
}

/**
 * Intersects a camera ray with the horizontal plane through the avatar and
 * converts that point to Mineflayer's yaw convention (0 = north / -Z).
 * The returned pitch is deliberately level: an isometric camera's downward
 * pitch is an observer property and must never make the controlled avatar bow.
 */
export function projectHorizontalPointerLook({
  origin,
  direction,
  planeY,
  avatar,
  minimumDistance = 0.15,
  maximumRayDistance = 256,
  output = null,
}) {
  if (!finitePoint(origin) || !finitePoint(direction) || !finitePoint(avatar) || !Number.isFinite(Number(planeY))) return null;
  const dy = Number(direction.y);
  if (Math.abs(dy) < 1e-5) return null;
  const rayDistance = (Number(planeY) - Number(origin.y)) / dy;
  if (!Number.isFinite(rayDistance) || rayDistance <= 0 || rayDistance > maximumRayDistance) return null;

  const targetX = Number(origin.x) + Number(direction.x) * rayDistance;
  const targetZ = Number(origin.z) + Number(direction.z) * rayDistance;
  const dx = targetX - Number(avatar.x);
  const dz = targetZ - Number(avatar.z);
  const horizontalDistance = Math.hypot(dx, dz);
  if (!Number.isFinite(horizontalDistance) || horizontalDistance < minimumDistance) return null;

  const yaw = normalizeRadians(Math.atan2(-dx, -dz));
  if (output && typeof output === "object") {
    output.target ||= { x: 0, y: 0, z: 0 };
    output.yaw = yaw;
    output.pitch = 0;
    output.distance = horizontalDistance;
    output.rayDistance = rayDistance;
    output.target.x = targetX;
    output.target.y = Number(planeY);
    output.target.z = targetZ;
    return output;
  }
  return Object.freeze({
    yaw,
    pitch: 0,
    distance: horizontalDistance,
    rayDistance,
    target: Object.freeze({ x: targetX, y: Number(planeY), z: targetZ }),
  });
}

/**
 * Cheap voxel traversal for camera-to-avatar obstruction checks. It samples
 * unique block cells only, so a 16-block dungeon camera normally performs a
 * few dozen cache lookups instead of a recursive scene raycast.
 */
export function traceSolidSegment({
  start,
  end,
  isSolid,
  startPadding = 0.55,
  endPadding = 1.15,
  maximumSamples = 96,
}) {
  if (!finitePoint(start) || !finitePoint(end) || typeof isSolid !== "function") {
    return Object.freeze({ occluded: false, hit: null, samples: 0, reason: "invalid-input" });
  }
  const dx = Number(end.x) - Number(start.x);
  const dy = Number(end.y) - Number(start.y);
  const dz = Number(end.z) - Number(start.z);
  const distance = Math.hypot(dx, dy, dz);
  const usableDistance = distance - Math.max(0, startPadding) - Math.max(0, endPadding);
  if (!Number.isFinite(distance) || distance <= 0 || usableDistance <= 0) {
    return Object.freeze({ occluded: false, hit: null, samples: 0, reason: "short-segment" });
  }

  const sampleLimit = Math.max(1, Math.floor(maximumSamples));
  const invDistance = 1 / distance;
  const paddedStart = {
    x: Number(start.x) + dx * invDistance * Math.max(0, startPadding),
    y: Number(start.y) + dy * invDistance * Math.max(0, startPadding),
    z: Number(start.z) + dz * invDistance * Math.max(0, startPadding),
  };
  const paddedEnd = {
    x: Number(end.x) - dx * invDistance * Math.max(0, endPadding),
    y: Number(end.y) - dy * invDistance * Math.max(0, endPadding),
    z: Number(end.z) - dz * invDistance * Math.max(0, endPadding),
  };
  const segment = {
    x: paddedEnd.x - paddedStart.x,
    y: paddedEnd.y - paddedStart.y,
    z: paddedEnd.z - paddedStart.z,
  };
  let blockX = Math.floor(paddedStart.x);
  let blockY = Math.floor(paddedStart.y);
  let blockZ = Math.floor(paddedStart.z);
  const endBlockX = Math.floor(paddedEnd.x);
  const endBlockY = Math.floor(paddedEnd.y);
  const endBlockZ = Math.floor(paddedEnd.z);
  const stepX = Math.sign(segment.x);
  const stepY = Math.sign(segment.y);
  const stepZ = Math.sign(segment.z);
  const deltaX = stepX === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / segment.x);
  const deltaY = stepY === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / segment.y);
  const deltaZ = stepZ === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / segment.z);
  const firstBoundary = (coordinate, block, direction, component) => {
    if (direction === 0) return Number.POSITIVE_INFINITY;
    const boundary = direction > 0 ? block + 1 : block;
    return (boundary - coordinate) / component;
  };
  let maxX = firstBoundary(paddedStart.x, blockX, stepX, segment.x);
  let maxY = firstBoundary(paddedStart.y, blockY, stepY, segment.y);
  let maxZ = firstBoundary(paddedStart.z, blockZ, stepZ, segment.z);
  const visited = new Set();
  let samples = 0;

  const visit = (x, y, z, progress) => {
    const key = `${x},${y},${z}`;
    if (visited.has(key) || samples >= sampleLimit) return null;
    visited.add(key);
    samples += 1;
    if (!isSolid(x, y, z)) return null;
    return Object.freeze({
      occluded: true,
      samples,
      reason: "solid-voxel",
      hit: Object.freeze({
        x,
        y,
        z,
        distance: Math.max(0, startPadding) + Math.max(0, Math.min(1, progress)) * usableDistance,
      }),
    });
  };

  let hit = visit(blockX, blockY, blockZ, 0);
  if (hit) return hit;
  const epsilon = 1e-10;
  while (
    samples < sampleLimit
    && (blockX !== endBlockX || blockY !== endBlockY || blockZ !== endBlockZ)
  ) {
    const next = Math.min(maxX, maxY, maxZ);
    if (!Number.isFinite(next) || next > 1 + epsilon) break;
    const axes = [];
    if (Math.abs(maxX - next) <= epsilon) axes.push([stepX, 0, 0]);
    if (Math.abs(maxY - next) <= epsilon) axes.push([0, stepY, 0]);
    if (Math.abs(maxZ - next) <= epsilon) axes.push([0, 0, stepZ]);

    // Visit every cell touched at an edge/corner crossing. A simple fixed-step
    // sampler can jump over these cells when the isometric ray is diagonal.
    let offsets = [[0, 0, 0]];
    for (const axis of axes) {
      offsets = offsets.concat(offsets.map((offset) => [
        offset[0] + axis[0],
        offset[1] + axis[1],
        offset[2] + axis[2],
      ]));
    }
    for (const offset of offsets.slice(1)) {
      hit = visit(blockX + offset[0], blockY + offset[1], blockZ + offset[2], next);
      if (hit) return hit;
      if (samples >= sampleLimit) break;
    }

    if (Math.abs(maxX - next) <= epsilon) {
      blockX += stepX;
      maxX += deltaX;
    }
    if (Math.abs(maxY - next) <= epsilon) {
      blockY += stepY;
      maxY += deltaY;
    }
    if (Math.abs(maxZ - next) <= epsilon) {
      blockZ += stepZ;
      maxZ += deltaZ;
    }
  }

  return Object.freeze({
    occluded: false,
    hit: null,
    samples,
    reason: samples >= sampleLimit ? "sample-limit" : "clear",
  });
}

/**
 * Checks the visible volume of a Minecraft-sized character instead of a
 * single centre ray. The three centre rays cover legs/body/head and the two
 * shoulder rays catch thin walls or leaves crossing only one side.
 */
export function traceVisibilityCorridor({
  start,
  target,
  isSolid,
  shoulderOffset = 0.46,
  startPadding = 0.5,
  endPadding = 0.5,
  maximumSamples = 320,
}) {
  if (!finitePoint(start) || !finitePoint(target) || typeof isSolid !== "function") {
    return Object.freeze({ occluded: false, hit: null, samples: 0, reason: "invalid-input", ray: null });
  }
  const dx = Number(target.x) - Number(start.x);
  const dz = Number(target.z) - Number(start.z);
  const horizontalDistance = Math.hypot(dx, dz);
  const perpendicular = horizontalDistance > 1e-5
    ? { x: -dz / horizontalDistance, z: dx / horizontalDistance }
    : { x: 1, z: 0 };
  const rays = [
    { name: "feet", height: 0.35, lateral: 0 },
    { name: "body", height: 1.05, lateral: 0 },
    { name: "head", height: 1.65, lateral: 0 },
    { name: "left-shoulder", height: 1.2, lateral: -Math.abs(shoulderOffset) },
    { name: "right-shoulder", height: 1.2, lateral: Math.abs(shoulderOffset) },
  ];
  let samples = 0;
  for (const ray of rays) {
    const remaining = Math.max(1, Math.floor(maximumSamples) - samples);
    const end = {
      x: Number(target.x) + perpendicular.x * ray.lateral,
      y: Number(target.y) + ray.height,
      z: Number(target.z) + perpendicular.z * ray.lateral,
    };
    const trace = traceSolidSegment({
      start,
      end,
      isSolid,
      startPadding,
      endPadding,
      maximumSamples: remaining,
    });
    samples += trace.samples;
    if (trace.occluded) {
      return Object.freeze({
        ...trace,
        samples,
        ray: Object.freeze({ ...ray, end: Object.freeze(end) }),
      });
    }
    if (samples >= maximumSamples) break;
  }
  return Object.freeze({
    occluded: false,
    hit: null,
    samples,
    reason: samples >= maximumSamples ? "sample-limit" : "clear",
    ray: null,
  });
}

/** Immediate activation plus delayed release prevents roof cutaway flicker. */
export function updateOcclusionHysteresis(previous, occluded, releaseSamples = 3) {
  const state = previous && typeof previous === "object" ? previous : {};
  if (occluded) return Object.freeze({ active: true, clearSamples: 0 });
  if (state.active !== true) return Object.freeze({ active: false, clearSamples: 0 });
  const clearSamples = Math.max(0, Number(state.clearSamples) || 0) + 1;
  return Object.freeze({
    active: clearSamples < Math.max(1, Math.floor(releaseSamples)),
    clearSamples: clearSamples < Math.max(1, Math.floor(releaseSamples)) ? clearSamples : 0,
  });
}
