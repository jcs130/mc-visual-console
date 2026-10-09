import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as THREE from 'three'
import { NativeAssetReader } from '../../src/native-viewer/model-loader.js'
import { createNativeYsmPlayerActor, NATIVE_YSM_ASSETS } from '../../src/native-viewer/native-player-ysm.js'
import { NATIVE_YSM_JAR_SHA256, NATIVE_YSM_SOURCE } from '../../src/native-viewer/native-ysm-state.js'
import { compileNativeYsmAnimations, sampleNativeYsmClip, selectNativeYsmMainClip, nativeYsmHeadQuery,
  nativeYsmEyeQuery, nativeYsmMotionInput, createNativeYsmAnimation } from '../../src/native-viewer/native-ysm-animation.js'
import { createNativeBedrockModel } from '../../src/native-viewer/native-entity-model-bedrock.js'
import { NATIVE_YSM_MODELS } from '../../src/native-viewer/native-ysm-models.js'

const UUID = '01234567-89ab-cdef-0123-456789abcdef'
const motion = patch => ({ available: true, schemaVersion: 1, source: 'same_player_server_tick', playerUuid: UUID,
  sampledAt: 1000, sampleIntervalMs: 250, tickCount: 20, gameTime: 20,
  bodyYaw: 10, previousBodyYaw: 0, headYaw: 40, previousHeadYaw: 20, pitch: 20, previousPitch: 10,
  onGround: true, sprinting: false, crouching: false, passenger: false, swimming: false, inWater: false,
  fallFlying: false, sleeping: false, climbing: false, inLava: false, alive: true, usingItem: false,
  swinging: false, spinAttack: false, flying: false, deadOrDying: false, hurtTime: 0, deathTime: 0, pose: 'standing', ...patch })
const physics = patch => ({ available: true, schemaVersion: 1, source: 'same_player_physics_tick', tickMs: 50,
  epoch: 1, tick: 1, sampledAt: 1000, ageInTicks: null, walk: { speedOld: .4, speed: .4, position: .4 }, ...patch })
const input = (now = 1000, dt = 0, nativePatch = {}, physicsPatch = {}) => ({ self: { motion: motion(nativePatch) },
  current: { motion: physics(physicsPatch) }, now, dt })
const close = (actual, expected, tolerance = 1e-5) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`)

test('native lowercase standing predicates select original idle/walk/run/jump, with exact .05f threshold', () => {
  assert.equal(selectNativeYsmMainClip(motion(), .05).clip, 'idle')
  assert.equal(selectNativeYsmMainClip(motion(), .051).clip, 'walk')
  assert.equal(selectNativeYsmMainClip(motion({ sprinting: true }), 0).clip, 'run')
  assert.equal(selectNativeYsmMainClip(motion({ onGround: false }), null).clip, 'jump')
  assert.equal(selectNativeYsmMainClip(motion({ pose: 'STANDING' }), .4).available, false)
  assert.match(selectNativeYsmMainClip(motion({ onGround: undefined }), .4).reason, /INPUT_UNAVAILABLE/)
})

test('native higher priority poses and missing flags refuse a successful base-pose claim', () => {
  const cases = [[{ deadOrDying: true, sprinting: true }, 'death'], [{ spinAttack: true }, 'riptide'],
    [{ pose: 'sleeping' }, 'sleep'], [{ swimming: true }, 'swim'], [{ pose: 'swimming' }, 'climb_or_climbing'],
    [{ climbing: true }, 'ladder'], [{ flying: true }, 'fly'], [{ fallFlying: true }, 'elytra_fly'],
    [{ inWater: true, onGround: false }, 'swim_stand'], [{ hurtTime: 1 }, 'attacked'], [{ passenger: true }, 'passenger'],
    [{ usingItem: true }, 'use_item'], [{ swinging: true }, 'swing'], [{ pose: 'crouching' }, 'sneak_or_sneaking'],
    [{ pose: 'digging' }, 'digging']]
  for (const [patch, expected] of cases) {
    const result = selectNativeYsmMainClip(motion(patch), .4)
    assert.equal(result.available, false); assert.equal(result.selectedNativeState, expected)
    assert.equal(result.animationParityVerified, false)
  }
  assert.match(selectNativeYsmMainClip(motion(), null).reason, /WALK_INPUT/)
})

test('live animation contract requires native source, UUID, freshness, real physics and bounded dt', () => {
  assert.equal(nativeYsmMotionInput(input(), UUID).clip, 'walk')
  for (const patch of [{ source: 'proxy' }, { playerUuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
    { sampleIntervalMs: 50 }, { available: false }, { tickCount: NaN }]) {
    assert.equal(nativeYsmMotionInput(input(1000, 0, patch), UUID).available, false)
  }
  assert.match(nativeYsmMotionInput(input(1501, .01), UUID).reason, /STALE/)
  assert.equal(nativeYsmMotionInput(input(1000, .101), UUID).available, false)
  assert.equal(nativeYsmMotionInput(input(1000, 0, {}, { available: false }), UUID).available, false)
  assert.equal(nativeYsmMotionInput(input(1050, .01), UUID).preserveKnownPose, true)
})

test('original head query preserves wrapped yaw, clamp and negative pitch rather than assigning body yaw', () => {
  const result = nativeYsmHeadQuery(motion(), .5)
  assert.equal(result.headYaw, -25); assert.equal(result.headPitch, -15)
  assert.equal(nativeYsmHeadQuery(motion({ headYaw: 170, previousHeadYaw: 170, bodyYaw: -170, previousBodyYaw: -170 }), 0).headYaw, 20)
  assert.equal(nativeYsmHeadQuery(motion({ headYaw: 180, previousHeadYaw: 180, bodyYaw: 0, previousBodyYaw: 0 }), 0).headYaw, 85)
  assert.throws(() => nativeYsmHeadQuery(motion({ passenger: true }), 0), /HEAD_INPUT/)
  assert.throws(() => nativeYsmHeadQuery(motion({ previousBodyYaw: undefined }), 0), /HEAD_INPUT/)
})

test('original blink rule uses animatable clock, strict interval and signed Java UUID long boundary', () => {
  const one = '00000000-0000-0000-0000-000000000001'
  assert.equal(nativeYsmEyeQuery(one, 84, false).isCloseEyes, false)
  assert.equal(nativeYsmEyeQuery(one, 84.1, false).isCloseEyes, true)
  assert.equal(nativeYsmEyeQuery(one, 89, false).isCloseEyes, false)
  assert.equal(nativeYsmEyeQuery(one, 1, true).isCloseEyes, true)
  const minimum = nativeYsmEyeQuery('00000000-0000-0000-8000-000000000000', 0, false)
  assert.equal(minimum.blinkPhase, -8); assert.equal(minimum.isCloseEyes, false)
  assert.equal(minimum.blinkPhaseSource, 'browser_YSM_animatable_clock'); assert.equal(minimum.blinkPhaseParityVerified, false)
})

test('native body rotation and relative head query remain distinct at body0/head30 and across +/-180 degrees', () => {
  const standing = nativeYsmHeadQuery(motion({ bodyYaw: 0, previousBodyYaw: 0, headYaw: 30, previousHeadYaw: 30,
    pitch: 0, previousPitch: 0 }), .5)
  assert.equal(standing.bodyYaw, 0); close(standing.bodyRotationRadians, Math.PI)
  assert.equal(standing.headYaw, -30); assert.equal(standing.headPitch, -0)
  const forward = nativeYsmHeadQuery(motion({ previousBodyYaw: 178, bodyYaw: -178, previousHeadYaw: 179, headYaw: -175 }), .5)
  assert.equal(forward.bodyYaw, 180); assert.equal(forward.headYaw, -2); assert.equal(forward.bodyRotationRadians, 0)
  const end = nativeYsmHeadQuery(motion({ previousBodyYaw: 178, bodyYaw: -178, previousHeadYaw: 179, headYaw: -175 }), 1)
  assert.equal(end.bodyYaw, 182); assert.equal(end.headYaw, -3); close(end.bodyRotationRadians, -2 * Math.PI / 180)
  const reverse = nativeYsmHeadQuery(motion({ previousBodyYaw: -178, bodyYaw: 178, previousHeadYaw: -179, headYaw: 175 }), .5)
  assert.equal(reverse.bodyYaw, -180); assert.equal(reverse.headYaw, 2); close(reverse.bodyRotationRadians, 2 * Math.PI)
})

async function originals () {
  // This suite is intentionally required to read the locked original assets.
  // Omitting the private fixture directory is an actionable test error, not a skip.
  assert.ok(process.env.NATIVE_YSM_ASSET_DIR, 'Set NATIVE_YSM_ASSET_DIR to the verified native YSM export')
  const directory = process.env.NATIVE_YSM_ASSET_DIR
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'native-assets.json'), 'utf8'))
  const reader = new NativeAssetReader(manifest, filename => fs.readFile(path.join(directory, filename)))
  const geometry = await reader.json(NATIVE_YSM_ASSETS.model), animation = await reader.json(NATIVE_YSM_ASSETS.animation)
  return { reader, geometry, animation }
}

test('Steve/Alex consume their own original clips; absent native layers or Alex idle are never borrowed', async () => {
  const { reader } = await originals()
  for (const modelId of ['misc/1_alex', 'misc/2_steve']) {
    const profile = NATIVE_YSM_MODELS[modelId]
    const geometry = await reader.json(profile.assets.model), animation = await reader.json(profile.assets.animation)
    const model = createNativeBedrockModel(geometry, new THREE.MeshLambertMaterial())
    const clips = compileNativeYsmAnimations(animation, model.bones.keys(), { modelId })
    assert.equal(clips.has('parallel0'), false); assert.equal(clips.has('parallel1'), false)
    assert.deepEqual(sampleNativeYsmClip(clips, 'walk', 0).bones.RightArm.rotation,
      animation.animations.walk.bones.RightArm.rotation['0.0'])
    const animator = createNativeYsmAnimation(model, animation, UUID, { modelId })
    assert.equal(animator.apply(input()).clip, 'walk')
    const idle = animator.apply(input(1000, 0, {}, { walk: { speedOld: 0, speed: 0, position: 0 } }))
    if (modelId === 'misc/1_alex') {
      assert.equal(idle.available, false); assert.match(idle.reason, /CLIP_NOT_PRESENT:idle/)
      assert.equal(clips.has('idle'), false)
    } else assert.equal(idle.clip, 'idle')
    const corrupted = structuredClone(animation); corrupted.animations.parallel0 = { bones: {} }
    assert.throws(() => compileNativeYsmAnimations(corrupted, model.bones.keys(), { modelId }), /SOURCE_UNSUPPORTED:parallel0/)
    model.dispose()
  }
})

test('real SHA-verified Default Boy clips sample original authored joints and loop boundaries', async () => {
  const { geometry, animation } = await originals()
  const clips = compileNativeYsmAnimations(animation, geometry['minecraft:geometry'][0].bones.map(bone => bone.name))
  assert.equal(clips.get('walk').length, 1); assert.equal(clips.get('run').length, .6667); assert.equal(clips.get('jump').length, .75)
  const walk = sampleNativeYsmClip(clips, 'walk', .5)
  assert.deepEqual(walk.bones.RightArm.rotation, [15, 0, 2]); assert.deepEqual(walk.bones.LeftArm.rotation, [-15, 0, -2])
  close(walk.bones.LeftLeg.rotation[0], 21.55)
  const start = animation.animations.walk.bones.LeftArm.rotation['0.0'][0], end = animation.animations.walk.bones.LeftArm.rotation['0.0833'][0]
  close(sampleNativeYsmClip(clips, 'walk', .04165).bones.LeftArm.rotation[0], (start + end) / 2)
  assert.deepEqual(sampleNativeYsmClip(clips, 'walk', 1).bones, sampleNativeYsmClip(clips, 'walk', 0).bones)
  close(sampleNativeYsmClip(clips, 'run', .3333).bones.RightArm.rotation[0], 73.66)
  assert.deepEqual(sampleNativeYsmClip(clips, 'jump', .75).bones, sampleNativeYsmClip(clips, 'jump', 0).bones)
  const eyes = sampleNativeYsmClip(clips, 'parallel1', 0, { headYaw: 36, headPitch: -36 })
  close(eyes.bones.LeftEyesBase.position[0], .2); close(eyes.bones.LeftEyesBase.position[1], -.1)
  assert.deepEqual(sampleNativeYsmClip(clips, 'parallel0', 0, { isCloseEyes: true }).bones.Eyelid.scale, [0, 0, 0])
  assert.throws(() => sampleNativeYsmClip(clips, 'swim', 0), /CLIP_UNAVAILABLE/)
})

test('unsupported keyframe modes, expressions, bones and duplicate times fail closed', async () => {
  const { geometry, animation } = await originals(), names = geometry['minecraft:geometry'][0].bones.map(bone => bone.name)
  for (const edit of [source => { source.animations.walk.bones.LeftArm.rotation['0.0'] = { post: [0, 0, 0], lerp_mode: 'catmullrom' } },
    source => { source.animations.parallel1.bones.LeftEyesBase.position[0] = 'unknown_query || 0' },
    source => { source.animations.walk.bones.FakeBone = { rotation: [0, 0, 0] } },
    source => { source.animations.walk.bones.LeftArm.rotation['0'] = [0, 0, 0] }]) {
    const edited = structuredClone(animation); edit(edited)
    assert.throws(() => compileNativeYsmAnimations(edited, names), /UNSUPPORTED/)
  }
})

test('production animator preserves phase across the 50ms tick boundary and stops invented/duplicate time', async () => {
  const { geometry, animation } = await originals(), material = new THREE.MeshBasicMaterial(), model = createNativeBedrockModel(geometry, material)
  try {
    const animator = createNativeYsmAnimation(model, animation, UUID)
    assert.equal(animator.apply(input()).clipTime, 0)
    const entering = animator.apply(input(1040, .04))
    close(entering.clipTime, 0); close(entering.entryTime, .04); assert.equal(entering.beginningTransition, true)
    close(animator.apply(input(1040, .1)).entryTime, .04) // same observation cannot consume an arbitrary dt
    const before = model.bones.get('LeftArm').rotation.clone()
    const boundary = animator.apply(input(1055, .015))
    assert.equal(boundary.available, false); assert.equal(boundary.clip, 'walk'); close(boundary.entryTime, .04)
    assert.equal(model.bones.get('LeftArm').rotation.x, before.x)
    const resumed = animator.apply(input(1060, .02, {}, { tick: 2, sampledAt: 1050 }))
    assert.equal(resumed.clip, 'walk'); close(resumed.entryTime, .06); close(resumed.clipTime, 0)
    assert.ok(resumed.animationTicks > 1)
    const running = animator.apply(input(1110, .05, {}, { tick: 3, sampledAt: 1100 }))
    close(running.clipTime, .01); assert.equal(running.beginningTransition, false)
    const epoch = animator.apply(input(1120, .01, {}, { epoch: 2, tick: 1, sampledAt: 1120 }))
    assert.equal(epoch.clipTime, 0); assert.equal(epoch.animationTicks, 0)
    assert.equal(animator.apply(input(1600, .1)).clip, null)
    assert.equal(animator.current().available, false)
  } finally { model.dispose(); material.dispose() }
})

test('production actor applies original joints, head and eyes and resets unsupported actions without vanilla substitutions', async () => {
  const { reader, animation } = await originals()
  const actor = await createNativeYsmPlayerActor(reader, { uuid: UUID,
    ysm: { available: true, installed: true, source: NATIVE_YSM_SOURCE, playerUuid: UUID, enabled: true, mandatory: true,
      ysmVersion: '2.6.5', jarSha256: NATIVE_YSM_JAR_SHA256, modelId: 'misc/3_default_boy', texture: 'blue' },
    loadTexture: async () => new THREE.Texture({ width: 128, height: 128 }) })
  try {
    assert.equal(actor.assetInfo.animationRenderingAvailable, true); assert.equal(actor.assetInfo.inventoryPreviewAvailable, true)
    assert.equal(actor.assetInfo.channelTransformParityVerified, false); assert.equal(actor.assetInfo.support.transitionRenderingAvailable, false)
    const state = actor.applyMotion(input())
    assert.equal(state.clip, 'walk'); assert.equal(state.available, true); assert.equal(actor.motionState(), state)
    const arm = actor.model.bones.get('LeftArm'), initial = actor.model.initial.get('LeftArm').rotation
    close(arm.rotation.x, initial.x + Math.fround(animation.animations.walk.bones.LeftArm.rotation['0.0'][0] * Math.fround(.017453292)))
    assert.equal(arm.rotation.order, 'ZYX')
    close(actor.model.bones.get('LeftEyesBase').position.x, actor.model.initial.get('LeftEyesBase').position.x + Math.fround(state.headYaw / 180) / 16)
    const headBefore = actor.model.bones.get('AllHead').rotation.clone()
    actor.applyMotion(input())
    assert.equal(actor.model.bones.get('AllHead').rotation.x, headBefore.x) // no accumulated head rotation
    assert.equal(actor.applyMotion(input(1010, .01, { sprinting: true })).clip, 'run')
    assert.equal(actor.applyMotion(input(1020, .01, { onGround: false })).clip, 'jump')
    const rejected = actor.applyMotion(input(1030, .01, { swimming: true, pose: 'swimming' }))
    assert.equal(rejected.available, false); assert.match(rejected.reason, /POSE_UNSUPPORTED:swim/)
    assert.equal(actor.model.bones.get('LeftArm').rotation.x, initial.x)
    assert.equal(actor.root.playerObject, undefined); assert.equal(actor.applyHeldItems({}).available, false)
  } finally { actor.dispose() }
})

test('frozen animator preserves only an existing same-epoch pose with monotonic observations', async () => {
  const { geometry, animation } = await originals(), material = new THREE.MeshBasicMaterial(), model = createNativeBedrockModel(geometry, material)
  try {
    const animator = createNativeYsmAnimation(model, animation, UUID)
    const prime = () => { animator.reset(); animator.apply(input()); return animator.apply(input(1040, .04)) }
    const initial = prime(), frozen = animator.apply(input(1060, .02))
    assert.equal(frozen.clip, initial.clip); assert.equal(frozen.bodyRotationRadians, initial.bodyRotationRadians)
    assert.equal(frozen.animationTicks, initial.animationTicks); assert.equal(frozen.entryTime, initial.entryTime)
    assert.equal(animator.apply(input(1070, .01)).clip, 'walk')
    // A new epoch whose first interpolation window has already ended must
    // discard the old pose, even if its tick number happens to match.
    prime()
    const epoch = animator.apply(input(1060, .02, {}, { epoch: 2 }))
    assert.equal(epoch.clip, null); assert.equal(epoch.bodyRotationRadians, undefined); assert.match(epoch.reason, /EPOCH_CHANGED/)
    const resumed = animator.apply(input(1080, .01, {}, { epoch: 2, tick: 1, sampledAt: 1080 }))
    assert.equal(resumed.animationTicks, 0); assert.equal(resumed.entryTime, 0)
    // Older frozen observations cannot reuse the old body or clock.
    prime(); animator.apply(input(1070, .03))
    const clock = animator.apply(input(1060, .01))
    assert.equal(clock.clip, null); assert.match(clock.reason, /MOTION_CLOCK_REGRESSED/)
    prime(); animator.apply(input(1060, .02, { tickCount: 21 }))
    const nativeTick = animator.apply(input(1070, .01, { tickCount: 20 }))
    assert.equal(nativeTick.clip, null); assert.match(nativeTick.reason, /MOTION_CLOCK_REGRESSED/)
    prime(); animator.apply(input(1110, .05, {}, { tick: 3, sampledAt: 1000 }))
    const physicsTick = animator.apply(input(1120, .01, {}, { tick: 2, sampledAt: 1000 }))
    assert.equal(physicsTick.clip, null); assert.match(physicsTick.reason, /PHYSICS_CLOCK_REGRESSED/)
    animator.reset(); assert.equal(animator.apply(input(1060, .02)).clip, null)
  } finally { model.dispose(); material.dispose() }
})

test('actual YSM actor uses native body orientation, relative head look and preserves them during applyPose', async () => {
  const { reader } = await originals()
  const actor = await createNativeYsmPlayerActor(reader, { uuid: UUID,
    ysm: { available: true, installed: true, source: NATIVE_YSM_SOURCE, playerUuid: UUID, enabled: true, mandatory: true,
      ysmVersion: '2.6.5', jarSha256: NATIVE_YSM_JAR_SHA256, modelId: 'misc/3_default_boy', texture: 'blue' },
    loadTexture: async () => new THREE.Texture({ width: 128, height: 128 }) })
  const idle = { walk: { speedOld: 0, speed: 0, position: 0 } }
  const direction = () => {
    actor.root.updateMatrixWorld(true)
    return new THREE.Vector3(0, 0, -1).transformDirection(actor.model.bones.get('Head').matrixWorld)
  }
  try {
    const state = actor.applyMotion(input(1025, 0, { bodyYaw: 0, previousBodyYaw: 0, headYaw: 30, previousHeadYaw: 30,
      pitch: 0, previousPitch: 0 }, idle))
    assert.equal(state.clip, 'idle'); assert.equal(state.bodyYaw, 0); assert.equal(state.headYaw, -30)
    close(actor.root.rotation.y, Math.PI); close(actor.model.bones.get('AllHead').rotation.y, Math.PI / 6)
    const looking = direction()
    close(looking.x, -.5); close(looking.y, 0); close(looking.z, Math.sqrt(3) / 2)
    const bodyRotation = actor.root.rotation.y, headRotation = actor.model.bones.get('AllHead').rotation.y
    actor.applyPose({ x: 7, y: 65, z: -2, yaw: -2.3, pitch: .8 })
    assert.deepEqual(actor.root.position.toArray(), [7, 65, -2])
    assert.equal(actor.root.rotation.y, bodyRotation); assert.equal(actor.model.bones.get('AllHead').rotation.y, headRotation)
    const crossing = actor.applyMotion(input(1075, .05, { previousBodyYaw: 178, bodyYaw: -178,
      previousHeadYaw: 179, headYaw: -175, previousPitch: 0, pitch: 0 }, { ...idle, tick: 2, sampledAt: 1050 }))
    assert.equal(crossing.bodyYaw, 180); assert.equal(crossing.headYaw, -2); assert.equal(actor.root.rotation.y, 0)
    const crossedLook = direction()
    close(crossedLook.x, -Math.sin(182 * Math.PI / 180)); close(crossedLook.z, Math.cos(182 * Math.PI / 180))
    actor.applyPose({ x: 8, y: 65, z: -2, yaw: .2, pitch: -.6 })
    assert.equal(actor.root.rotation.y, crossing.bodyRotationRadians)
    const frozen = actor.applyMotion(input(1101, .026, {}, { ...idle, tick: 2, sampledAt: 1050 }))
    assert.equal(frozen.available, false); assert.equal(actor.root.rotation.y, crossing.bodyRotationRadians)
    actor.applyPose({ x: 9, y: 65, z: -2, yaw: 1.9, pitch: 0 })
    assert.equal(actor.root.rotation.y, crossing.bodyRotationRadians)
  } finally { actor.dispose() }
})
