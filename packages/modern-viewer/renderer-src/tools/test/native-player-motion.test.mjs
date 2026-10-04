import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { createNativePlayerMotionTracker, renderNativePlayerMotion, nativeHumanoidWalkAngles,
  nativePlayerSin, nativePlayerCos, toSkinviewLimbRotation } from '../../src/native-viewer/native-player-motion.js'

const bits = value => { const buffer = new ArrayBuffer(4); new DataView(buffer).setFloat32(0, value); return new DataView(buffer).getUint32(0).toString(16) }
const sample = (tick, x = 0, extra = {}) => ({ epoch: 0, tick, sampledAt: 1000 + tick * 50, pose: { x, y: 64, z: 0 }, ...extra })

test('LUT and Java float-to-int behavior match actual locked Mth class fixtures', () => {
  // Executed through Java 21 reflection on locked ayo.a(float)/ayo.b(float),
  // including negative lookup rounding and Java saturation before index mask.
  for (const [angle, sinBits, cosBits] of [
    [0, '0', '3f800000'], [1, '3f57695c', '3f0a5341'], [-1, 'bf57695c', '3f0a4df7'],
    [Math.fround(Math.PI), '250d3132', 'bf800000'], [1000000, 'b8c90fdb', 'b8c90fdb'], [-1000000, '0', '0']
  ]) { assert.equal(bits(nativePlayerSin(angle)), sinBits); assert.equal(bits(nativePlayerCos(angle)), cosBits) }
  for (const angle of [NaN, Infinity, -Infinity, Number.MAX_VALUE]) assert.throws(() => nativePlayerCos(angle), /ANGLE_INVALID/)
})

test('all 65536 lookup values match the actual locked client table SHA256', () => {
  // Reflection read ayo.p from the locked client; SHA256 of BE float32 values.
  // Mid-bin float angles visit every entry without relying on exact boundaries.
  const bytes = Buffer.alloc(65536 * 4)
  for (let i = 0; i < 65536; i++) bytes.writeFloatBE(nativePlayerSin(Math.fround((i + 0.5) / Math.fround(10430.378))), i * 4)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '87a67a39fff59636acb04edcda4ef622831037291f11fb61586c57596771dac2')
})

test('consecutive horizontal physics ticks reproduce actual WalkAnimationState float bits', () => {
  // Actual bup fields (speedOld/speed/position), updated with min(distance*4,1),0.4.
  const tracker = createNativePlayerMotionTracker()
  assert.equal(tracker.record(sample(0)).available, false)
  const positions = [0.1, 0.3, 0.3, 0.3]
  const expected = [['0', '3e23d70b', '3e23d70b'], ['3e23d70b', '3ed4fdf4', '3f1374bd'],
    ['3ed4fdf4', '3e7f9725', '3f535a86'], ['3e7f9725', '3e195ab0', '3f79b132']]
  positions.forEach((x, i) => {
    const result = tracker.record(sample(i + 1, x))
    assert.equal(result.available, true)
    assert.deepEqual(Object.values(result.walk).map(bits), expected[i])
    assert.equal(result.animationParityVerified, false); assert.equal(result.ageInTicks, null)
  })
})

test('vertical movement alone cannot become player walking or an invented idle bob', () => {
  const tracker = createNativePlayerMotionTracker(); tracker.record(sample(0))
  const motion = tracker.record(sample(1, 0, { pose: { x: 0, y: 90, z: 0 } }))
  assert.deepEqual(motion.walk, { speedOld: 0, speed: 0, position: 0 })
  const result = renderNativePlayerMotion(motion, 1075)
  assert.equal(result.bobAvailable, false); assert.equal(result.limbs.rightArm.x, -0)
  assert.equal(result.limbs.rightArm.z, 0); assert.equal(result.attackAnimationAvailable, false)
})

test('render uses the original old/new speed and phase interpolation, capped at one known tick', () => {
  const tracker = createNativePlayerMotionTracker(); tracker.record(sample(0))
  const motion = tracker.record(sample(1, 0.25))
  const beginning = renderNativePlayerMotion(motion, 1050), midpoint = renderNativePlayerMotion(motion, 1075)
  assert.equal(beginning.position, 0); assert.equal(beginning.speed, 0)
  assert.equal(midpoint.partialTick, 0.5); assert.equal(midpoint.speed, Math.fround(0.2)); assert.equal(midpoint.position, Math.fround(0.2))
  const end = renderNativePlayerMotion(motion, 1100), longAfter = renderNativePlayerMotion(motion, 9100)
  assert.equal(end.frozen, true); assert.deepEqual(longAfter, end)
  assert.equal(renderNativePlayerMotion(motion, undefined).available, false)
  assert.equal(renderNativePlayerMotion(motion, 1049).available, false)
})

test('base HumanoidModel uses opposite arm/leg phases and the real small leg Y/Z rotations', () => {
  const result = nativeHumanoidWalkAngles({ position: 0, speed: 1 })
  assert.equal(result.limbs.rightArm.x, -1); assert.equal(result.limbs.leftArm.x, 1)
  assert.equal(result.limbs.rightLeg.x, Math.fround(1.4)); assert.equal(result.limbs.leftLeg.x, Math.fround(-1.4))
  assert.equal(result.limbs.rightLeg.y, Math.fround(0.005)); assert.equal(result.limbs.leftLeg.z, Math.fround(-0.005))
  assert.equal(result.skinview.rightLeg.y, Math.fround(-0.005)); assert.equal(result.skinview.leftLeg.z, Math.fround(0.005))
  assert.equal(result.scope, 'humanoid_walk_base'); assert.equal(result.animationParityVerified, false)
})

test('verified entity age enables original arm bob, while absent age remains unknown', () => {
  const idle = nativeHumanoidWalkAngles({ position: 0, speed: 0, ageInTicks: 0 })
  assert.equal(idle.bobAvailable, true); assert.equal(idle.limbs.rightArm.z, Math.fround(0.1))
  assert.equal(idle.limbs.leftArm.z, Math.fround(-0.1))
  const tracker = createNativePlayerMotionTracker(); tracker.record(sample(0, 0, { ageInTicks: 20 }))
  const motion = tracker.record(sample(1, 0, { ageInTicks: 21 }))
  assert.equal(renderNativePlayerMotion(motion, 1075).bobAvailable, true)
  assert.equal(nativeHumanoidWalkAngles({ position: 0, speed: 0 }).bobAvailable, false)
})

test('Java ModelPart ZYX and skinview X/-Y/-Z conversion preserve full posed vectors', () => {
  const java = { x: 0.43, y: -0.17, z: 0.31 }, skin = toSkinviewLimbRotation(java)
  assert.deepEqual(skin, { x: java.x, y: -java.y, z: -java.z, order: 'ZYX' })
  const conversion = new THREE.Matrix4().makeRotationX(Math.PI)
  const javaRotation = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(java.x, java.y, java.z, 'ZYX'))
  const skinRotation = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(skin.x, skin.y, skin.z, skin.order))
  for (const point of [new THREE.Vector3(2, 11, -3), new THREE.Vector3(-1, 7, 4), new THREE.Vector3(0, 12, 0)]) {
    const expected = point.clone().applyMatrix4(javaRotation).applyMatrix4(conversion)
    const actual = point.clone().applyMatrix4(conversion).applyMatrix4(skinRotation)
    assert.ok(expected.distanceTo(actual) < 1e-12)
  }
})

test('death/respawn/dimension/teleport and epoch changes cannot integrate a discontinuous position', () => {
  for (const discontinuity of ['connection', 'death', 'respawn', 'dimension', 'teleport']) {
    const tracker = createNativePlayerMotionTracker(); tracker.record(sample(0)); tracker.record(sample(1, 0.25))
    const reset = tracker.record(sample(2, 600, { discontinuity }))
    assert.equal(reset.available, false); assert.match(reset.reason, /RESET_/)
    const resumed = tracker.record(sample(3, 600))
    assert.deepEqual(resumed.walk, { speedOld: 0, speed: 0, position: 0 })
    assert.equal(tracker.reset(discontinuity).walk, null)
  }
  const tracker = createNativePlayerMotionTracker(); tracker.record(sample(0))
  assert.match(tracker.record(sample(1, 1000, { epoch: 1 })).reason, /EPOCH_CHANGED/)
  assert.throws(() => tracker.reset('guessed_distance'), /RESET_INVALID/)
})

test('missing/duplicate/reversed ticks and regressed clocks are explicit gaps without catch-up', () => {
  for (const tick of [0, 3]) {
    const tracker = createNativePlayerMotionTracker(); tracker.record(sample(0))
    const result = tracker.record(sample(tick, 5))
    assert.equal(result.available, false); assert.equal(result.walk, null); assert.match(result.reason, /TICK_GAP/)
    assert.equal(tracker.record(sample(tick + 1, 5)).walk.position, 0)
  }
  const tracker = createNativePlayerMotionTracker(); tracker.record(sample(4))
  assert.match(tracker.record(sample(3)).reason, /TICK_GAP/)
  tracker.reset(); tracker.record(sample(0))
  assert.match(tracker.record(sample(1, 0.25, { sampledAt: 999 })).reason, /CLOCK_REGRESSED/)
})

test('invalid inputs cannot poison future motion or be trusted as complete rendering state', () => {
  const tracker = createNativePlayerMotionTracker()
  for (const invalid of [{}, sample(0, 0, { epoch: -1 }), sample(0, 0, { tick: 0.5 }), sample(0, 0, { sampledAt: NaN }),
    sample(0, 0, { pose: { x: Infinity, y: 64, z: 0 } }), sample(0, 0, { ageInTicks: -1 }), sample(0, 0, { discontinuity: 'guess' })]) {
    assert.equal(tracker.record(invalid).available, false); assert.equal(tracker.current().walk, null)
  }
  tracker.record(sample(0)); const motion = tracker.record(sample(1, 0.25))
  for (const invalid of [{ ...motion, source: 'different_connection' }, { ...motion, tickMs: 100 },
    { ...motion, walk: { ...motion.walk, speed: NaN } }, { ...motion, ageInTicks: undefined }]) {
    const result = renderNativePlayerMotion(invalid, 1075)
    assert.equal(result.available, false); assert.equal(result.limbs, null); assert.equal(result.animationParityVerified, false)
  }
  const copy = tracker.current(); copy.walk.speed = 42; copy.tick = 99
  assert.equal(tracker.current().tick, 1); assert.notEqual(tracker.current().walk.speed, 42)
})
