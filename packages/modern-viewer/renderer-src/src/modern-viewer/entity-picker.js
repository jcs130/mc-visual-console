const INVISIBLE_ENTITY_FLAG = 0x20;
const MINIMUM_WORLD_SCALE = Number.EPSILON;
const MAXIMUM_PARENT_DEPTH = 512;

/**
 * Pick the nearest render-visible entity under an NDC pointer or from an
 * already-computed intersection list.
 *
 * The function deliberately builds its Object3D-to-entity lookup per call. It
 * never returns (or stores) a Three.js object, so a renderer rebuild cannot
 * leave selection state holding a stale scene node.
 *
 * @param {{
 *   candidates: Array<{ id: string | number, entity: object, root: object }>,
 *   intersections?: Array<{ object: object, distance: number }>,
 *   raycaster?: { setFromCamera: Function, intersectObjects: Function },
 *   camera?: object,
 *   ndc?: { x: number, y: number },
 *   scene?: object,
 * }} options
 * @returns {{ id: string | number, entity: object, distance: number } | null}
 */
export function pickEntity(options) {
  if (!options || typeof options !== "object") throw new TypeError("Entity picker options are required");

  const activeScene = isObject(options.scene) ? options.scene : inferCameraScene(options.camera);
  const candidates = prepareCandidates(options.candidates, activeScene);
  if (candidates.length === 0) return null;

  updateCandidateMatrices(candidates);
  const intersections = Array.isArray(options.intersections)
    ? options.intersections
    : intersectCandidates(options, candidates);

  return pickEntityFromPreparedIntersections(intersections, candidates);
}

/**
 * Convenience wrapper for callers that already performed a raycast.
 *
 * @param {Array<{ object: object, distance: number }>} intersections
 * @param {Array<{ id: string | number, entity: object, root: object }>} candidates
 * @param {{ scene?: object }} [options]
 * @returns {{ id: string | number, entity: object, distance: number } | null}
 */
export function pickEntityFromIntersections(intersections, candidates, options = {}) {
  return pickEntity({ intersections, candidates, scene: options.scene });
}

function intersectCandidates(options, candidates) {
  const { raycaster, camera, ndc } = options;
  if (!raycaster || typeof raycaster.setFromCamera !== "function" || typeof raycaster.intersectObjects !== "function") {
    throw new TypeError("A raycaster is required when intersections are not supplied");
  }
  if (!camera || typeof camera !== "object") throw new TypeError("A camera is required when intersections are not supplied");
  if (!ndc || !Number.isFinite(ndc.x) || !Number.isFinite(ndc.y)) {
    throw new TypeError("Finite NDC coordinates are required when intersections are not supplied");
  }

  camera.parent?.updateMatrixWorld?.(true);
  camera.updateMatrixWorld?.(true);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObjects(candidates.map((candidate) => candidate.root), true);
}

function pickEntityFromPreparedIntersections(intersections, candidates) {
  if (!Array.isArray(intersections) || intersections.length === 0) return null;

  const candidateByRoot = new Map(candidates.map((candidate) => [candidate.root, candidate]));
  const ordered = intersections
    .filter((intersection) => intersection && Number.isFinite(intersection.distance) && intersection.distance >= 0)
    .map((intersection, order) => ({ intersection, order }))
    .sort((left, right) => left.intersection.distance - right.intersection.distance || left.order - right.order);

  for (const { intersection } of ordered) {
    const match = candidateForHit(intersection.object, candidateByRoot);
    if (!match) continue;
    if (!hasVisibleAncestorChain(intersection.object)) continue;
    if (!hasAnyVisibleMaterial(intersection.object)) continue;
    if (!hasNonZeroWorldScale(intersection.object)) continue;

    return {
      id: match.id,
      entity: match.entity,
      distance: intersection.distance,
    };
  }

  return null;
}

function prepareCandidates(rawCandidates, activeScene) {
  if (!Array.isArray(rawCandidates)) return [];

  const candidates = [];
  const seenRoots = new Set();
  for (const candidate of rawCandidates) {
    if (!isCurrentCandidate(candidate, activeScene)) continue;
    if (seenRoots.has(candidate.root)) continue;
    seenRoots.add(candidate.root);
    candidates.push(candidate);
  }
  return candidates;
}

function isCurrentCandidate(candidate, activeScene) {
  if (!isObject(candidate) || candidate.id === undefined || candidate.id === null) return false;
  if (!isObject(candidate.entity) || !isObject(candidate.root)) return false;
  if (isDeleted(candidate) || isDeleted(candidate.entity) || isDeleted(candidate.root.originalEntity)) return false;
  if (isProtocolInvisible(candidate.entity)) return false;

  const id = String(candidate.id);
  if (candidate.entity.id !== undefined && candidate.entity.id !== null && String(candidate.entity.id) !== id) return false;
  const renderedId = candidate.root.originalEntity?.id;
  if (renderedId !== undefined && renderedId !== null && String(renderedId) !== id) return false;

  return isRootAttached(candidate.root, activeScene);
}

function isDeleted(value) {
  return Boolean(value && typeof value === "object" && (
    value.delete === true
    || value.deleted === true
    || value.removed === true
    || value.userData?.__lanternDeleted === true
  ));
}

function isProtocolInvisible(entity) {
  if (entity.invisible === true || entity.isInvisible === true) return true;
  const metadata = entity.metadata;
  let sharedFlags;
  if (Array.isArray(metadata)) {
    sharedFlags = metadata[0];
    if (sharedFlags === undefined) {
      const indexedEntry = metadata.find((entry) => entry?.key === 0 || entry?.index === 0);
      sharedFlags = indexedEntry?.value;
    }
  } else if (metadata && typeof metadata === "object") {
    sharedFlags = metadata[0] ?? metadata["0"];
  }
  for (let depth = 0; depth < 4 && sharedFlags && typeof sharedFlags === "object" && "value" in sharedFlags; depth += 1) {
    sharedFlags = sharedFlags.value;
  }
  const flags = Number(sharedFlags);
  return Number.isFinite(flags) && (flags & INVISIBLE_ENTITY_FLAG) !== 0;
}

function isRootAttached(root, activeScene) {
  let current = root;
  let depth = 0;
  while (current?.parent) {
    const parent = current.parent;
    if (!Array.isArray(parent.children) || !parent.children.includes(current)) return false;
    current = parent;
    depth += 1;
    if (depth > MAXIMUM_PARENT_DEPTH) return false;
  }

  if (activeScene) return current === activeScene;
  return current?.isScene === true && current !== root;
}

function candidateForHit(object, candidateByRoot) {
  let current = object;
  let depth = 0;
  while (current && depth <= MAXIMUM_PARENT_DEPTH) {
    const candidate = candidateByRoot.get(current);
    if (candidate) return candidate;
    current = current.parent;
    depth += 1;
  }
  return null;
}

function hasVisibleAncestorChain(object) {
  let current = object;
  let depth = 0;
  while (current && depth <= MAXIMUM_PARENT_DEPTH) {
    if (current.visible === false) return false;
    current = current.parent;
    depth += 1;
  }
  return depth <= MAXIMUM_PARENT_DEPTH;
}

function hasAnyVisibleMaterial(object) {
  const material = object?.material;
  if (material === undefined || material === null) return true;
  const materials = Array.isArray(material) ? material.filter(Boolean) : [material];
  return materials.length > 0 && materials.some((entry) => entry.visible !== false);
}

function hasNonZeroWorldScale(object) {
  let current = object;
  let depth = 0;
  while (current && depth <= MAXIMUM_PARENT_DEPTH) {
    const scale = current.scale;
    if (scale && ![scale.x, scale.y, scale.z].every(isNonZeroFiniteScale)) return false;
    current = current.parent;
    depth += 1;
  }
  if (depth > MAXIMUM_PARENT_DEPTH) return false;

  // Three.js Matrix4.decompose() leaves a default (1,1,1) result for some
  // singular matrices, so getWorldScale() alone cannot reliably identify a
  // zero axis. The determinant and basis lengths detect that degenerate world
  // transform without retaining a scratch Three.js vector.
  const matrix = object?.matrixWorld;
  const elements = matrix?.elements;
  if (!elements || typeof elements.length !== "number" || elements.length < 16 || typeof matrix.determinant !== "function") return false;
  const basisLengths = [
    Math.hypot(elements[0], elements[1], elements[2]),
    Math.hypot(elements[4], elements[5], elements[6]),
    Math.hypot(elements[8], elements[9], elements[10]),
  ];
  const determinant = matrix.determinant();
  return basisLengths.every(isNonZeroFiniteScale)
    && Number.isFinite(determinant)
    && Math.abs(determinant) > MINIMUM_WORLD_SCALE;
}

function isNonZeroFiniteScale(value) {
  return Number.isFinite(value) && Math.abs(value) > MINIMUM_WORLD_SCALE;
}

function updateCandidateMatrices(candidates) {
  const updatedTops = new Set();
  for (const candidate of candidates) {
    let top = candidate.root;
    let depth = 0;
    while (top.parent && depth <= MAXIMUM_PARENT_DEPTH) {
      top = top.parent;
      depth += 1;
    }
    if (updatedTops.has(top)) continue;
    updatedTops.add(top);
    top.updateMatrixWorld?.(true);
  }
}

function inferCameraScene(camera) {
  let current = camera;
  let depth = 0;
  while (current?.parent && depth <= MAXIMUM_PARENT_DEPTH) {
    current = current.parent;
    depth += 1;
  }
  return current?.isScene === true ? current : null;
}

function isObject(value) {
  return Boolean(value && typeof value === "object");
}
