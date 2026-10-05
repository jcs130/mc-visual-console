// YSM 2.6.5 Default Boy only. Clips are read from the SHA-verified original
// main.animation.json. Default player predicates: oo000ooO0O00oo0OO0ooO000.
// This is a bounded browser port, not complete Java/native animation parity.
import { renderNativePlayerMotion } from './native-player-motion.js'

const F = Math.fround
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const known = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key))
const finite = value => Number.isFinite(value) && Number.isFinite(F(value))
const count = value => Number.isSafeInteger(value) && value >= 0
const vector = value => Array.isArray(value) && value.length === 3
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export const NATIVE_YSM_MOTION_SOURCE = 'same_player_server_tick'
export const NATIVE_YSM_MAIN_CLIPS = Object.freeze(['idle', 'walk', 'run', 'jump'])
export const NATIVE_YSM_ANIMATION_SUPPORT = Object.freeze({
  scope: 'YSM_2.6.5_Default_Boy_main_clips', mainClips: NATIVE_YSM_MAIN_CLIPS,
  notice: 'YSM 原关键帧动画预览：移动、视线与眨眼；装备和其他姿势未适配，客户端一致性未验',
  sourceRules: 'YSM_2.6.5_oo000ooO0O00oo0OO0ooO000_default_player_predicates',
  nativeMainTransitionSeconds: .1, channelTransformParityVerified: false, transitionRenderingAvailable: false,
  animationParityVerified: false, completeEntityParityVerified: false
})

// Exact expressions occurring in this model. Unknown expressions are errors;
// there is no eval, implicit query default, or general-purpose Molang fallback.
function scalar (value) {
  if (finite(value) && Math.abs(value) <= 2048) return () => F(value)
  const expressions = {
    'ysm.is_close_eyes ? -1 : 0': query => query.isCloseEyes ? -1 : 0,
    'ysm.is_close_eyes ? 0 : 1': query => query.isCloseEyes ? 0 : 1,
    'ysm.head_yaw/180': query => F(query.headYaw / 180),
    'ysm.head_pitch/360': query => F(query.headPitch / 360)
  }
  if (typeof value !== 'string' || !Object.hasOwn(expressions, value)) throw Error('NATIVE_YSM_MOLANG_UNSUPPORTED')
  const read = expressions[value]
  return query => {
    if (!query || (value.includes('is_close_eyes') ? typeof query.isCloseEyes !== 'boolean' :
      !finite(value.includes('head_yaw') ? query.headYaw : query.headPitch))) throw Error('NATIVE_YSM_MOLANG_INPUT_UNAVAILABLE')
    return read(query)
  }
}

function compileVector (value) {
  if (!vector(value)) throw Error('NATIVE_YSM_KEYFRAME_UNSUPPORTED')
  return value.map(scalar)
}

function compileTrack (value) {
  if (vector(value)) {
    const components = compileVector(value)
    return (_time, query) => components.map(component => component(query))
  }
  if (!object(value) || Object.keys(value).length === 0 || Object.keys(value).length > 64) throw Error('NATIVE_YSM_KEYFRAME_UNSUPPORTED')
  const frames = Object.entries(value).map(([key, frame]) => {
    if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(key) || !finite(Number(key)) || Number(key) > 60) throw Error('NATIVE_YSM_KEYFRAME_UNSUPPORTED')
    // The supported original clips use array keyframes and linear interpolation.
    // Catmull-Rom / pre-post frames in other poses are deliberately unsupported.
    return { time: Number(key), value: compileVector(frame) }
  }).sort((a, b) => a.time - b.time)
  if (frames.some((frame, index) => index && frame.time === frames[index - 1].time)) throw Error('NATIVE_YSM_KEYFRAME_UNSUPPORTED')
  const read = (frame, query) => frame.value.map(component => component(query))
  return (time, query) => {
    if (time <= frames[0].time) return read(frames[0], query)
    const last = frames.at(-1)
    if (time >= last.time) return read(last, query)
    const right = frames.findIndex(frame => frame.time >= time), a = frames[right - 1], b = frames[right]
    const from = read(a, query), to = read(b, query), weight = F((time - a.time) / (b.time - a.time))
    return from.map((component, axis) => F(component + F(F(to[axis] - component) * weight)))
  }
}

export function compileNativeYsmAnimations (definition, boneNames) {
  if (!known(definition, ['format_version', 'animations']) || definition.format_version !== '1.8.0' || !object(definition.animations)) throw Error('NATIVE_YSM_ANIMATION_SOURCE_UNSUPPORTED')
  const bones = new Set(boneNames), clips = new Map()
  for (const name of [...NATIVE_YSM_MAIN_CLIPS, 'parallel0', 'parallel1']) {
    const source = definition.animations[name]
    if (!known(source, ['loop', 'animation_length', 'bones']) || !object(source.bones) || Object.keys(source.bones).length > 64 ||
        (source.loop !== undefined && typeof source.loop !== 'boolean') ||
        (source.animation_length !== undefined && (!finite(source.animation_length) || source.animation_length <= 0 || source.animation_length > 60))) throw Error(`NATIVE_YSM_ANIMATION_SOURCE_UNSUPPORTED:${name}`)
    const tracks = Object.entries(source.bones).map(([bone, channels]) => {
      if (!bones.has(bone) || !known(channels, ['rotation', 'position', 'scale'])) throw Error('NATIVE_YSM_ANIMATION_BONE_UNSUPPORTED')
      return [bone, Object.fromEntries(Object.entries(channels).map(([channel, values]) => [channel, compileTrack(values)]))]
    })
    // Native default player registers all four main choices as LOOP, including
    // Boy idle whose JSON omits loop. Do not substitute the default model clip.
    clips.set(name, { name, length: source.animation_length ?? 0, loop: source.loop === true || NATIVE_YSM_MAIN_CLIPS.includes(name), tracks, source })
  }
  return clips
}

export function sampleNativeYsmClip (clips, name, seconds, query = null) {
  const clip = clips.get(name)
  if (!clip || !finite(seconds) || seconds < 0) throw Error('NATIVE_YSM_CLIP_UNAVAILABLE')
  const time = clip.length ? clip.loop ? seconds % clip.length : Math.min(seconds, clip.length) : 0
  return { name, time, bones: Object.fromEntries(clip.tracks.map(([bone, channels]) => [bone,
    Object.fromEntries(Object.entries(channels).map(([channel, read]) => [channel, read(time, query)]))])) }
}

const unavailable = (reason, extra = {}) => ({ available: false, reason, clip: null, frozen: true,
  scope: NATIVE_YSM_ANIMATION_SUPPORT.scope, channelTransformParityVerified: false,
  animationParityVerified: false, completeEntityParityVerified: false, ...extra })

// Higher-priority original controller states are rejected before the four
// supported choices. A missing flag never silently becomes false.
export function selectNativeYsmMainClip (motion, walkSpeed) {
  const flags = ['onGround', 'sprinting', 'crouching', 'passenger', 'swimming', 'inWater', 'fallFlying',
    'sleeping', 'climbing', 'inLava', 'alive', 'usingItem', 'swinging', 'spinAttack', 'flying', 'deadOrDying']
  if (!motion || flags.some(key => typeof motion[key] !== 'boolean') ||
      !count(motion.hurtTime) || !count(motion.deathTime) || typeof motion.pose !== 'string') return unavailable('NATIVE_YSM_CONTROLLER_INPUT_UNAVAILABLE')
  // PlayerRenderMotion exports the actual native Pose serialized in lowercase.
  const pose = motion.pose
  const unsupported = name => unavailable(`NATIVE_YSM_POSE_UNSUPPORTED:${name}`, { selectedNativeState: name })
  if (motion.deadOrDying || !motion.alive || motion.deathTime > 0) return unsupported('death')
  if (motion.spinAttack) return unsupported('riptide')
  if (motion.sleeping || pose === 'sleeping') return unsupported('sleep')
  if (motion.swimming) return unsupported('swim')
  if (pose === 'swimming') return unsupported('climb_or_climbing')
  if (motion.climbing) return unsupported('ladder')
  if (motion.flying) return unsupported('fly')
  if (motion.fallFlying || pose === 'fall_flying') return unsupported('elytra_fly')
  if (motion.inWater && !motion.onGround) return unsupported('swim_stand')
  if (motion.hurtTime > 0) return unsupported('attacked')
  if (motion.passenger) return unsupported('passenger')
  if (motion.inLava) return unsupported('in_lava')
  // Hold/use/swing controllers are a separate native layer. Do not label a
  // base clip as a complete pose while one of these actions is in progress.
  if (motion.usingItem) return unsupported('use_item')
  if (motion.swinging) return unsupported('swing')
  if (!['standing', 'crouching'].includes(pose)) return unsupported(pose)
  if (!motion.onGround && !motion.inWater) return { available: true, clip: 'jump' }
  if (motion.crouching || pose === 'crouching') return unsupported('sneak_or_sneaking')
  if (motion.sprinting && motion.onGround) return { available: true, clip: 'run' }
  if (!finite(walkSpeed) || walkSpeed < 0 || walkSpeed > 1) return unavailable('NATIVE_YSM_WALK_INPUT_UNAVAILABLE')
  return { available: true, clip: motion.onGround && walkSpeed > F(.05) ? 'walk' : 'idle' }
}

export function nativeYsmMotionInput (input, playerUuid) {
  const motion = input?.self?.motion, now = input?.now
  if (!UUID.test(playerUuid ?? '') || motion?.playerUuid?.toLowerCase() !== playerUuid.toLowerCase() ||
      motion?.source !== NATIVE_YSM_MOTION_SOURCE || motion.schemaVersion !== 1 || motion.available !== true ||
      motion.sampleIntervalMs !== 250 || !count(motion.tickCount) || !count(motion.gameTime) ||
      !finite(motion.sampledAt) || motion.sampledAt < 0 || !finite(now) || now < motion.sampledAt ||
      !finite(input?.dt) || input.dt < 0 || input.dt > .1) return unavailable('NATIVE_YSM_MOTION_INPUT_UNAVAILABLE')
  if (now - motion.sampledAt > motion.sampleIntervalMs * 2) return unavailable('NATIVE_YSM_MOTION_STALE')
  const walk = renderNativePlayerMotion(input.current?.motion, now)
  const selected = selectNativeYsmMainClip(motion, walk.available ? walk.speed : null)
  if (!selected.available) return selected
  // Even a run/jump that needs no walk-speed predicate must not integrate time
  // while the same-connection physics stream is missing or frozen.
  if (!walk.available) return unavailable('NATIVE_YSM_PHYSICS_TICK_UNAVAILABLE')
  if (walk.frozen) return unavailable('NATIVE_YSM_PHYSICS_WINDOW_FINISHED', { preserveKnownPose: true, motion, walk, now })
  return { ...selected, motion, walk, now, dt: input.dt }
}

const wrapDegrees = value => ((value + 180) % 360 + 360) % 360 - 180
const lerp = (partial, before, after) => F(F(before) + F(F(after - before) * partial))
const rotLerp = (partial, before, after) => F(F(before) + F(F(wrapDegrees(after - before)) * partial))
const DEG = F(.017453292)

// Locked YSM Oo000O00O0OOoO00OOOO000O.is_close_eyes. Use signed Java UUID
// least-significant long, including Long.MIN_VALUE's Math.abs overflow.
// The clock is the browser animatable's clock, not server entity age. Its
// lifecycle phase is not asserted equal to a separately running Java client.
export function nativeYsmEyeQuery (playerUuid, animationTicks, sleeping) {
  if (!UUID.test(playerUuid ?? '') || !finite(animationTicks) || animationTicks < 0 || typeof sleeping !== 'boolean') throw Error('NATIVE_YSM_EYE_INPUT_UNAVAILABLE')
  const least = BigInt.asIntN(64, BigInt('0x' + playerUuid.replaceAll('-', '').slice(16)))
  const minimum = -(1n << 63n), absolute = least === minimum ? minimum : least < 0 ? -least : least
  const phase = F(F(animationTicks) + Number(absolute % 10n)) % 90
  return { isCloseEyes: sleeping || (85 < phase && phase < 90), blinkPhase: phase,
    blinkPhaseSource: 'browser_YSM_animatable_clock', blinkPhaseParityVerified: false }
}

export function nativeYsmHeadQuery (motion, partialTick) {
  const angles = ['bodyYaw', 'previousBodyYaw', 'headYaw', 'previousHeadYaw', 'pitch', 'previousPitch']
  if (!motion || angles.some(key => !finite(motion[key])) || !finite(partialTick) || partialTick < 0 || partialTick > 1 || motion.passenger !== false) throw Error('NATIVE_YSM_HEAD_INPUT_UNAVAILABLE')
  const body = rotLerp(partialTick, motion.previousBodyYaw, motion.bodyYaw)
  const head = rotLerp(partialTick, motion.previousHeadYaw, motion.headYaw)
  return { bodyYaw: body, bodyRotationRadians: F(F(180 - body) * DEG),
    headYaw: F(-Math.max(-85, Math.min(85, wrapDegrees(head - body)))),
    headPitch: F(-lerp(partialTick, motion.previousPitch, motion.pitch)), headPhaseParityVerified: false }
}

// Original native renderer translates bone positions (-X,+Y,+Z)/16 and
// rotates ZYX. Our existing raw Bedrock frame is reflected by (-1,-1,+1),
// so a source position delta is (+X,-Y,+Z)/16 in this inner frame.
// Native ooOOO0oOOo0oOo0000o0o0Oo applies initial+animated rotations. For this
// finite browser port, source channels use the existing Bedrock frame;
// YSM-core's JSON-to-runtime signs remain unverified, so parity stays false.
export function applyNativeYsmBonePose (model, poses, headQuery = null) {
  model.reset()
  for (const pose of poses) {
    for (const [name, channels] of Object.entries(pose.bones)) {
      const bone = model.bones.get(name)
      if (!bone) throw Error('NATIVE_YSM_ANIMATION_BONE_UNSUPPORTED')
      if (channels.rotation) {
        bone.rotation.x += F(channels.rotation[0] * DEG)
        bone.rotation.y += F(channels.rotation[1] * DEG)
        bone.rotation.z += F(channels.rotation[2] * DEG)
      }
      if (channels.position) {
        bone.position.x += F(channels.position[0] / 16)
        bone.position.y -= F(channels.position[1] / 16)
        bone.position.z += F(channels.position[2] / 16)
      }
      if (channels.scale) {
        bone.scale.x *= channels.scale[0]; bone.scale.y *= channels.scale[1]; bone.scale.z *= channels.scale[2]
      }
    }
  }
  // O0OOoooOOoOo0O00O0oOoo0O adds native head X/Y to its head bone chain.
  // The source model's AllHead is used by this bounded port. Convert the addition into the inner frame;
  // resetting above avoids accumulating the look rotation every RAF frame.
  if (headQuery) {
    const head = model.bones.get('AllHead')
    if (!head || ![headQuery.headYaw, headQuery.headPitch].every(finite)) throw Error('NATIVE_YSM_HEAD_INPUT_UNAVAILABLE')
    head.rotation.x -= F(headQuery.headPitch * Math.PI / 180)
    head.rotation.y -= F(headQuery.headYaw * Math.PI / 180)
  }
}

export function createNativeYsmAnimation (model, definition, playerUuid) {
  const clips = compileNativeYsmAnimations(definition, model.bones.keys())
  let currentClip = null, entrySeconds = 0, clipSeconds = 0, animationTicks = 0, physicsEpoch = null, previousNow = null, tickCount = null, previousPhysicsTime = null
  let lastObservation = null
  let state = unavailable('NATIVE_YSM_MOTION_WAITING')
  const reset = reason => {
    currentClip = null; entrySeconds = 0; clipSeconds = 0; animationTicks = 0; physicsEpoch = null; previousNow = null; tickCount = null; previousPhysicsTime = null
    lastObservation = null
    model.reset(); state = unavailable(reason); return state
  }
  return {
    apply (input) {
      const value = nativeYsmMotionInput(input, playerUuid)
      if (!value.available) {
        // Reaching the end of an observed 50ms interpolation window freezes
        // the last known pose. It is not a lifecycle reset or a new clip entry.
        if (value.preserveKnownPose) {
          if (physicsEpoch === null || value.walk.epoch !== physicsEpoch) return reset('NATIVE_YSM_PHYSICS_EPOCH_CHANGED')
          if (!lastObservation || value.now < lastObservation.now || value.motion.tickCount < lastObservation.tickCount) return reset('NATIVE_YSM_MOTION_CLOCK_REGRESSED')
          const physicsTime = value.walk.tick + value.walk.partialTick
          if (physicsTime < lastObservation.physicsTime) return reset('NATIVE_YSM_PHYSICS_CLOCK_REGRESSED')
          // Keep a monotonic observation guard without consuming the frozen
          // window as animation time or changing the last rendered pose.
          lastObservation = { now: value.now, tickCount: value.motion.tickCount, physicsTime }
          state = { ...state, available: false, reason: value.reason, frozen: true }; return state
        }
        return reset(value.reason)
      }
      if ((previousNow !== null && value.now < previousNow) ||
          (tickCount !== null && value.motion.tickCount < tickCount) ||
          (lastObservation && (value.now < lastObservation.now || value.motion.tickCount < lastObservation.tickCount))) return reset('NATIVE_YSM_MOTION_CLOCK_REGRESSED')
      if (physicsEpoch !== value.walk.epoch) {
        currentClip = null; entrySeconds = 0; clipSeconds = 0; animationTicks = 0; previousNow = null; previousPhysicsTime = null
        lastObservation = null
        physicsEpoch = value.walk.epoch
      }
      // First frame / a new stream starts at the original animatable baseline
      // zero. Only fresh same-player ticks allow the bounded RAF clock to run.
      const physicsTime = value.walk.tick + value.walk.partialTick
      if ((previousPhysicsTime !== null && physicsTime < previousPhysicsTime) ||
          (lastObservation && physicsTime < lastObservation.physicsTime)) return reset('NATIVE_YSM_PHYSICS_CLOCK_REGRESSED')
      // dt alone cannot invent animation time. Bound it by the actual received
      // physics tick + known partial tick and elapsed wall time. Duplicate
      // renders of one observation cannot advance the animation indefinitely.
      const delta = previousNow === null ? 0 : Math.min(value.dt,
        Math.max(0, physicsTime - previousPhysicsTime) / 20, Math.max(0, value.now - previousNow) / 1000)
      animationTicks = F(animationTicks + F(delta * 20))
      if (currentClip !== value.clip) { currentClip = value.clip; entrySeconds = 0 } else entrySeconds = F(entrySeconds + delta)
      // Native main begins with a 2-tick transition whose new clip anim_time
      // stays zero. Keep this original clip clock rule without inventing the
      // unported transition blend, interruption or inactive-bone recovery.
      clipSeconds = Math.max(0, F(entrySeconds - F(NATIVE_YSM_ANIMATION_SUPPORT.nativeMainTransitionSeconds)))
      previousNow = value.now; previousPhysicsTime = physicsTime; tickCount = value.motion.tickCount
      lastObservation = { now: value.now, tickCount: value.motion.tickCount, physicsTime }
      try {
        const head = nativeYsmHeadQuery(value.motion, value.walk.partialTick)
        const eye = nativeYsmEyeQuery(playerUuid, animationTicks, value.motion.sleeping)
        const query = { ...head, ...eye }
        const base = sampleNativeYsmClip(clips, currentClip, clipSeconds)
        applyNativeYsmBonePose(model, [base, sampleNativeYsmClip(clips, 'parallel0', 0, query), sampleNativeYsmClip(clips, 'parallel1', 0, query)], head)
        state = { available: true, reason: null, scope: NATIVE_YSM_ANIMATION_SUPPORT.scope, clip: currentClip,
          clipTime: base.time, entryTime: entrySeconds, beginningTransition: entrySeconds < F(.1),
          animationTicks, playerUuid, source: NATIVE_YSM_MOTION_SOURCE, tick: value.walk.tick,
          nativeTickCount: value.motion.tickCount, physicsEpoch, sampledAt: value.motion.sampledAt, frozen: false,
          bodyYaw: head.bodyYaw, bodyRotationRadians: head.bodyRotationRadians,
          bodyOrientationSource: 'same_player_server_tick.bodyYaw',
          headYaw: head.headYaw, headPitch: head.headPitch, isCloseEyes: eye.isCloseEyes,
          blinkPhaseSource: eye.blinkPhaseSource, blinkPhaseParityVerified: false, headPhaseParityVerified: false,
          channelTransformParityVerified: false, transitionRenderingAvailable: false,
          animationParityVerified: false, completeEntityParityVerified: false }
        return state
      } catch (error) { return reset(error.message) }
    },
    current: () => state,
    reset: () => reset('NATIVE_YSM_MOTION_RESET')
  }
}
