/** Keep the avatar visible through nearby room roofs and camera-facing walls. */
/**
 * @param {{ x: number, y: number, z: number }} avatar
 * @param {{ isSolidBlock: (x: number, y: number, z: number) => boolean }} collisionCache
 */
export function hasRoomCeiling(avatar, collisionCache) {
  const x = Math.floor(avatar.x)
  const y = Math.floor(avatar.y)
  const z = Math.floor(avatar.z)
  for (let height = 2; height <= 4; height += 1) {
    if (!collisionCache.isSolidBlock(x, y + height, z)) continue
    let surrounding = 0
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (collisionCache.isSolidBlock(x + dx, y + height, z + dz)) surrounding += 1
    }
    if (surrounding >= 2) return true
  }
  return false
}

/** @param {{ x: number, y: number, z: number }} avatar @param {{ isSolidBlock: (x: number, y: number, z: number) => boolean }} collisionCache */
export function hasDeepRoof(avatar, collisionCache) {
  const x = Math.floor(avatar.x)
  const y = Math.floor(avatar.y)
  const z = Math.floor(avatar.z)
  let solids = 0
  for (let height = 2; height <= 10; height += 1) {
    if (collisionCache.isSolidBlock(x, y + height, z)) solids += 1
  }
  return solids >= 5
}

/** @param {number} avatarY @param {boolean} hardCutaway */
export function roomCutoffWorldY(avatarY, hardCutaway) {
  // A two-block-high room's ceiling starts at floor+2. Cut just below that
  // face; cutting above it leaves the underside visible over the avatar.
  return hardCutaway ? Math.floor(avatarY) + 1.95 : avatarY + 0.05
}

/** Dungeon view removes the upper layer; third-person view fades its sight corridor. */
/** @param {boolean} isDungeonView */
export function roomOcclusionMode(isDungeonView) {
  return isDungeonView ? 'cutaway' : 'translucent'
}

/** @param {number} entityY @param {number} avatarY @param {boolean} isSelf */
export function shouldHideUpperEntity(entityY, avatarY, isSelf = false) {
  return !isSelf && Number.isFinite(entityY) && Number.isFinite(avatarY)
    && entityY >= Math.floor(avatarY) + 2
}

/** @param {string} source @param {string} before @param {string} after */
function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw Error(`modern viewer room occlusion anchor changed: ${before.slice(0, 72)}`)
  return source.replace(before, after)
}

const boundedCutawayShaderBlock = [
  '    bool lanternBeyondFirstHit = lanternAlongRaw >= max(0.0, u_lanternCutawayHitAlong - u_lanternCutawayHalfSpan) && lanternAlongRaw <= 1.0 + u_lanternCutawayHalfSpan;',
  '    bool lanternInSightCorridor = distance(v_lanternCutawayPosition.xz, lanternClosest) < lanternRadius;',
  '    bool lanternCutawayRegion = lanternBeyondFirstHit && lanternInSightCorridor;',
  '    if (u_lanternCutawayEnabled > 1.5 && v_lanternCutawayPosition.y > u_lanternCutawayY) discard;',
  '    if (u_lanternCutawayEnabled > 0.5 && u_lanternCutawayEnabled <= 1.5 && lanternCutawayRegion && v_lanternCutawayPosition.y > u_lanternCutawayY) {',
  '      vec2 lanternPixel = mod(floor(gl_FragCoord.xy), 4.0);',
  '      vec2 lanternLow = mod(lanternPixel, 2.0);',
  '      vec2 lanternHigh = floor(lanternPixel * 0.5);',
  '      float lanternLowRank = lanternLow.y < 0.5 ? (lanternLow.x < 0.5 ? 0.0 : 2.0) : (lanternLow.x < 0.5 ? 3.0 : 1.0);',
  '      float lanternHighRank = lanternHigh.y < 0.5 ? (lanternHigh.x < 0.5 ? 0.0 : 2.0) : (lanternHigh.x < 0.5 ? 3.0 : 1.0);',
  '      float lanternEdge = lanternRadius - distance(v_lanternCutawayPosition.xz, lanternClosest);',
  '      float lanternCoverage = mix(16.0, 4.0, smoothstep(0.0, 0.75, lanternEdge));',
  '      if (4.0 * lanternLowRank + lanternHighRank >= lanternCoverage) discard;',
  '    }',
].join('\\n')

/** @param {string} source */
export function patchRoomOcclusion(source) {
  let result = source.replace(/\r\n/g, '\n')
  result = replaceOnce(result,
    'const DUNGEON_OCCLUSION_CUT_HEIGHT = 0.28;',
    'const DUNGEON_OCCLUSION_CUT_HEIGHT = 1.65;')
  for (const [before, after] of [
    ['function installDungeonOcclusion() {\n  if (!isDungeonView) return;',
      'function installDungeonOcclusion() {\n  if (!usesWorldAvatar) return;'],
    ['function scheduleDungeonOcclusionCheck() {\n  if (!isDungeonView || !rendererReady || document.hidden) return;',
      'function scheduleDungeonOcclusionCheck() {\n  if (!usesWorldAvatar || !rendererReady || document.hidden) return;'],
    ['function runDungeonOcclusionCheck() {\n  if (!isDungeonView || !rendererReady || !latestPosition || document.hidden) return;',
      `${hasRoomCeiling.toString()}\n\n${roomCutoffWorldY.toString()}\n\n${roomOcclusionMode.toString()}\n\n${shouldHideUpperEntity.toString()}\n\nfunction runDungeonOcclusionCheck() {\n  if (!usesWorldAvatar || !rendererReady || !latestPosition || document.hidden) return;`],
    ['function refreshDungeonCutawayMaterials() {\n  if (!isDungeonView) return;',
      'function refreshDungeonCutawayMaterials() {\n  if (!usesWorldAvatar) return;'],
    ['  if (isDungeonView && !document.hidden) scheduleDungeonOcclusionCheck();',
      '  if (usesWorldAvatar && !document.hidden) scheduleDungeonOcclusionCheck();'],
    ['  if (!camera || !sceneOrigin || typeof collisionCache?.isSolidBlock !== "function") {',
      '  if (!camera || !sceneOrigin || (!isDungeonView && typeof collisionCache?.isSolidBlock !== "function")) {'],
    ['  dungeonOcclusionState = updateOcclusionHysteresis(\n    dungeonOcclusionState,\n    trace.occluded,',
      '  const collisionReady = typeof collisionCache?.isSolidBlock === "function";\n  const roomCeiling = collisionReady && hasRoomCeiling(avatar, collisionCache);\n  const deepRoof = collisionReady && hasDeepRoof(avatar, collisionCache);\n  dungeonOcclusionState = updateOcclusionHysteresis(\n    dungeonOcclusionState,\n    isDungeonView || deepRoof || trace.occluded || roomCeiling,'],
    ['      cutoffWorldY: avatar.y + DUNGEON_OCCLUSION_CUT_HEIGHT,',
      '      cutoffWorldY: roomCutoffWorldY(avatar.y, hardCutaway),\n      hardCutaway,'],
    ['    setElementDataset(canvas, "occlusionDetected", dungeonOcclusionState.active ? "blocked" : "clear");',
      '    setElementDataset(canvas, "occlusionDetected", dungeonOcclusionState.active ? "blocked" : "clear");\n    setElementDataset(canvas, "roomCeiling", roomCeiling ? "yes" : "no");\n    setElementDataset(canvas, "deepRoof", deepRoof ? "yes" : "no");'],
    ['    detected: dungeonOcclusionState.active,',
      '    detected: dungeonOcclusionState.active,\n    roomCeiling,\n    deepRoof,\n    mode: dungeonOcclusionState.active ? roomOcclusionMode(isDungeonView) : "clear",\n    cutoffWorldY: roomCutoffWorldY(avatar.y, hardCutaway),\n    cutScope: hardCutaway ? "layer" : "corridor",'],
    ['    bool lanternBeyondFirstHit = lanternAlongRaw >= max(0.0, u_lanternCutawayHitAlong - u_lanternCutawayHalfSpan) && lanternAlongRaw <= 1.0;\\n    bool lanternInSightCorridor = distance(v_lanternCutawayPosition.xz, lanternClosest) < lanternRadius;\\n    if (u_lanternCutawayEnabled > 0.5 && lanternBeyondFirstHit && lanternInSightCorridor && v_lanternCutawayPosition.y > u_lanternCutawayY) discard;',
      boundedCutawayShaderBlock],
  ]) result = replaceOnce(result, before, after)
  result = replaceOnce(result, '  const wasActive = dungeonOcclusionState.active;',
    '  // Prepare late terrain materials while the corridor is still clear.\n  // First entering a house must not trigger shader compilation.\n  refreshDungeonCutawayMaterials();\n  const wasActive = dungeonOcclusionState.active;')
  result = replaceOnce(result,
    'function applyDungeonCutaway({ cutoffWorldY, targetWorld, cameraWorld, cameraScene, obstruction }) {\n  refreshDungeonCutawayMaterials();',
    'function applyDungeonCutaway({ cutoffWorldY, targetWorld, cameraWorld, cameraScene, obstruction }) {')
  result = replaceOnce(result, '  if (dungeonOcclusionState.active) {\n    applyDungeonCutaway({',
    '  const hardCutaway = roomOcclusionMode(isDungeonView) === "cutaway";\n  if (dungeonOcclusionState.active) {\n    applyDungeonCutaway({')
  result = replaceOnce(result,
    'getUpperCutawayY: () => isDungeonView && dungeonOcclusionState.active ? latestPosition?.pos?.y : null',
    'getUpperCutawayY: () => isDungeonView ? (resolveObserverTargetPosition()?.position?.y ?? latestPosition?.pos?.y ?? null) : null')
  result = replaceOnce(result,
    '    setElementDataset(canvas, "deepRoof", deepRoof ? "yes" : "no");',
    '    setElementDataset(canvas, "deepRoof", deepRoof ? "yes" : "no");\n    setElementDataset(canvas, "occlusionMode", dungeonOcclusionState.active ? roomOcclusionMode(isDungeonView) : "clear");')
  result = replaceOnce(result, hasRoomCeiling.toString(), `${hasRoomCeiling.toString()}\n\n${hasDeepRoof.toString()}`)
  result = replaceOnce(result, 'function applyDungeonCutaway({ cutoffWorldY, targetWorld, cameraWorld, cameraScene, obstruction }) {',
    'function applyDungeonCutaway({ cutoffWorldY, targetWorld, cameraWorld, cameraScene, obstruction, hardCutaway }) {')
  result = replaceOnce(result,
    'record.material.uniforms.u_lanternCutawayEnabled.value = 1;',
    'record.material.uniforms.u_lanternCutawayEnabled.value = hardCutaway ? 2 : 1;')
  return result
}
