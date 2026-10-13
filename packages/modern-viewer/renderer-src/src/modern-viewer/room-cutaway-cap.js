import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial } from 'three';
import { projectedRoomFloor } from './room-visibility.js';

// A voxel mesher emits exposed faces only. An observer inside rock therefore
// sees through the solid interior even when no fragment is discarded. Close
// the local cut with measured full cubes and their original resolved top UV.
// This is observer geometry only: it is never added to the agent's world data.
export function originalCubeTop(provider, block) {
  let parts;
  try { parts = provider?.getAllResolvedModels0_1({ name: block.name, properties: block.getProperties() }, false); }
  catch { return null; }
  if (parts?.length !== 1) return null;
  const model = parts[0]?.find(m => !m.x && !m.y && !m.z);
  if (model?.elements?.length !== 1) return null;
  const element = model.elements[0];
  if (element.rotation || element.from?.length !== 3 || element.to?.length !== 3
    || !element.from.every(v => v === 0) || !element.to.every(v => v === 16)) return null;
  const face = element.faces?.up, t = face?.texture;
  return !face?.rotation && t && [t.u, t.v, t.su, t.sv].every(Number.isFinite) ? t : null;
}

export function buildRoomCap({ cache, provider, center, camera, floorMask, radius = 32 }) {
  const positions = [], uvs = [], textures = new Map();
  const x0 = Math.floor(center.x), z0 = Math.floor(center.z), floor = Math.floor(center.y);
  let unavailable = 0;
  for (let z = z0 - radius; z <= z0 + radius; z++) for (let x = x0 - radius; x <= x0 + radius; x++) {
    const point = { x: x + .5, y: floor + 1.95, z: z + .5 };
    const localFloor = floorMask?.floorYAt(point) ?? floor;
    point.y = localFloor + 1.95;
    if (!cache.isOpaqueFullBlock(x, Math.floor(point.y), z)) continue;
    // Foreground wall caps descend to the protected floor so they do not
    // replace the obstruction removed by the view's connected-floor cut.
    if (projectedRoomFloor(point, camera, floor + .05, floorMask)) point.y = localFloor + .06;
    const block = cache.blockAt(x, Math.floor(point.y), z);
    if (!block || !cache.isOpaqueFullBlock(x, Math.floor(point.y), z)) continue;
    if (!textures.has(block.stateId)) textures.set(block.stateId, originalCubeTop(provider, block));
    const t = textures.get(block.stateId);
    if (!t) { unavailable++; continue; }
    const corners = [[x, z], [x, z + 1], [x + 1, z + 1], [x + 1, z]];
    const uv = [[t.u, t.v], [t.u, t.v + t.sv], [t.u + t.su, t.v + t.sv], [t.u + t.su, t.v]];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      positions.push(corners[i][0] - x0, point.y - floor, corners[i][1] - z0);
      uvs.push(...uv[i]);
    }
  }
  return { positions, uvs, origin: { x: x0, y: floor, z: z0 }, faces: positions.length / 18, unavailable };
}

export function createRoomCutawayCap(world, getCache) {
  const material = new MeshBasicMaterial({ map: world.material?.map, color: 0xcccccc });
  const mesh = new Mesh(new BufferGeometry(), material);
  mesh.name = 'observer-solid-cut-surface';
  mesh.userData.lanternCutawayCap = true;
  mesh.visible = false;
  world.scene.add(mesh);
  let signature = null, origin = null, lastCache = null, lastProvider = null, rebuilds = 0, faces = 0, unavailable = 0;
  function updateOrigin() {
    if (!origin) return;
    const o = world.sceneOrigin;
    mesh.position.set(o?.toSceneX?.(origin.x) ?? origin.x, o?.toSceneY?.(origin.y) ?? origin.y, o?.toSceneZ?.(origin.z) ?? origin.z);
  }
  return {
    update(region, active) {
      const cache = getCache(), resources = world.resourcesManager?.currentResources;
      mesh.visible = !!(active && region?.roomMask?.contains(region.center) && cache && resources?.worldBlockProvider);
      if (!mesh.visible) return;
      const { center, camera, roomMask } = region;
      const key = [Math.floor(center.x), Math.floor(center.y), Math.floor(center.z), Math.round(camera.x * 2), Math.round(camera.y * 2), Math.round(camera.z * 2), cache.revision].join(',');
      if (signature !== key || lastCache !== cache || lastProvider !== resources.worldBlockProvider) {
        const data = buildRoomCap({ cache, provider: resources.worldBlockProvider, center, camera, floorMask: roomMask });
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(data.positions, 3));
        geometry.setAttribute('uv', new Float32BufferAttribute(data.uvs, 2));
        geometry.computeBoundingSphere();
        mesh.geometry.dispose(); mesh.geometry = geometry;
        origin = data.origin; faces = data.faces; unavailable = data.unavailable; rebuilds++;
        signature = key;
        lastCache = cache; lastProvider = resources.worldBlockProvider;
      }
      if (material.map !== world.material?.map) { material.map = world.material?.map; material.needsUpdate = true; }
      updateOrigin();
    },
    updateOrigin,
    hide() { mesh.visible = false; },
    dispose() { mesh.removeFromParent(); mesh.geometry.dispose(); material.dispose(); },
    get diagnostics() { return { visible: mesh.visible, faces, rebuilds, unavailable }; },
  };
}
