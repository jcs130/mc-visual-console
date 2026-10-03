import * as THREE from 'three'

// Adapter for the installed 6.0.10 JAR only (Create commit ac0c444d9828da3453ae8cc65338e8de063286fb).
// Rules checked against its KineticBlockEntityRenderer, KineticBlockEntityVisual,
// HandCrankBlockEntity and HandCrankVisual bytecode. No generated geometry.
export const CREATE_JAR_SHA256 = 'ef87fe5709f1ba1f5b8bb20a2925b5afb4669e178fd6d8bf10c167759eefe37a'
const DIRECTIONS = { east: [1, 0, 0], west: [-1, 0, 0], up: [0, 1, 0], down: [0, -1, 0], south: [0, 0, 1], north: [0, 0, -1] }
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }
const f32 = Math.fround

export function kineticAngle (ticks, speed, position, axis) {
  if (!AXES[axis] || ![ticks, speed, position.x, position.y, position.z].every(Number.isFinite)) throw Error('NATIVE_KINETIC_INPUT_INVALID')
  const perpendicularSum = ['x', 'y', 'z'].filter(a => a !== axis).reduce((sum, a) => sum + position[a], 0)
  const offset = perpendicularSum % 2 === 0 ? 22.5 : 0
  const degrees = f32(f32(f32(f32(f32(ticks) * f32(speed)) * 3) / 10) + offset)
  return f32(f32(f32(degrees % 360) / 180) * f32(Math.PI))
}

export class CrankMotion {
  constructor () { this.angle = 0; this.velocity = 0; this.speed = 0; this.tick = 0 }
  setSpeed (speed) {
    if (!Number.isFinite(speed)) throw Error('NATIVE_KINETIC_SPEED_UNAVAILABLE')
    this.speed = f32(speed)
  }
  step () {
    const target = f32(f32(f32(this.speed * 360) / 60) / 20)
    this.velocity = f32(this.velocity + f32(f32(target - this.velocity) / 4))
    this.angle = f32(this.angle + this.velocity)
    this.tick++
  }
  radians (partialTick) { return f32(f32(this.angle + f32(partialTick * this.velocity)) * Math.PI / 180) }
  reset () { this.angle = 0; this.velocity = 0; this.tick = 0; this.speed = 0 }
}

export async function createKineticActor (loader, state, position) {
  if (!loader.reader.manifest.sources.some(s => s.sha256 === CREATE_JAR_SHA256)) throw Error('NATIVE_CREATE_VERSION_UNSUPPORTED')
  if (![position.x, position.y, position.z].every(Number.isInteger)) throw Error('NATIVE_KINETIC_POSITION_INVALID')
  const root = new THREE.Group(), rotor = new THREE.Group()
  root.position.set(position.x + 0.5, position.y + 0.5, position.z + 0.5)
  root.add(rotor)
  let axis, handle, facingQuaternion, motion
  if (state.name === 'create:shaft') {
    axis = state.properties.axis
    if (!AXES[axis]) throw Error('NATIVE_SHAFT_AXIS_INVALID')
    rotor.add(await loader.block(state))
  } else if (state.name === 'create:hand_crank') {
    const facing = DIRECTIONS[state.properties.facing]
    if (!facing) throw Error('NATIVE_CRANK_FACING_INVALID')
    axis = facing[0] ? 'x' : facing[1] ? 'y' : 'z'
    rotor.add(await loader.block(state))
    handle = await loader.model('create:block/hand_crank/handle')
    facingQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(...facing))
    handle.quaternion.copy(facingQuaternion)
    root.add(handle)
    motion = new CrankMotion()
  } else throw Error(`NATIVE_KINETIC_BLOCK_UNSUPPORTED:${state.name}`)
  const spin = new THREE.Quaternion()
  let speed = null
  return {
    root, state, position, rotor, handle, motion,
    setSpeed (value) { if (!Number.isFinite(value)) throw Error('NATIVE_KINETIC_SPEED_UNAVAILABLE'); speed = value; motion?.setSpeed(value) },
    tick () { if (speed === null) throw Error('NATIVE_KINETIC_SPEED_UNAVAILABLE'); motion?.step() },
    frame (renderTicks, partialTick) {
      if (speed === null) throw Error('NATIVE_KINETIC_SPEED_UNAVAILABLE')
      rotor.quaternion.setFromAxisAngle(AXES[axis], kineticAngle(renderTicks, speed, position, axis))
      if (handle) handle.quaternion.copy(spin.setFromAxisAngle(AXES[axis], motion.radians(partialTick))).multiply(facingQuaternion)
    },
    reset () { motion?.reset(); speed = null }
  }
}
