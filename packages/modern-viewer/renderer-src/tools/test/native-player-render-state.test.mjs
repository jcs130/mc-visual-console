import test from 'node:test'
import assert from 'node:assert/strict'
import { projectNativePlayerRenderState, NATIVE_PLAYER_RENDER_STATE_SOURCE } from '../../src/native-viewer/native-player-render-state.js'
import { createNativePlayerPresentation } from '../native-world-preview-host.mjs'

const uuid = 'e371227c-09fa-3722-84f4-f3228a552c3c'
const input = () => ({ schemaVersion: 1, source: NATIVE_PLAYER_RENDER_STATE_SOURCE, playerUuid: uuid,
  available: true, sampledAt: 1791177300000, sampleIntervalMs: 250, tickCount: 64, gameTime: 1400,
  position: { x: -421.5, y: 65, z: 410.5 }, previousPosition: { x: -421.6, y: 65, z: 410.5 }, velocity: { x: .1, y: 0, z: 0 },
  bodyYaw: 12, previousBodyYaw: 10, headYaw: 22, previousHeadYaw: 20, yaw: 22, pitch: -8, previousPitch: -9,
  onGround: true, sprinting: false, crouching: false, pose: 'standing', passenger: false, swimming: false,
  inWater: false, underWater: false, fallFlying: false, flying: false, spinAttack: false,
  hurtTime: 0, deathTime: 0, deadOrDying: false, sleeping: false, climbing: false, inLava: false, alive: true,
  usingItem: false, swinging: false, swingTime: 0, attackAnim: 0, fallDistance: 0 })

test('own server motion preserves actual native values and excludes private extra fields', () => {
  const raw = { ...input(), privateRuntime: 'do not send', clientAnimationParityVerified: true }
  raw.position.privateRuntime = 'do not send'
  const state = projectNativePlayerRenderState(raw, uuid.toUpperCase())
  assert.equal(state.available, true)
  assert.equal(state.playerUuid, uuid)
  assert.equal(state.pitch, -8)
  assert.deepEqual(state.position, { x: -421.5, y: 65, z: 410.5 })
  assert.equal(state.privateRuntime, undefined)
  assert.equal(state.clientAnimationParityVerified, false)
  assert.notEqual(state.position, raw.position)
  assert.equal(projectNativePlayerRenderState({ ...input(), swingTime: -1 }, uuid).available, true)
})

test('foreign or missing motion cannot silently become an own-body pose', () => {
  for (const value of [null, [], { ...input(), playerUuid: '2a4964c1-d960-3e6f-81cc-396cacbc9851' },
    { ...input(), source: 'same_player_physics_tick' }]) {
    const state = projectNativePlayerRenderState(value, uuid)
    assert.equal(state.available, false)
    assert.equal(state.reason, 'NATIVE_PLAYER_RENDER_IDENTITY_MISMATCH')
    assert.equal(state.position, undefined)
  }
  assert.throws(() => projectNativePlayerRenderState(input(), 'not-a-uuid'), /UUID_INVALID/)
})

test('incomplete or invalid server observations stay unavailable, with no default flags', () => {
  for (const [key, value] of [['sprinting', undefined], ['onGround', 'true'], ['tickCount', -1],
    ['hurtTime', .5], ['sampledAt', Infinity], ['gameTime', -1], ['sampleIntervalMs', 50],
    ['pitch', NaN], ['attackAnim', 2], ['pose', 'bad pose'], ['velocity', { x: 0, y: null, z: 0 }]]) {
    const state = projectNativePlayerRenderState({ ...input(), [key]: value }, uuid)
    assert.equal(state.available, false, key)
    assert.equal(state.reason, 'NATIVE_PLAYER_RENDER_STATE_INVALID', key)
  }
})

test('real presentation adapter retains only the owning account server motion', () => {
  const menu = { playerUuid: uuid, windowId: 0, stateId: 1, menuType: 'minecraft:inventory', selectedHotbarSlot: 0,
    slots: Array(46).fill(null), self: { playerUuid: uuid, motion: input() } }
  const own = createNativePlayerPresentation({ playerUuid: uuid, menu })
  assert.equal(own.self.motion.available, true)
  assert.equal(own.self.motion.tickCount, 64)
  menu.self.motion.playerUuid = '2a4964c1-d960-3e6f-81cc-396cacbc9851'
  const foreign = createNativePlayerPresentation({ playerUuid: uuid, menu })
  assert.equal(foreign.self.motion.available, false)
  assert.equal(foreign.self.motion.position, undefined)
})
