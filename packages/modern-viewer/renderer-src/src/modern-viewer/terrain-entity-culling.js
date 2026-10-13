import { Box3, Vector3 } from "three";

// Prove that the *whole* rendered box projects into an opaque horizontal
// layer. A few blocked rays are insufficient (windows/slits may lie between).
// Only test below the observed floor, where the cutaway never removes terrain.
export function hiddenBelowOpaqueFloor(box, camera, floorY, cache) {
  if (!cache?.isOpaqueFullBlock || !Number.isFinite(floorY)
    || !Number.isFinite(box.max.y) || box.max.y >= floorY - 3 || camera.y <= floorY) return false;
  const ceiling = Math.floor(Math.min(floorY - 1, camera.y - 1));
  const bottom = Math.ceil(box.max.y + 0.1);
  const planes = new Set([ceiling, Math.floor((ceiling + bottom) / 2), bottom]);
  for (const y of planes) {
    if (y < bottom) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const by of [box.min.y, box.max.y]) {
      const t = (y + 0.5 - camera.y) / (by - camera.y);
      if (!(t > 0 && t < 1)) { minX = Infinity; break; }
      for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) {
        const px = camera.x + (x - camera.x) * t, pz = camera.z + (z - camera.z) * t;
        minX = Math.min(minX, px); maxX = Math.max(maxX, px);
        minZ = Math.min(minZ, pz); maxZ = Math.max(maxZ, pz);
      }
    }
    if (!Number.isFinite(minX)) continue;
    const x0 = Math.floor(minX - 0.02), x1 = Math.floor(maxX + 0.02);
    const z0 = Math.floor(minZ - 0.02), z1 = Math.floor(maxZ + 0.02);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 64) continue;
    let opaque = true;
    for (let x = x0; x <= x1 && opaque; x++) for (let z = z0; z <= z1; z++) {
      if (!cache.isOpaqueFullBlock(x, y, z)) { opaque = false; break; }
    }
    if (opaque) return true;
  }
  return false;
}

export function createTerrainEntityCulling(world, getCache, getFloorY) {
  const box = new Box3(), camera = new Vector3(), position = new Vector3();
  const records = new WeakMap();
  const diagnostics = { hidden: 0, tested: 0, durationMs: 0 };
  return {
    diagnostics,
    update(selfId) {
      const cache = getCache?.(), floorY = getFloorY?.(), now = performance.now();
      diagnostics.hidden = 0; diagnostics.tested = 0;
      if (!cache?.isOpaqueFullBlock || !Number.isFinite(floorY) || !world.camera) return;
      world.camera.getWorldPosition(camera);
      const origin = world.sceneOrigin;
      camera.set(origin?.toWorldX?.(camera.x) ?? camera.x, origin?.toWorldY?.(camera.y) ?? camera.y,
        origin?.toWorldZ?.(camera.z) ?? camera.z);
      for (const [id, object] of Object.entries(world.entities?.entities ?? {})) {
        if (id === selfId || !object.visible) continue;
        object.getWorldPosition(position);
        const y = origin?.toWorldY?.(position.y) ?? position.y;
        if (y >= floorY - 6) continue;
        let row = records.get(object);
        // Exact pose/camera changes invalidate the old result. Never leave an
        // entity hidden while a camera turn, movement or block update exposes it.
        const signature = `${position.x},${position.y},${position.z},${object.rotation.x},${object.rotation.y},${object.rotation.z},${camera.x},${camera.y},${camera.z},${floorY},${cache.revision}`;
        if (!row || row.signature !== signature || now - row.at > 100) {
          box.setFromObject(object).expandByScalar(0.5);
          box.min.set(origin?.toWorldX?.(box.min.x) ?? box.min.x, origin?.toWorldY?.(box.min.y) ?? box.min.y, origin?.toWorldZ?.(box.min.z) ?? box.min.z);
          box.max.set(origin?.toWorldX?.(box.max.x) ?? box.max.x, origin?.toWorldY?.(box.max.y) ?? box.max.y, origin?.toWorldZ?.(box.max.z) ?? box.max.z);
          row = { signature, at: now, hidden: hiddenBelowOpaqueFloor(box, camera, floorY, cache) };
          records.set(object, row); diagnostics.tested++;
        }
        if (row.hidden) { object.visible = false; diagnostics.hidden++; }
      }
      diagnostics.durationMs = Math.round((performance.now() - now) * 100) / 100;
    },
  };
}
