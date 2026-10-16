import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { loadBundledAppearances } from '../../host/native-bundled-appearances.mjs'
import { BundledAppearanceReader } from '../../src/native-viewer/native-bundled-appearance.js'
import { createNativeBundledYsmPlayerActor } from '../../src/native-viewer/native-player-bundled-ysm.js'
import { applyNativeSelfPlayerMotion } from '../../src/native-viewer/native-self-player.js'

const catalog = process.env.NATIVE_BUNDLED_APPEARANCE_CATALOG
const actual = { skip: !catalog }, uuid = '01234567-89ab-cdef-0123-456789abcdef'
const hashes = {
  model: '1feb1121e6946a899c75ea020b32d01809672010ac043c410e2d049426e58205',
  animation: '0cbd59d07acfa203438855d678e077da0af88e751d00e6fba713b1e775771ef5',
  texture: 'f8ed6510dec8647895fb633dde7cad0d3338fe7b39f78e2566d389e4ec33709f'
}
const decode = async b => { const d = new DataView(b.buffer, b.byteOffset, b.byteLength); return new THREE.Texture({ width: d.getUint32(16), height: d.getUint32(20) }) }
async function originals (variant) {
  const bundle = await loadBundledAppearances(catalog)
  assert.equal(bundle.metadata.available, true)
  const metadata = structuredClone(bundle.metadata), replacement = new Map()
  const choice = metadata.appearances.find(row => row.kind === 'ysm')
  for (const [kind, hash] of Object.entries(hashes)) assert.equal(metadata.assets[choice.files[kind]].sha256, hash)
  if (variant === 'other') choice.modelId = 'other_yui'
  if (['model', 'animation', 'positive'].includes(variant)) {
    const file = choice.files[variant === 'model' ? 'model' : 'animation']
    let bytes = bundle.read(file)
    if (variant === 'positive') {
      const animation = JSON.parse(bytes); animation.animations.swim.bones.AllBody.rotation[0] = 72.5
      bytes = Buffer.from(JSON.stringify(animation))
    } else bytes = Buffer.concat([bytes, Buffer.from('\n')])
    replacement.set(file, bytes)
    metadata.assets[file] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  }
  const reader = new BundledAppearanceReader(metadata, file => replacement.get(file) ?? bundle.read(file))
  const actor = await createNativeBundledYsmPlayerActor(null, { uuid, bundledAppearance: { reader, id: `bundled:${choice.id}` }, loadTexture: decode })
  return { actor, bundle, reader }
}
const forward = yaw => new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))
function frame (now, { yaw = 0, headYaw = yaw, pitch = 0, water = true, speed = .1, fallback = false, ...patch } = {}) {
  const velocity = forward(yaw).multiplyScalar(speed)
  return { epoch: 1, pose: { x: 0, y: 64, z: 0, yaw: headYaw, pitch }, selfPlayer: { uuid, entityId: 42 },
    motion: { schemaVersion: 1, source: 'same_player_physics_tick', tickMs: 50, epoch: 1, tick: now / 50, sampledAt: now, resetSequence: 0 },
    presentation: { available: true, source: 'same_player_connection', playerUuid: uuid, sampledAt: now,
      self: { uuid, entityId: 42, health: 20, onGround: !water, inWater: water, sneaking: false,
        velocity: { x: velocity.x, y: 0, z: velocity.z }, ...(!fallback && { bodyYaw: yaw, headYaw }), ...patch } } }
}
function apply (actor, now, options) {
  const current = frame(now, options); actor.applyPose(current.pose)
  const state = applyNativeSelfPlayerMotion(actor, current, { now })
  assert.equal(state.available, true, state.reason); actor.root.updateMatrixWorld(true)
  return state
}
function axis (actor) {
  const body = actor.model.bones.get('AllBody'), head = actor.model.bones.get('AllHead')
  return head.getWorldPosition(new THREE.Vector3()).sub(body.getWorldPosition(new THREE.Vector3())).normalize()
}
const face = actor => new THREE.Vector3(0, 0, -1).transformDirection(actor.model.bones.get('AllHead').matrixWorld)

test('verified original YUI actor swims head first at every received cardinal heading and yaw fallback', actual, async () => {
  const { actor, bundle } = await originals()
  try {
    assert.equal(bundle.sha256, 'e014078c1e0498fd70616cb951fb87b8091cea934cc3d26959b8b94394c5f353')
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) for (const fallback of [false, true]) {
      apply(actor, 1000, { yaw, fallback }); const state = apply(actor, 1300, { yaw, fallback })
      assert.equal(state.clip, 'swim')
      assert.equal(state.sourcePoseConvention, 'original_neko_yui_swim_pitch')
      assert.ok(axis(actor).dot(forward(yaw)) > .98, `headward axis opposes received heading ${yaw}`)
      assert.ok(Math.abs(actor.root.rotation.y - yaw) < 1e-9)
      assert.equal(state.animationParityVerified, false)
    }
    for (const [kind, hash] of Object.entries(hashes)) assert.equal(actor.assetInfo.sourceHashes[kind], hash)
    assert.equal(actor.assetInfo.channelTransformParityVerified, false)
  } finally { actor.dispose() }
})

test('actual YUI entry, tread, resumed swim and exit blend continuously without a backward intermediate body', actual, async () => {
  const { actor } = await originals()
  try {
    apply(actor, 1000, { water: false }); apply(actor, 1300, { water: false })
    for (const [start, options, endDot] of [[2000, { water: true }, .98], [2500, { water: true, speed: 0 }, 0],
      [3000, { water: true }, .98], [3500, { water: false }, 0]]) {
      const before = axis(actor); let previous = before
      for (const offset of [0, 50, 100, 150, 200, 250]) {
        apply(actor, start + offset, options); const current = axis(actor)
        if (offset === 0) assert.ok(current.distanceTo(before) < 1e-7, 'transition starts at previous pose')
        assert.ok(current.dot(forward(0)) >= -1e-7, 'water blend crossed backwards')
        assert.ok(current.angleTo(previous) < .5, `water transition snapped at ${start}+${offset}: ${current.angleTo(previous)} radians`)
        previous = current
      }
      if (endDot) assert.ok(previous.dot(forward(0)) > endDot)
      else assert.ok(previous.y > .999, 'tread/walk returns upright')
    }
  } finally { actor.dispose() }
})

test('received zero-speed swim pose stays head first; occupancy treads; live look and legal backpedal/strafe retain heading', actual, async () => {
  const { actor } = await originals()
  try {
    for (const pitch of [-.5, 0, .5]) {
      const options = { yaw: .4, headYaw: .7, pitch, pose: 3, speed: 0 }
      apply(actor, 1000, options); const state = apply(actor, 1300, options)
      assert.equal(state.clip, 'swim'); assert.ok(axis(actor).dot(forward(.4)) > .98)
      assert.ok(Math.abs(actor.root.rotation.y - .4) < 1e-9)
      assert.ok(Math.abs(actor.model.bones.get('AllHead').rotation.x + pitch) < 1e-7)
      assert.ok(Math.abs(actor.model.bones.get('AllHead').rotation.y + .3) < 1e-7)
      assert.ok(Number.isFinite(face(actor).y))
    }
    apply(actor, 2000, { speed: 0 }); assert.equal(apply(actor, 2300, { speed: 0 }).clip, 'swim_stand')
    assert.ok(axis(actor).y > .999)
    for (const [speed, velocity] of [[0, undefined], [.1, undefined], [-.1, undefined], [.1, { x: .1, y: 0, z: 0 }]]) {
      const options = { water: false, yaw: 0, speed, ...(velocity && { velocity }) }
      apply(actor, 3000, options); apply(actor, 3300, options)
      assert.ok(face(actor).dot(forward(0)) > .999)
    }
  } finally { actor.dispose() }
})

test('other appearances, changed original hashes and canonical positive swim channels keep ordinary shared signs', actual, async () => {
  for (const variant of ['other', 'model', 'animation', 'positive']) {
    const { actor } = await originals(variant)
    try {
      apply(actor, 1000); const state = apply(actor, 1300)
      assert.equal(state.sourcePoseConvention, null)
      const north = axis(actor).dot(forward(0))
      if (variant === 'positive') assert.ok(north > .95, 'canonical positive swim was globally inverted')
      else assert.ok(north < -.98, 'unrecognized source received a YUI conversion')
    } finally { actor.dispose() }
  }
})
