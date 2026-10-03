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

/** @param {number} avatarY @param {boolean} isDungeonView */
export function roomCutoffWorldY(avatarY, isDungeonView) {
  // A two-block-high room's ceiling starts at floor+2. Cut just below that
  // face; cutting above it leaves the underside visible over the avatar.
  return Math.floor(avatarY) + (isDungeonView ? 1.95 : -0.25)
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
  '    bool lanternBeyondFirstHit = lanternAlongRaw >= max(0.0, u_lanternCutawayHitAlong - u_lanternCutawayHalfSpan) && lanternAlongRaw <= 1.0;',
  '    bool lanternInSightCorridor = distance(v_lanternCutawayPosition.xz, lanternClosest) < lanternRadius;',
  '    bool lanternCutawayRegion = lanternBeyondFirstHit && lanternInSightCorridor;',
  '    if (u_lanternCutawayEnabled > 1.5 && lanternCutawayRegion && v_lanternCutawayPosition.y > u_lanternCutawayY) {',
  '      float edge = lanternRadius - distance(v_lanternCutawayPosition.xz, lanternClosest);',
  '      vec2 cell = floor(v_lanternCutawayPosition.xz * 4.0);',
  '      float grain = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);',
  '      if (edge >= 1.5 || grain < smoothstep(0.0, 1.5, edge)) discard;',
  '    }',
  '    if (u_lanternCutawayEnabled > 0.5 && u_lanternCutawayEnabled <= 1.5 && lanternCutawayRegion && v_lanternCutawayPosition.y > u_lanternCutawayY) {',
  '      vec2 lanternPixel = mod(floor(gl_FragCoord.xy), 4.0);',
  '      vec2 lanternLow = mod(lanternPixel, 2.0);',
  '      vec2 lanternHigh = floor(lanternPixel * 0.5);',
  '      float lanternLowRank = lanternLow.y < 0.5 ? (lanternLow.x < 0.5 ? 0.0 : 2.0) : (lanternLow.x < 0.5 ? 3.0 : 1.0);',
  '      float lanternHighRank = lanternHigh.y < 0.5 ? (lanternHigh.x < 0.5 ? 0.0 : 2.0) : (lanternHigh.x < 0.5 ? 3.0 : 1.0);',
  '      if (4.0 * lanternLowRank + lanternHighRank >= 8.0) discard;',
  '    }',
].join('\\n')

/** @param {string} source */
export function patchRoomOcclusion(source) {
  let result = source
  result = replaceOnce(result,
    'const DUNGEON_OCCLUSION_CUT_HEIGHT = 0.28;',
    'const DUNGEON_OCCLUSION_CUT_HEIGHT = 1.65;')
  for (const [before, after] of [
    ['function installDungeonOcclusion() {\n  if (!isDungeonView) return;',
      'function installDungeonOcclusion() {\n  if (!usesWorldAvatar) return;'],
    ['function scheduleDungeonOcclusionCheck() {\n  if (!isDungeonView || !rendererReady || document.hidden) return;',
      'function scheduleDungeonOcclusionCheck() {\n  if (!usesWorldAvatar || !rendererReady || document.hidden) return;'],
    ['function runDungeonOcclusionCheck() {\n  if (!isDungeonView || !rendererReady || !latestPosition || document.hidden) return;',
      `${hasRoomCeiling.toString()}\n\n${roomCutoffWorldY.toString()}\n\n${shouldHideUpperEntity.toString()}\n\nconst dungeonUpperEntityVisibility = new Map();\nfunction updateDungeonUpperEntities(avatarY) {\n  if (!isDungeonView) return;\n  const entities = globalThis.world?.entities?.entities || {};\n  const hiddenNow = new Set();\n  for (const [id, entity] of entityCache) {\n    const sceneEntity = entities[id];\n    const entityY = Number(entity?.pos?.y ?? entity?.position?.y);\n    if (!sceneEntity || !shouldHideUpperEntity(entityY, avatarY, id === String(pendingAvatarState?.entity?.id ?? ''))) continue;\n    hiddenNow.add(id);\n    const previous = dungeonUpperEntityVisibility.get(id);\n    if (previous?.object !== sceneEntity) {\n      if (previous) previous.object.visible = previous.visible;\n      dungeonUpperEntityVisibility.set(id, { object: sceneEntity, visible: sceneEntity.visible });\n    }\n    sceneEntity.visible = false;\n  }\n  for (const [id, previous] of dungeonUpperEntityVisibility) {\n    if (hiddenNow.has(id)) continue;\n    previous.object.visible = previous.visible;\n    dungeonUpperEntityVisibility.delete(id);\n  }\n}\n\nfunction runDungeonOcclusionCheck() {\n  if (!usesWorldAvatar || !rendererReady || !latestPosition || document.hidden) return;`],
    ['function refreshDungeonCutawayMaterials() {\n  if (!isDungeonView) return;',
      'function refreshDungeonCutawayMaterials() {\n  if (!usesWorldAvatar) return;'],
    ['  if (isDungeonView && !document.hidden) scheduleDungeonOcclusionCheck();',
      '  if (usesWorldAvatar && !document.hidden) scheduleDungeonOcclusionCheck();'],
    ['  if (!camera || !sceneOrigin || typeof collisionCache?.isSolidBlock !== "function") {',
      '  if (!camera || !sceneOrigin || (!isDungeonView && typeof collisionCache?.isSolidBlock !== "function")) {'],
    ['  dungeonOcclusionState = updateOcclusionHysteresis(\n    dungeonOcclusionState,\n    trace.occluded,',
      '  const collisionReady = typeof collisionCache?.isSolidBlock === "function";\n  const roomCeiling = collisionReady && hasRoomCeiling(avatar, collisionCache);\n  const deepRoof = collisionReady && hasDeepRoof(avatar, collisionCache);\n  dungeonOcclusionState = updateOcclusionHysteresis(\n    dungeonOcclusionState,\n    deepRoof || trace.occluded || roomCeiling,'],
    ['      cutoffWorldY: avatar.y + DUNGEON_OCCLUSION_CUT_HEIGHT,',
      '      cutoffWorldY: roomCutoffWorldY(avatar.y, isDungeonView),\n      hardCutaway: isDungeonView,'],
    ['  if (!wasActive && dungeonOcclusionState.active) viewerPerformanceCounters.cutawayActivations += 1;',
      '  if (isDungeonView) updateDungeonUpperEntities(avatar.y, dungeonOcclusionState.active);\n  if (!wasActive && dungeonOcclusionState.active) viewerPerformanceCounters.cutawayActivations += 1;'],
    ['    setElementDataset(canvas, "occlusionDetected", dungeonOcclusionState.active ? "blocked" : "clear");',
      '    setElementDataset(canvas, "occlusionDetected", dungeonOcclusionState.active ? "blocked" : "clear");\n    setElementDataset(canvas, "roomCeiling", roomCeiling ? "yes" : "no");\n    setElementDataset(canvas, "deepRoof", deepRoof ? "yes" : "no");'],
    ['    detected: dungeonOcclusionState.active,',
      '    detected: dungeonOcclusionState.active,\n    roomCeiling,\n    deepRoof,'],
    ['    bool lanternBeyondFirstHit = lanternAlongRaw >= max(0.0, u_lanternCutawayHitAlong - u_lanternCutawayHalfSpan) && lanternAlongRaw <= 1.0;\\n    bool lanternInSightCorridor = distance(v_lanternCutawayPosition.xz, lanternClosest) < lanternRadius;\\n    if (u_lanternCutawayEnabled > 0.5 && lanternBeyondFirstHit && lanternInSightCorridor && v_lanternCutawayPosition.y > u_lanternCutawayY) discard;',
      boundedCutawayShaderBlock],
  ]) result = replaceOnce(result, before, after)
  result = replaceOnce(result, hasRoomCeiling.toString(), `${hasRoomCeiling.toString()}\n\n${hasDeepRoof.toString()}`)
  result = replaceOnce(result, 'function updateDungeonUpperEntities(avatarY) {', 'function updateDungeonUpperEntities(avatarY, hardCutaway) {')
  result = replaceOnce(result, 'if (!sceneEntity || !shouldHideUpperEntity(entityY, avatarY,', 'if (!hardCutaway || !sceneEntity || !shouldHideUpperEntity(entityY, avatarY,')
  result = replaceOnce(result, 'function applyDungeonCutaway({ cutoffWorldY, targetWorld, cameraWorld, cameraScene, obstruction }) {',
    'function applyDungeonCutaway({ cutoffWorldY, targetWorld, cameraWorld, cameraScene, obstruction, hardCutaway }) {')
  result = replaceOnce(result,
    'record.material.uniforms.u_lanternCutawayEnabled.value = 1;',
    'record.material.uniforms.u_lanternCutawayEnabled.value = hardCutaway ? 2 : 1;')
  return result
}
