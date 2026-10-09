const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export const NATIVE_PLAYER_RENDER_STATE_SOURCE = 'same_player_server_tick'
const FLAGS = ['onGround', 'sprinting', 'crouching', 'passenger', 'swimming', 'inWater', 'underWater',
  'fallFlying', 'flying', 'spinAttack', 'deadOrDying', 'sleeping', 'climbing', 'inLava', 'alive', 'usingItem', 'swinging']
const NUMBERS = ['bodyYaw', 'previousBodyYaw', 'headYaw', 'previousHeadYaw', 'yaw', 'pitch', 'previousPitch', 'fallDistance']
const COUNTS = ['tickCount', 'hurtTime', 'deathTime']
const validVector = value => value && typeof value === 'object' && !Array.isArray(value) &&
  ['x', 'y', 'z'].every(key => Number.isFinite(value[key]))

// Strict own-account projection; never send arbitrary attachment/private keys.
// Server observations supplement physics ticks; neither proves client animation parity.
export function projectNativePlayerRenderState (value, playerUuid) {
  if (typeof playerUuid !== 'string' || !UUID.test(playerUuid)) throw Error('NATIVE_PLAYER_RENDER_UUID_INVALID')
  const uuid = playerUuid.toLowerCase()
  const unavailable = reason => ({ schemaVersion: 1, source: NATIVE_PLAYER_RENDER_STATE_SOURCE,
    playerUuid: uuid, available: false, reason, clientAnimationParityVerified: false })
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      value.source !== NATIVE_PLAYER_RENDER_STATE_SOURCE || typeof value.playerUuid !== 'string' ||
      value.playerUuid.toLowerCase() !== uuid) return unavailable('NATIVE_PLAYER_RENDER_IDENTITY_MISMATCH')
  if (value.available !== true || value.schemaVersion !== 1 || value.sampleIntervalMs !== 250 ||
      !Number.isSafeInteger(value.sampledAt) || value.sampledAt < 0 ||
      !Number.isSafeInteger(value.gameTime) || value.gameTime < 0 ||
      FLAGS.some(key => typeof value[key] !== 'boolean') || NUMBERS.some(key => !Number.isFinite(value[key])) ||
      COUNTS.some(key => !Number.isSafeInteger(value[key]) || value[key] < 0 || value[key] > 2147483647) ||
      !Number.isSafeInteger(value.swingTime) || value.swingTime < -1 || value.swingTime > 2147483647 ||
      !Number.isFinite(value.attackAnim) || value.attackAnim < 0 || value.attackAnim > 1 ||
      typeof value.pose !== 'string' || !/^[a-z_]{1,64}$/.test(value.pose) ||
      ['position', 'previousPosition', 'velocity'].some(key => !validVector(value[key]))) {
    return unavailable('NATIVE_PLAYER_RENDER_STATE_INVALID')
  }
  return { schemaVersion: 1, source: NATIVE_PLAYER_RENDER_STATE_SOURCE, playerUuid: uuid, available: true,
    sampledAt: value.sampledAt, sampleIntervalMs: 250, gameTime: value.gameTime, pose: value.pose,
    ...Object.fromEntries([...FLAGS, ...NUMBERS, ...COUNTS, 'swingTime', 'attackAnim'].map(key => [key, value[key]])),
    ...Object.fromEntries(['position', 'previousPosition', 'velocity'].map(key => [key,
      Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, value[key][axis]]))])),
    clientAnimationParityVerified: false }
}
