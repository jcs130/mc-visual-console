// Locked 1.21.1 client: bup=WalkAnimationState, btn=LivingEntity,
// fvx=HumanoidModel, fuh=AnimationUtils, ayo=Mth, fyk=ModelPart.
// JAR SHA256 499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99.
// These are the client's float/LUT walk rules, fed only by consecutive actual
// action-player physics ticks. They do not establish complete pose parity:
// body/head yaw, attack, riding, swimming, flight and held-item poses are separate.
export const NATIVE_PLAYER_TICK_MS = 50
export const NATIVE_PLAYER_MOTION_SOURCE = 'same_player_physics_tick'
const F = Math.fround
const PI = F(Math.PI), PHASE_SCALE = F(0.6662), SMOOTHING = F(0.4)
const SIN_SCALE = F(10430.378), QUARTER_CYCLE = F(16384)
const RESET_SIGNALS = new Set(['connection', 'death', 'respawn', 'dimension', 'teleport'])
const SIN = new Float32Array(65536)
for (let i = 0; i < SIN.length; i++) SIN[i] = Math.sin(i * Math.PI * 2 / 65536)

const mul = (a, b) => F(F(a) * F(b))
const add = (a, b) => F(F(a) + F(b))
const sub = (a, b) => F(F(a) - F(b))
const safeCount = value => Number.isSafeInteger(value) && value >= 0
const float = value => Number.isFinite(value) && Number.isFinite(F(value))
const integerCast = value => value >= 2147483647 ? 2147483647 : value <= -2147483648 ? -2147483648 : Math.trunc(value)

export function nativePlayerSin (radians) {
  if (!float(radians)) throw Error('NATIVE_PLAYER_ANGLE_INVALID')
  return SIN[integerCast(mul(radians, SIN_SCALE)) & 65535]
}

export function nativePlayerCos (radians) {
  if (!float(radians)) throw Error('NATIVE_PLAYER_ANGLE_INVALID')
  return SIN[integerCast(add(mul(radians, SIN_SCALE), QUARTER_CYCLE)) & 65535]
}

// ModelPart calls Quaternion.rotationZYX(z,y,x). In the existing actor, Java
// model +Y down/front -Z maps to skinview +Y up/front +Z by Rx(PI). Therefore
// x stays positive, y/z change sign, and Three Euler order must remain ZYX.
export function toSkinviewLimbRotation ({ x, y, z } = {}) {
  if (![x, y, z].every(float)) throw Error('NATIVE_PLAYER_LIMB_INVALID')
  return { x, y: -y, z: -z, order: 'ZYX' }
}

export function nativeHumanoidWalkAngles ({ position, speed, ageInTicks = null } = {}) {
  if (!float(position) || !float(speed) || speed < 0 || speed > 1 ||
    (ageInTicks !== null && (!float(ageInTicks) || ageInTicks < 0))) throw Error('NATIVE_PLAYER_WALK_INVALID')
  const phase = mul(position, PHASE_SCALE), opposite = add(phase, PI)
  const arm = angle => mul(mul(mul(nativePlayerCos(angle), 2), speed), 0.5)
  const leg = angle => mul(mul(nativePlayerCos(angle), F(1.4)), speed)
  const limbs = {
    rightArm: { x: arm(opposite), y: 0, z: 0 },
    leftArm: { x: arm(phase), y: 0, z: 0 },
    rightLeg: { x: leg(phase), y: F(0.005), z: F(0.005) },
    leftLeg: { x: leg(opposite), y: F(-0.005), z: F(-0.005) }
  }
  // The client uses entity.tickCount+partialTick, not world age or wall time.
  // No verified entity age supplied means no invented idle bob phase.
  if (ageInTicks !== null) {
    const z = add(mul(nativePlayerCos(mul(ageInTicks, F(0.09))), F(0.05)), F(0.05))
    const x = mul(nativePlayerSin(mul(ageInTicks, F(0.067))), F(0.05))
    limbs.rightArm.z = add(limbs.rightArm.z, z); limbs.leftArm.z = sub(limbs.leftArm.z, z)
    limbs.rightArm.x = add(limbs.rightArm.x, x); limbs.leftArm.x = sub(limbs.leftArm.x, x)
  }
  return { limbs, skinview: Object.fromEntries(Object.entries(limbs).map(([name, value]) => [name, toSkinviewLimbRotation(value)])),
    bobAvailable: ageInTicks !== null, animationParityVerified: false, scope: 'humanoid_walk_base' }
}

function copyState (state) { return { ...state, walk: state.walk && { ...state.walk } } }
function emptyState (reason, sample = null) {
  return { schemaVersion: 1, source: NATIVE_PLAYER_MOTION_SOURCE, tickMs: NATIVE_PLAYER_TICK_MS,
    epoch: sample?.epoch ?? null, tick: sample?.tick ?? null, sampledAt: sample?.sampledAt ?? null,
    available: false, reason, walk: null, ageInTicks: sample?.ageInTicks ?? null,
    animationParityVerified: false, bodyYawAvailable: false, attackAnimationAvailable: false }
}

export function createNativePlayerMotionTracker () {
  let previous = null, state = emptyState('NATIVE_PLAYER_MOTION_WAITING')
  const baseline = (sample, reason) => { previous = sample; state = emptyState(reason, sample); return copyState(state) }
  return {
    record (input = {}) {
      const { epoch, tick, sampledAt, pose, ageInTicks = null, discontinuity = null } = input
      if (!safeCount(epoch) || !safeCount(tick) || !Number.isFinite(sampledAt) || sampledAt < 0 ||
        !pose || ![pose.x, pose.y, pose.z].every(Number.isFinite) ||
        (ageInTicks !== null && (!safeCount(ageInTicks) || ageInTicks > 2147483647)) ||
        (discontinuity !== null && !RESET_SIGNALS.has(discontinuity))) {
        previous = null; state = emptyState('NATIVE_PLAYER_MOTION_INPUT_INVALID'); return copyState(state)
      }
      const sample = { epoch, tick, sampledAt, pose: { x: pose.x, y: pose.y, z: pose.z }, ageInTicks }
      if (discontinuity !== null) return baseline(sample, `NATIVE_PLAYER_MOTION_RESET_${discontinuity.toUpperCase()}`)
      if (!previous) return baseline(sample, 'NATIVE_PLAYER_MOTION_BASELINE')
      if (epoch !== previous.epoch) return baseline(sample, 'NATIVE_PLAYER_MOTION_EPOCH_CHANGED')
      if (tick !== previous.tick + 1) return baseline(sample, 'NATIVE_PLAYER_MOTION_TICK_GAP')
      if (sampledAt < previous.sampledAt) return baseline(sample, 'NATIVE_PLAYER_MOTION_CLOCK_REGRESSED')
      // Players are not FlyingAnimal: calculateEntityAnimation(false) ignores Y.
      // No guessed teleport-distance threshold: the native teleport/lifecycle
      // must explicitly signal discontinuity, instead of interpreting fast travel.
      const dx = pose.x - previous.pose.x, dz = pose.z - previous.pose.z
      const distance = F(Math.sqrt(dx * dx + dz * dz))
      if (!Number.isFinite(distance)) { previous = null; state = emptyState('NATIVE_PLAYER_MOTION_DISTANCE_INVALID'); return copyState(state) }
      const target = Math.min(mul(distance, 4), 1), speedOld = state.walk?.speed ?? 0
      const speed = add(speedOld, mul(sub(target, speedOld), SMOOTHING))
      const position = add(state.walk?.position ?? 0, speed)
      state = { schemaVersion: 1, source: NATIVE_PLAYER_MOTION_SOURCE, tickMs: NATIVE_PLAYER_TICK_MS,
        epoch, tick, sampledAt, available: true, reason: null, walk: { speedOld, speed, position }, ageInTicks,
        animationParityVerified: false, bodyYawAvailable: false, attackAnimationAvailable: false }
      previous = sample
      return copyState(state)
    },
    current () { return copyState(state) },
    reset (reason = 'connection') {
      if (!RESET_SIGNALS.has(reason)) throw Error('NATIVE_PLAYER_MOTION_RESET_INVALID')
      previous = null; state = emptyState(`NATIVE_PLAYER_MOTION_RESET_${reason.toUpperCase()}`); return copyState(state)
    }
  }
}

export function renderNativePlayerMotion (motion, now) {
  const unavailable = reason => ({ available: false, reason, limbs: null, skinview: null, frozen: true,
    bobAvailable: false, animationParityVerified: false, bodyYawAvailable: false, attackAnimationAvailable: false })
  if (motion?.available !== true) return unavailable(motion?.reason || 'NATIVE_PLAYER_MOTION_UNAVAILABLE')
  if (motion.schemaVersion !== 1 || motion.source !== NATIVE_PLAYER_MOTION_SOURCE || motion.tickMs !== NATIVE_PLAYER_TICK_MS ||
    !safeCount(motion.epoch) || !safeCount(motion.tick) || !Number.isFinite(motion.sampledAt) || motion.sampledAt < 0 ||
    !Number.isFinite(now) || now < motion.sampledAt || !motion.walk ||
    ![motion.walk.speedOld, motion.walk.speed, motion.walk.position].every(float) ||
    [motion.walk.speedOld, motion.walk.speed].some(value => value < 0 || value > 1) || motion.walk.position < 0 ||
    (motion.ageInTicks !== null && (!safeCount(motion.ageInTicks) || motion.ageInTicks > 2147483647))) {
    return unavailable('NATIVE_PLAYER_MOTION_RENDER_INVALID')
  }
  // At most interpolate this known tick. Never integrate another step from
  // browser time, extrapolate missing ticks, or keep walking after disconnect.
  const elapsed = now - motion.sampledAt, partialTick = F(Math.min(elapsed / NATIVE_PLAYER_TICK_MS, 1))
  const speed = add(motion.walk.speedOld, mul(partialTick, sub(motion.walk.speed, motion.walk.speedOld)))
  const position = sub(motion.walk.position, mul(motion.walk.speed, sub(1, partialTick)))
  const ageInTicks = motion.ageInTicks === null ? null : add(motion.ageInTicks, partialTick)
  return { available: true, reason: null, epoch: motion.epoch, tick: motion.tick, partialTick,
    frozen: elapsed >= NATIVE_PLAYER_TICK_MS, sampledAt: motion.sampledAt, speed, position,
    ...nativeHumanoidWalkAngles({ position, speed, ageInTicks }), bodyYawAvailable: false, attackAnimationAvailable: false }
}
