import * as THREE from 'three'
import { nativeContraptionState, nativeContraptionAngle } from './native-contraption.js'

export const WINDMILL_BEARING_ID = 'create:windmill_bearing'
const SOURCE = 'ef87fe5709f1ba1f5b8bb20a2925b5afb4669e178fd6d8bf10c167759eefe37a'
const FACING = { east: [1,0,0], west: [-1,0,0], up: [0,1,0], down: [0,-1,0], south: [0,0,1], north: [0,0,-1] }
const AXIS = { x: new THREE.Vector3(1,0,0), y: new THREE.Vector3(0,1,0), z: new THREE.Vector3(0,0,1) }
export function verifyNativeWindmillBearing (reader, state) {
  const rows = reader?.manifest?.sources?.filter(s => s.name === 'create-1.21.1-6.0.10.jar')
  if (rows?.length !== 1 || rows[0].sha256 !== SOURCE || rows[0].explicitOverride) throw Error('NATIVE_CREATE_VERSION_UNSUPPORTED')
  if (state?.name !== WINDMILL_BEARING_ID || !FACING[state.properties?.facing] || state.hasBlockEntity !== true || state.renderShape !== 'MODEL') throw Error('NATIVE_BEARING_STATE_UNAVAILABLE')
}
// Create 6.0.10 BearingVisual.getBlockStateOrientation, AngleHelper from its
// embedded Ponder 1.0.82. The model's original UP face becomes native facing.
export function nativeBearingOrientation (facing) {
  if (!FACING[facing]) throw Error('NATIVE_BEARING_FACING_INVALID')
  const horizontalOpposite = { east: -90, west: -270, north: 0, south: 180 }
  const vertical = facing === 'up' ? -90 : facing === 'down' ? 90 : 0
  const q = new THREE.Quaternion()
  if (Object.hasOwn(horizontalOpposite, facing)) q.setFromAxisAngle(AXIS.y, horizontalOpposite[facing] * Math.PI / 180)
  return q.multiply(new THREE.Quaternion().setFromAxisAngle(AXIS.x, (-90 - vertical) * Math.PI / 180))
}
export function nativeBearingContraption (state, position, entities) {
  const facing = FACING[state.properties.facing], axis = facing[0] ? 'x' : facing[1] ? 'y' : 'z'
  const rows = (entities || []).filter(entity => {
    const row = entity?.contraptionRenderState
    return row?.rotationAxis === axis && ['x','y','z'].every((k,i) => row.anchor?.[k] === position[k] + facing[i])
  })
  if (rows.length !== 1) throw Error('NATIVE_BEARING_CONTRAPTION_BINDING_UNAVAILABLE')
  return nativeContraptionState(rows[0])
}
export async function createNativeWindmillBearingActor (loader, state, position, shaftAngle) {
  verifyNativeWindmillBearing(loader.reader, state)
  const root = new THREE.Group()
  let shaft, top
  try {
    shaft = await loader.model('create:block/shaft_half'); root.add(shaft)
    top = await loader.model('create:block/bearing/top_wooden'); root.add(top)
  } catch (error) { loader.releaseModel?.(root); throw error }
  const facing = new THREE.Vector3(...FACING[state.properties.facing]), axis = facing.x ? 'x' : facing.y ? 'y' : 'z'
  const shaftOrientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), facing.clone().negate())
  const topOrientation = nativeBearingOrientation(state.properties.facing), spin = new THREE.Quaternion()
  root.position.set(position.x + 0.5, position.y + 0.5, position.z + 0.5)
  root.userData.nativeBearing = { source: 'Create_6.0.10_BearingRenderer_BearingVisual', available: false, pixelParityVerified: false }
  let speed = null, native = null, entities = [], lastTick = null, observedAt = null, disposed = false
  return { root, state, position, staticBodyRenderedSeparately: true,
    setSpeed (value) { if (!Number.isFinite(value)) throw Error('NATIVE_KINETIC_SPEED_UNAVAILABLE'); speed = value },
    setNativeState (node) { native = node.windmill ?? null },
    setContraptionEntities (value) { entities = value },
    setClockAvailable (available, reason = null) { root.visible = available === true; root.userData.nativeClockReason = available ? null : reason },
    tick () { if (disposed || speed === null) throw Error('NATIVE_KINETIC_SPEED_UNAVAILABLE') },
    frame (ticks) {
      if (disposed || speed === null) throw Error('NATIVE_KINETIC_SPEED_UNAVAILABLE')
      shaft.quaternion.copy(spin.setFromAxisAngle(AXIS[axis], shaftAngle(ticks, speed, position, axis))).multiply(shaftOrientation)
      try {
        if (native?.source !== 'same_player_native_block_entity_packet' || typeof native.running !== 'boolean' || !Number.isFinite(native.angleDegrees)) throw Error('NATIVE_BEARING_BLOCK_ENTITY_UNAVAILABLE')
        let angle = native.angleDegrees * Math.PI / 180
        if (native.running) {
          const row = nativeBearingContraption(state, position, entities), now = Date.now()
          if (row.serverTick !== lastTick) { lastTick = row.serverTick; observedAt = now }
          angle = nativeContraptionAngle(row, now - observedAt)
        } else { lastTick = null; observedAt = null }
        top.quaternion.copy(spin.setFromAxisAngle(AXIS[axis], angle)).multiply(topOrientation)
        top.visible = true; root.userData.nativeBearing.available = true; delete root.userData.nativeBearing.reason
      } catch (error) { top.visible = false; root.userData.nativeBearing.available = false; root.userData.nativeBearing.reason = error.message }
    },
    reset () { speed = null; native = null; entities = []; lastTick = null; observedAt = null },
    dispose () { if (disposed) return; disposed = true; root.removeFromParent(); loader.releaseModel?.(root) }
  }
}
