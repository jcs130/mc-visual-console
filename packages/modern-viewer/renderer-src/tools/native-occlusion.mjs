// Only an exact original static full occlusion cube can hide another cube.
// Dynamic shapes, partial models, fluids, transparent blocks and block entities
// remain visible candidates. Unknown received neighbors never count as opaque.
export function nativeOpaqueFullCube(state) {
  return state?.renderShape === 'MODEL' && state.canOcclude === true && state.solid === true &&
    state.blocksMotion === true && state.dynamicShape === false && state.hasBlockEntity === false &&
    state.fluid?.empty === true && state.occlusionBoxes?.length === 1 &&
    state.occlusionBoxes[0].length === 6 && state.occlusionBoxes[0].every((v, i) => v === (i < 3 ? 0 : 1))
}

export function appendOccludedSolid(runs, x, y, z, stateId) {
  const previous = runs.at(-1)
  if (previous && previous[0] === y && previous[1] === z && previous[3] + 1 === x && previous[4] === stateId) previous[3] = x
  else runs.push([y, z, x, x, stateId])
}

export function nativeTerrainSignature(snapshot) {
  return JSON.stringify([snapshot.epoch, snapshot.registrySha256, snapshot.bounds, snapshot.states,
    snapshot.groups, snapshot.occludedSolidRuns, snapshot.neighbors, snapshot.biomeGrid, snapshot.biomes,
    snapshot.biomeSeed, snapshot.cuttingBoards, snapshot.kinetic, snapshot.missingColumns, snapshot.viewCoverage?.receivedColumns])
}
