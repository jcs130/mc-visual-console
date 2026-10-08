import * as THREE from 'three'
import { NativeModelLoader } from './model-loader.js'
import { CREATE_JAR_SHA256 } from './create-kinetics.js'

const TYPES = new Set(['create:contraption', 'create:stationary_contraption'])
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }
const RESOURCE = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/
const wrap = value => ((value + 180) % 360 + 360) % 360 - 180
// Flywheel 1.0.6 Translate.nudge(int), including Java signed-long overflow.
export function nativeContraptionNudge (entityId) {
  if (!Number.isInteger(entityId) || entityId < -2147483648 || entityId > 2147483647) throw Error('NATIVE_CONTRAPTION_ENTITY_ID_INVALID')
  let bits = BigInt.asIntN(64, BigInt(entityId) * 31n * 493286711n)
  bits = BigInt.asIntN(64, bits * bits * 4392167121n + bits * 98761n)
  return [16n, 20n, 24n].map(shift => Math.fround((Math.fround((Number(bits >> shift & 7n) + 0.5) / 8) - 0.5) * Math.fround(0.004)))
}
export function nativeContraptionState (entity) {
  const row = entity?.contraptionRenderState
  if (!TYPES.has(entity?.name) || row?.source !== 'same_player_tracked_entity' || row.id !== entity.name ||
      row.uuid !== entity.uuid || row.entityId !== entity.entityId || !Number.isSafeInteger(row.epoch)) throw Error('NATIVE_CONTRAPTION_IDENTITY_UNAVAILABLE')
  if (row.available !== true) throw Error(row.reason || 'NATIVE_CONTRAPTION_STATE_UNAVAILABLE')
  if (!AXES[row.rotationAxis] || !Number.isSafeInteger(row.serverTick) || row.serverTick < 0 ||
      ![row.angleDegrees, row.previousAngleDegrees, row.anchor?.x, row.anchor?.y, row.anchor?.z].every(Number.isFinite) ||
      typeof row.stalled !== 'boolean') throw Error('NATIVE_CONTRAPTION_MOTION_INVALID')
  if (!Array.isArray(row.blocks) || row.blocks.length < 1 || row.blocks.length > 96 || row.blocks.length !== row.blockCount) throw Error('NATIVE_CONTRAPTION_BLOCK_BUDGET_INVALID')
  const seen = new Set()
  for (const block of row.blocks) {
    if (!block || ![block.x, block.y, block.z].every(v => Number.isInteger(v) && Math.abs(v) <= 2048) ||
        !RESOURCE.test(block.id || '') || !Number.isSafeInteger(block.stateId) || block.stateId < 0 ||
        !block.properties || Array.isArray(block.properties) ||
        Object.entries(block.properties).some(([k, v]) => !/^[a-z0-9_]+$/.test(k) || typeof v !== 'string' || v.length > 128) ||
        block.hasBlockEntity !== false) throw Error('NATIVE_CONTRAPTION_BLOCK_RENDERER_UNAVAILABLE')
    const key = `${block.x},${block.y},${block.z}`
    if (seen.has(key)) throw Error('NATIVE_CONTRAPTION_BLOCK_DUPLICATE')
    seen.add(key)
  }
  return row
}
export function nativeContraptionGeometryKey (entity) {
  const row = entity?.contraptionRenderState
  return JSON.stringify([row?.source, row?.playerUuid, row?.uuid, row?.entityId, row?.id, row?.epoch,
    row?.available, row?.reason, row?.rotationAxis, row?.blockCount, row?.blocks])
}
// Original ControlledContraptionEntity rotates about the anchor block centre.
// Interpolation uses actual native angles and is bounded; stale data hides it.
export function nativeContraptionAngle (row, ageMs) {
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 1000) throw Error('NATIVE_CONTRAPTION_MOTION_STALE')
  const delta = row.stalled ? 0 : wrap(row.angleDegrees - row.previousAngleDegrees)
  return Math.fround((row.angleDegrees + delta * Math.min(ageMs / 50, 6)) * Math.PI / 180)
}
export async function createNativeContraptionActor (reader, entity, { loadTexture } = {}) {
  const sources = reader.manifest.sources?.filter(s => s.name === 'create-1.21.1-6.0.10.jar')
  if (sources?.length !== 1 || sources[0].sha256 !== CREATE_JAR_SHA256 || sources[0].explicitOverride) throw Error('NATIVE_CREATE_VERSION_UNSUPPORTED')
  const first = nativeContraptionState(entity), geometryKey = nativeContraptionGeometryKey(entity)
  const loader = new NativeModelLoader(reader, loadTexture), root = new THREE.Group(), rotor = new THREE.Group()
  root.add(rotor)
  root.userData.nativeContraption = { source: 'Create_6.0.10_ControlledContraptionEntity', createJarSha256: CREATE_JAR_SHA256,
    blockCount: first.blocks.length, available: true, pixelParityVerified: false }
  try {
    for (const block of first.blocks) {
      const model = await loader.block({ name: block.id, properties: block.properties, stateId: block.stateId }, block)
      model.position.set(block.x, block.y, block.z)
      rotor.add(model)
    }
  } catch (error) { await loader.dispose(); throw error }
  let disposed = false, lastTick = null, observedAt = null
  return { root,
    update (next, now) {
      if (disposed) throw Error('NATIVE_CONTRAPTION_ACTOR_DISPOSED')
      const current = nativeContraptionState(next)
      if (nativeContraptionGeometryKey(next) !== geometryKey) throw Error('NATIVE_CONTRAPTION_GEOMETRY_CHANGED')
      if (current.serverTick !== lastTick) { lastTick = current.serverTick; observedAt = now }
      const ageMs = now - observedAt
      root.userData.nativeContraption.ageMs = ageMs
      if (ageMs > 1000 || ageMs < 0) {
        root.visible = false; root.userData.nativeContraption.available = false
        root.userData.nativeContraption.reason = 'NATIVE_CONTRAPTION_MOTION_STALE'; return
      }
      const nudge = nativeContraptionNudge(next.entityId)
      root.position.set(current.anchor.x + 0.5 + nudge[0], current.anchor.y + 0.5 + nudge[1], current.anchor.z + 0.5 + nudge[2])
      rotor.quaternion.setFromAxisAngle(AXES[current.rotationAxis], nativeContraptionAngle(current, ageMs))
      root.visible = true; root.userData.nativeContraption.available = true; delete root.userData.nativeContraption.reason
    },
    dispose () { if (disposed) return; disposed = true; root.removeFromParent(); void loader.dispose() }
  }
}
