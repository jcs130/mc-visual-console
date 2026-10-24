import { PaperYsmAnimation } from '../modern-viewer/paper-ysm-animation.js'
import { selectNativeHeldItems } from './native-held-items.js'
import { parseNativeItemStack } from './native-item-stack.js'

const angle = n => Math.atan2(Math.sin(n), Math.cos(n))
const fresh = (time, now, limit) => Number.isFinite(time) && now >= time - 100 && now - time <= limit
const poses = { 0: 'standing', 1: 'fall_flying', 2: 'sleeping', 3: 'swimming', 4: 'spin_attack', 5: 'crouching', 7: 'dying' }

// The original handwritten YUI swim uses -80 degrees where standard YSM's
// forward swim uses positive X. Limit this Web correction to verified originals;
// the shared Bedrock channel signs and source asset bytes remain unchanged.
export function bundledYsmSourcePoseAdapter (choice, sourceHashes) {
  if (choice.modelId !== 'neko_yui' || choice.ysmVersion !== '2.4.1' ||
      sourceHashes.model !== '1feb1121e6946a899c75ea020b32d01809672010ac043c410e2d049426e58205' ||
      sourceHashes.animation !== '0cbd59d07acfa203438855d678e077da0af88e751d00e6fba713b1e775771ef5') return null
  return { source: 'original_neko_yui_swim_pitch', apply (pose, clip) {
    if (clip !== 'swim') return
    const channels = pose.get('AllBody'), rotation = channels?.rotation
    if (rotation) pose.set('AllBody', { ...channels, rotation: [-rotation[0], rotation[1], rotation[2]] })
  } }
}

// A client appearance policy over the action body's existing vanilla samples.
// This never manufactures a same_player_server_tick row or native mod flags.
export function bundledYsmMotionInput(current, uuid, now) {
  const p = current?.presentation, self = p?.self, physics = current?.motion, pose = current?.pose
  if (!p || p.available !== true || !['same_player_connection', 'numen_server_body', 'paper_server_observation'].includes(p.source) ||
      p.playerUuid?.toLowerCase() !== uuid || self?.uuid?.toLowerCase() !== uuid ||
      current.selfPlayer?.uuid?.toLowerCase() !== uuid || self.entityId !== current.selfPlayer.entityId) throw Error('BUNDLED_YSM_MOTION_IDENTITY_UNAVAILABLE')
  if (!fresh(p.sampledAt, now, 1500) || !pose || ![pose.yaw, pose.pitch].every(Number.isFinite)) throw Error('BUNDLED_YSM_PRESENTATION_STALE_OR_MISSING')
  const dead = self.health === 0 || ['dead', 'respawn_pending'].includes(self.deathLifecycle?.phase)
  if (physics?.source !== 'same_player_physics_tick' || physics.schemaVersion !== 1 || physics.tickMs !== 50 ||
      !Number.isSafeInteger(current.epoch) || current.epoch < 0 || physics.epoch !== current.epoch ||
      (!dead && (!Number.isSafeInteger(physics.tick) || physics.tick < 0 || !fresh(physics.sampledAt, now, 500)))) throw Error('BUNDLED_YSM_PHYSICS_STALE_OR_MISSING')
  const v = self.velocity
  if (!dead && (!v || ![v.x, v.y, v.z].every(Number.isFinite) || typeof self.onGround !== 'boolean')) throw Error('BUNDLED_YSM_VELOCITY_OR_GROUND_MISSING')
  const hand = self.handAnimation
  const hands = ['same_player_vanilla_hand_packets','paper_server_observation'].includes(hand?.source) && hand.playerUuid === uuid && hand.entityId === self.entityId && fresh(hand.sampledAt, now, 1500) ? hand : null
  let equipment, equipmentReason = null
  try {
    const selected = selectNativeHeldItems(p, uuid), main = selected.mainArm
    equipment = [selected.hands[main].raw, selected.hands[main === 'right' ? 'left' : 'right'].raw]
    for (const item of equipment) if (item !== null) parseNativeItemStack(item)
  } catch (error) { equipment = undefined; equipmentReason = error.message }
  // Mineflayer velocity is blocks/tick. Heading is actual look yaw when the
  // connection supplies no separate body yaw; that limitation is diagnostic.
  const bodyYaw = Number.isFinite(self.bodyYaw) ? self.bodyYaw : pose.yaw
  const headYaw = Number.isFinite(self.headYaw) ? self.headYaw : pose.yaw
  const use = hands?.use, activeItem = equipment?.[hands?.activeHand === 'offhand' ? 1 : 0]
  const useKind = (use?.source === 'observed_use_packet_vanilla_duration' || p.source==='paper_server_observation'&&use?.source==='paper_use_item_state') && ['eat', 'drink'].includes(use.kind) && [16,32,40].includes(use.durationTicks) &&
    activeItem?.name === use.name && fresh(use.startedAt, now, use.durationTicks * 50) ? use.kind : undefined
  return { entityId: self.entityId, epoch: current.epoch, tick: physics.tick, resetSequence: dead ? 'death' : physics.resetSequence,
    bodyYaw, headingSource: Number.isFinite(self.bodyYaw) ? 'same_player_body_yaw' : 'same_player_look_yaw',
    headYawDegrees: angle(bodyYaw - headYaw) * 180 / Math.PI, headPitchDegrees: -pose.pitch * 180 / Math.PI,
    horizontalSpeed: dead ? 0 : Math.hypot(v.x, v.z) * 20, verticalSpeed: dead ? 0 : v.y * 20,
    onGround: self.onGround, inWater: typeof self.inWater === 'boolean' ? self.inWater : null,
    waterSource: typeof self.inWater === 'boolean' ? 'same_player_connection' : null,
    crouching: hands?.crouching ?? self.crouching ?? self.sneaking,
    sprinting: self.sprinting, flying: self.flying, climbing: self.climbing, isPassenger: self.isPassenger,
    vehicleType: self.vehicleType, pose: dead ? 'dying' : poses[self.pose] ?? self.pose,
    health: self.health, maxHealth: self.maxHealth, equipment, equipmentReason,
    mainArm: hands?.mainArm ?? self.mainArm, usingItem: hands?.usingItem, activeHand: hands?.activeHand, useKind,
    swing: hands?.swing && Number.isFinite(hands.swing.startedAt) && Number.isSafeInteger(hands.swing.sequence)
      ? { ...hands.swing, ageSeconds: (now - hands.swing.startedAt) / 1000 } : null,
    hurt: self.hurt && fresh(self.hurt.startedAt, now, 500) ? { sequence: self.hurt.sequence, ageSeconds: (now - self.hurt.startedAt) / 1000 } : null,
    animation: self.animation }
}

export function createBundledYsmAnimation(model, main, { arm, extra, uuid, sourcePoseAdapter = null } = {}) {
  let animator, identity, lastNow, current, health, hurt, sequence = 0
  const reset = () => {
    animator = new PaperYsmAnimation(model, main, { arm, extra, lookBone: model.bones.has('AllHead') ? 'AllHead' : 'Head',
      adaptMainPose: sourcePoseAdapter?.apply,
      selectBase: (m, base) => m.pose === 'dying' ? 'death' : m.climbing === true
        ? (m.verticalSpeed > .02 ? 'ladder_up' : m.verticalSpeed < -.02 ? 'ladder_down' : 'ladder_stillness')
        : m.isPassenger === true ? (m.vehicleType === 'minecraft:boat' ? 'boat' : m.vehicleType === 'minecraft:pig' ? 'ride_pig' : 'ride') : base })
    identity = null; lastNow = null; health = null; hurt = null
  }
  reset()
  return { current: () => current ?? { available: false, reason: 'BUNDLED_YSM_MOTION_WAITING' },
    apply({ current: frame, now = Date.now() } = {}) {
      try {
        const m = bundledYsmMotionInput(frame, uuid, now), key = `${m.epoch}:${m.entityId}:${m.resetSequence ?? ''}`
        if (identity !== key || now < lastNow) reset()
        identity = key; lastNow = now
        // Authored mainhand tracks name the right bones. Mirror logical hands
        // into those physical clip slots when the actual player is left-handed.
        if (m.mainArm === 'left') {
          m.equipment = m.equipment && [m.equipment[1], m.equipment[0]]
          m.activeHand = m.activeHand === 'offhand' ? 'mainhand' : 'offhand'
          if (m.swing) m.swing = { ...m.swing, hand: m.swing.hand === 'offhand' ? 'mainhand' : 'offhand' }
        }
        if (Number.isFinite(health) && Number.isFinite(m.health) && m.health > 0 && m.health < health) hurt = { sequence: ++sequence, startedAt: now }
        health = m.health
        if (!m.hurt && hurt && now - hurt.startedAt < 500) m.hurt = { sequence: hurt.sequence, ageSeconds: (now - hurt.startedAt) / 1000 }
        const state = animator.apply({ motion: m, animation: m.animation }, now)
        return (current = { ...state, available: state.errors.length === 0, reason: state.errors[0] ?? null,
          clip: state.base, source: 'bundled_client_same_player_vanilla', headingSource: m.headingSource,
          sourcePoseConvention: sourcePoseAdapter?.source ?? null,
          bodyRotationRadians: m.bodyYaw, equipmentReason: m.equipmentReason,
          hurtSource: m.hurt ? 'same_player_health_or_hurt_sample' : null,
          missingInputs: ['inWater', 'sprinting', 'climbing', 'flying', 'isPassenger', 'usingItem'].filter(key => typeof m[key] !== 'boolean'),
          animationParityVerified: false })
      } catch (error) {
        reset(); animator.apply({ motion: { onGround: true, horizontalSpeed: 0 } }, now)
        return (current = { available: false, reason: error.message, clip: 'idle', source: 'bundled_client_same_player_vanilla', animationParityVerified: false })
      }
    }
  }
}
