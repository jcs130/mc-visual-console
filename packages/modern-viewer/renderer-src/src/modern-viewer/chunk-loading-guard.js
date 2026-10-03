export function pendingChunkOrigins(center, distance, finishedChunks) {
  if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.z)) return [];
  const cx = Math.floor(center.x / 16);
  const cz = Math.floor(center.z / 16);
  const result = [];
  for (let dx = -distance; dx <= distance; dx++) {
    for (let dz = -distance; dz <= distance; dz++) {
      const x = (cx + dx) * 16;
      const z = (cz + dz) * 16;
      if (!finishedChunks?.[`${x},${z}`]) result.push({ x, z });
    }
  }
  return result;
}
