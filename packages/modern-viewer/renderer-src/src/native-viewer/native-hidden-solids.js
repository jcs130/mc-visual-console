// Lossless, received hidden solids are collision/room data, not render meshes
// or invented air. Runs carry exact native state IDs across material changes.
export function createHiddenSolidLookup(snapshot) {
  const rows = new Map(), states = new Map(snapshot.states.map(s => [s.stateId, s])), b = snapshot.bounds
  const runs = snapshot.occludedSolidRuns ?? []
  if (!Array.isArray(runs) || runs.length > 262144) throw Error('NATIVE_HIDDEN_SOLID_RUN_INVALID')
  for (const row of runs) {
    if (!Array.isArray(row) || row.length !== 5 || !row.every(Number.isSafeInteger) ||
        row[0] < b.minY || row[0] > b.maxY || row[1] < b.minZ || row[1] > b.maxZ ||
        row[2] < b.minX || row[3] > b.maxX || row[2] > row[3] || !states.has(row[4])) throw Error('NATIVE_HIDDEN_SOLID_RUN_INVALID')
    const key = `${row[0]},${row[1]}`, list = rows.get(key) ?? []
    if (list.length && list.at(-1)[1] >= row[2]) throw Error('NATIVE_HIDDEN_SOLID_RUN_OVERLAP')
    list.push([row[2], row[3], states.get(row[4])]); rows.set(key, list)
  }
  return (x, y, z) => rows.get(`${y},${z}`)?.find(([lo, hi]) => x >= lo && x <= hi)?.[2]
}
