import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { loadBundledAppearances } from '../../host/native-bundled-appearances.mjs'
import { BundledAppearanceReader } from '../../src/native-viewer/native-bundled-appearance.js'
import { createNativeBundledYsmPlayerActor } from '../../src/native-viewer/native-player-bundled-ysm.js'
import { applyNativeSelfPlayerMotion, NativeSelfPlayerController } from '../../src/native-viewer/native-self-player.js'
import { createNativeBedrockModel } from '../../src/native-viewer/native-entity-model-bedrock.js'
import { createBundledYsmAnimation,bundledYsmMotionInput } from '../../src/native-viewer/native-bundled-ysm-motion.js'
import { mirrorInventoryPlayer, poseInventoryPlayer } from '../../src/modern-viewer/inventory-player-preview.js'
const uuid = '01234567-89ab-cdef-0123-456789abcdef'
const other = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const catalog = process.env.NATIVE_BUNDLED_APPEARANCE_CATALOG
const decode = async b => { const d = new DataView(b.buffer, b.byteOffset, b.byteLength); return new THREE.Texture({ width: d.getUint32(16), height: d.getUint32(20) }) }
const frame = (now, patch = {}, outer = {}) => ({ epoch: 1, pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, selfPlayer: { uuid, entityId: 42 },
  motion: { schemaVersion: 1, source: 'same_player_physics_tick', tickMs: 50, epoch: 1, tick: now / 50, sampledAt: now, resetSequence: 0 },
  presentation: { available: true, source: 'same_player_connection', playerUuid: uuid, sampledAt: now,
    self: { uuid, entityId: 42, health: 20, onGround: true, inWater: false, sneaking: false, velocity: { x: 0, y: 0, z: 0 }, ...patch } }, ...outer })
async function originals() {
  const b = await loadBundledAppearances(catalog); assert.equal(b.metadata.available, true)
  const reader = new BundledAppearanceReader(b.metadata, p => b.read(p))
  const actor = await createNativeBundledYsmPlayerActor(null, { uuid, bundledAppearance: { reader, id: 'bundled:yui-ysm' }, loadTexture: decode })
  return { reader, actor }
}
const close = (a, b, eps = 1e-7) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`)

test('Paper observed eating uses the actual item and active hand rather than dropping its animation',()=>{
 const f=frame(3050,{mainArm:'right',handAnimation:{source:'paper_server_observation',playerUuid:uuid,entityId:42,sampledAt:3050,
  mainArm:'right',usingItem:true,activeHand:'offhand',use:{source:'paper_use_item_state',kind:'eat',name:'minecraft:apple',hand:'offhand',durationTicks:32,startedAt:3000}}})
 f.presentation.source='paper_server_observation';f.presentation.inventory={playerUuid:uuid,windowId:0,hotbarStart:36,offhandSlot:45,selectedHotbarSlot:0,
  slots:Array.from({length:46},(_,slot)=>({slot,item:slot===45?{name:'minecraft:apple',count:1,snbt:'{id:"minecraft:apple",count:1}'}:null}))}
 assert.equal(bundledYsmMotionInput(f,uuid,3050).useKind,'eat');assert.equal(bundledYsmMotionInput(f,uuid,3050).activeHand,'offhand')
 f.presentation.self.handAnimation.use.name='minecraft:bread';assert.equal(bundledYsmMotionInput(f,uuid,3050).useKind,undefined)
})

test('actual bundled YSM preserves the interpolated display heading through its animation controller', { skip: !catalog }, async () => {
 const {actor}=await originals()
 try {
  const f=frame(1000,{velocity:{x:.1,y:0,z:0}},{pose:{x:2,y:64,z:0,yaw:1,pitch:.5}}),before=structuredClone(f)
  const display={...f.pose,x:1.5,yaw:.5,pitch:.25}
  actor.applyPose(display)
  const state=applyNativeSelfPlayerMotion(actor,f,{now:1000,dt:.016,displayPose:display})
  assert.equal(state.available,true);assert.equal(state.clip,'walk')
  close(actor.root.rotation.y,.5);close(actor.root.position.x,1.5)
  assert.deepEqual(f,before)
 } finally {actor.dispose()}
})

test('actual bundled actor accepts ordinary Mineflayer state, cardinal heading and independent look', { skip: !catalog }, async () => {
  const { actor } = await originals()
  try {
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) for (const pitch of [-.5, 0, .5]) {
      const f = frame(1000, { bodyYaw: yaw - .2, headYaw: yaw }, { pose: { x: 0, y: 0, z: 0, yaw, pitch } })
      actor.applyPose(f.pose); const state = applyNativeSelfPlayerMotion(actor, f, { now: 1000 })
      assert.equal(state.available, true); assert.equal(state.clip, 'idle')
      actor.root.updateMatrixWorld(true)
      const direction = new THREE.Vector3(0, 0, -1).transformDirection(actor.model.bones.get('AllHead').matrixWorld)
      close(direction.x, -Math.sin(yaw) * Math.cos(pitch)); close(direction.y, Math.sin(pitch)); close(direction.z, -Math.cos(yaw) * Math.cos(pitch))
    }
    const mirror = mirrorInventoryPlayer(THREE, actor.root); poseInventoryPlayer(mirror)
    mirror.root.updateMatrixWorld(true)
    assert.ok(new THREE.Vector3(0, 0, -1).transformDirection(mirror.nodes.get(actor.model.bones.get('AllBody')).matrixWorld).z > 0)
    assert.equal(actor.assetInfo.completeEntityParityVerified, false)
    assert.equal(actor.firstPersonItemsState().reason, 'NATIVE_HELD_INVENTORY_UNAVAILABLE')
    assert.equal(actor.firstPersonItemsState().nativeBasisVerified, false)
  } finally { actor.dispose() }
})

test('original locomotion/water/hurt/death/use/swing/climb/mount transitions reuse shared animator', { skip: !catalog }, async () => {
  const { actor } = await originals()
  const apply = (t, patch) => applyNativeSelfPlayerMotion(actor, frame(t, patch), { now: t })
  try {
    assert.equal(apply(1000, {}).clip, 'idle')
    assert.equal(apply(1100, { velocity: { x: .15, y: 0, z: 0 } }).clip, 'walk')
    assert.equal(apply(1200, { velocity: { x: .2, y: 0, z: 0 }, sprinting: true }).clip, 'run')
    assert.equal(apply(1300, { sneaking: true }).clip, 'sneaking')
    assert.equal(apply(1400, { onGround: false }).clip, 'jump')
    assert.equal(apply(1500, { onGround: false, inWater: true, velocity: { x: .1, y: 0, z: 0 } }).clip, 'swim')
    assert.equal(apply(1600, { onGround: false, inWater: true }).clip, 'swim_stand')
    const hurt = apply(1700, { health: 18 }); assert.ok(hurt.clips.includes('attacked'))
    const dead = frame(1800, { health: 0 }); dead.motion.sampledAt = null; dead.motion.resetSequence = 1
    assert.equal(applyNativeSelfPlayerMotion(actor, dead, { now: 1800 }).clip, 'death')
    const deadAgain = frame(2800, { health: 0 }); deadAgain.motion.sampledAt = null; deadAgain.motion.resetSequence = 20
    applyNativeSelfPlayerMotion(actor, deadAgain, { now: 2800 })
    close(actor.model.bones.get('AllBody').rotation.z, Math.PI / 2)
    assert.equal(apply(2900, {}).clip, 'idle')
    const hands = { source: 'same_player_vanilla_hand_packets', playerUuid: uuid, entityId: 42, sampledAt: 3000, mainArm: 'right', usingItem: true, activeHand: 'mainhand' }
    assert.ok(apply(3000, { handAnimation: hands }).clips.includes('use_mainhand'))
    const eating = frame(3050, {mainArm:'right',handAnimation:{...hands,sampledAt:3050,use:{source:'observed_use_packet_vanilla_duration',kind:'eat',name:'minecraft:apple',durationTicks:32,startedAt:3000}}})
    eating.presentation.inventory={playerUuid:uuid,windowId:0,hotbarStart:36,offhandSlot:45,selectedHotbarSlot:0,slots:Array.from({length:46},(_,slot)=>({slot,item:slot===36?{name:'minecraft:apple',count:1,snbt:'{id:"minecraft:apple",count:1}'}:null}))}
    assert.ok(applyNativeSelfPlayerMotion(actor,eating,{now:3050}).clips.includes('use_mainhand:eat'))
    hands.sampledAt = 3100; hands.usingItem = false; hands.swing = { sequence: 1, hand: 'mainhand', startedAt: 3000 }
    assert.ok(apply(3100, { handAnimation: hands }).clips.includes('swing_hand'))
    assert.equal(apply(3200, { climbing: true, velocity: { x: 0, y: .1, z: 0 } }).clip, 'ladder_up')
    assert.equal(apply(3300, { climbing: true }).clip, 'ladder_stillness')
    assert.equal(apply(3400, { isPassenger: true, vehicleType: 'minecraft:pig' }).clip, 'ride_pig')
    assert.equal(apply(3500, { pose: 2 }).clip, 'sleep')
  } finally { actor.dispose() }
})

test('missing/stale/foreign/epoch data clears locomotion phase instead of carrying old motion', { skip: !catalog }, async () => {
  const { actor } = await originals()
  try {
    let f = frame(1000, { velocity: { x: .1, y: 0, z: 0 } })
    assert.equal(applyNativeSelfPlayerMotion(actor, f, { now: 1000 }).clip, 'walk')
    f = frame(1100); delete f.presentation.self.velocity
    assert.match(applyNativeSelfPlayerMotion(actor, f, { now: 1100 }).reason, /VELOCITY/)
    f = frame(1200); f.motion.epoch = 2
    assert.match(applyNativeSelfPlayerMotion(actor, f, { now: 1200 }).reason, /PHYSICS/)
    assert.match(applyNativeSelfPlayerMotion(actor, frame(1300), { now: 3000 }).reason, /STALE/)
    f = frame(1400); f.selfPlayer.uuid = other
    assert.match(applyNativeSelfPlayerMotion(actor, f, { now: 1400 }).reason, /IDENTITY/)
    f = frame(1500, { velocity: { x: .1, y: 0, z: 0 } }); f.epoch = f.motion.epoch = 2
    assert.equal(applyNativeSelfPlayerMotion(actor, f, { now: 1500 }).clip, 'walk')
    close(actor.model.bones.get('RightLeg').rotation.x, 22 * Math.PI / 180)
  } finally { actor.dispose() }
})

function samples(model) {
  model.root.updateWorldMatrix(true, true); const rows = []; let meshes = 0
  const inverse = model.root.matrixWorld.clone().invert()
  const visit = o => {
    if (!o.isMesh) return; meshes++
    const matrix = new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld)
    const g = o.geometry, p = g.getAttribute('position'), n = g.getAttribute('normal'), uv = g.getAttribute('uv'), nm = new THREE.Matrix3().getNormalMatrix(matrix)
    for (let i = 0; i < g.index.count; i++) {
      const j = g.index.getX(i)
      rows.push([...new THREE.Vector3().fromBufferAttribute(p, j).applyMatrix4(matrix).toArray(), ...new THREE.Vector3().fromBufferAttribute(n, j).applyNormalMatrix(nm).toArray(), uv.getX(j), uv.getY(j)])
    }
  }
  for (const bone of model.bones.values()) for (const child of bone.children) {
    if(child.isMesh) visit(child)
    else if(child.userData.nativeCubeRotation) child.traverse(visit)
  }
  return { meshes, rows }
}
test('all original triangles/normals/UVs survive native per-bone batching and animation; disposal is once', { skip: !catalog }, async () => {
  const { actor, reader } = await originals(), material = new THREE.MeshBasicMaterial()
  const model = createNativeBedrockModel(await reader.json('ysm/neko_yui/models/main.json'), material)
  const plain = createBundledYsmAnimation(model, await reader.json('ysm/neko_yui/animations/main.animation.json'), {
    uuid, arm: await reader.json('ysm/neko_yui/animations/arm.animation.json'), extra: await reader.json('ysm/neko_yui/animations/extra.animation.json') })
  assert.equal(samples(model).meshes, 1008); assert.equal(samples(actor.model).meshes, 35)
  assert.equal(samples(actor.model).rows.length / 3, 2016); assert.equal(actor.model.bones.size, 49)
  for (const [time, patch] of [[1000, {}], [1200, { velocity: { x: .1, y: 0, z: 0 } }], [1500, { onGround: false, inWater: true, velocity: { x: .1, y: 0, z: 0 } }], [1750, { health: 17 }]]) {
    const current = frame(time, patch); plain.apply({ current, now: time }); actor.applyMotion({ current, now: time })
    const a = samples(actor.model).rows, b = samples(model).rows
    assert.equal(a.length, b.length)
    for(let i=0;i<a.length;i++) for(let j=0;j<8;j++) close(a[i][j], b[i][j], j<6?2e-7:1e-12)
  }
  let geometry = 0, texture = 0, mat = 0
  actor.root.traverse(o => { if (o.isMesh) o.geometry.addEventListener('dispose', () => geometry++) })
  const mesh = actor.root.getObjectByProperty('isMesh', true)
  mesh.material.addEventListener('dispose', () => mat++); mesh.material.map.addEventListener('dispose', () => texture++)
  actor.dispose(); actor.dispose(); assert.equal(geometry, 35); assert.equal(mat, 1); assert.equal(texture, 1)
  assert.throws(() => actor.applyMotion(), /DISPOSED/); model.dispose(); material.dispose()
})

test('preferences survive same-account respawn/reconnect, are scoped, and explicit server beats host default', async () => {
  const values = new Map(), storage = { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) }
  const original = { uuid, entityId: 1, skin: { kind: 'default', assetPath: 'skin.png', sha256: 'hash' } }
  const create = () => new NativeSelfPlayerController({ manifest: {} }, { selectionStorage: storage, selectionScope: 'server-a', minecraftFactory: async () => ({ assetInfo: { path: 'skin.png', sha256: 'hash' }, dispose() {} }) })
  const c = create(); await c.update(original, uuid); c.selectAppearance('server'); c.clear('death')
  await c.update({ ...original, entityId: 2 }, uuid); assert.equal(c.appearanceId, 'server')
  c.dispose(); const d = create(); d.defaultAppearance = 'unavailable'; await d.update(original, uuid); assert.equal(d.appearanceId, 'server'); d.dispose()
  assert.ok([...values.keys()][0].includes('server-a')); assert.ok([...values.keys()][0].endsWith(uuid))
})

test('host bundled default and stored explicit choice survive reload only within matching page/account scope', { skip: !catalog }, async () => {
  const { reader, actor } = await originals(); actor.dispose()
  const values = new Map(), storage = { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v) }
  const original = { uuid, entityId: 1, skin: { kind: 'default', assetPath: 'skin.png', sha256: 'hash' } }
  const create = (scope='server-a', defaultAppearance='server') => new NativeSelfPlayerController({ manifest: {} }, {
    bundledAppearanceReader: reader, selectionStorage: storage, selectionScope: scope, defaultAppearance,
    bundledYsmFactory: async (_r, {uuid}) => ({assetInfo:{uuid,source:'plugin_bundled'},dispose(){}}),
    minecraftFactory: async () => ({assetInfo:{path:'skin.png',sha256:'hash'},dispose(){}}) })
  const c = create('server-a','bundled:yui-ysm'); await c.update(original,uuid)
  assert.equal(c.appearanceId,'bundled:yui-ysm'); c.selectAppearance('bundled:yui-ysm'); c.clear('epoch')
  await c.update({...original,entityId:2},uuid); assert.equal(c.appearanceId,'bundled:yui-ysm'); c.dispose()
  const d = create(); await d.update(original,uuid); assert.equal(d.appearanceId,'bundled:yui-ysm')
  await d.update({...original,uuid:other},other); assert.equal(d.appearanceId,'server')
  d.dispose(); const e = create('server-b'); await e.update(original,uuid); assert.equal(e.appearanceId,'server'); e.dispose()
  const f = create(); await f.update(original,uuid); f.selectAppearance('server'); f.dispose()
  const g = create('server-a','bundled:yui-ysm'); await g.update(original,uuid); assert.equal(g.appearanceId,'server'); g.dispose()
})


test('received own-player swimming pose survives absent optional metadata and preserves freshness checks', { skip: !catalog }, async () => {
  const { vanillaPlayerPresentation } = await import('../../host/vanilla-native-stream.mjs')
  const { actor } = await originals()
  const bot = {version:'1.21.1',_client:{uuid},inventory:{slots:[]},entity:{uuid,metadata:{0:16,6:3}}}
  try {
    const received = vanillaPlayerPresentation(bot).self
    assert.equal(received.pose,3)
    for(const key of ['climbing','flying','bodyYaw','headYaw']) assert.equal(Object.hasOwn(received,key),false)
    const f=frame(1000,{...received,onGround:false,inWater:true})
    assert.equal(applyNativeSelfPlayerMotion(actor,f,{now:1000}).clip,'swim')
    // Current water occupancy alone is not a received swimming pose.
    bot.entity.metadata={0:0,6:0}
    const standing=frame(1100,{...vanillaPlayerPresentation(bot).self,onGround:true,inWater:true})
    assert.equal(applyNativeSelfPlayerMotion(actor,standing,{now:1100}).clip,'idle')
    assert.match(applyNativeSelfPlayerMotion(actor,f,{now:3000}).reason,/STALE/)
    const reset=frame(3100,{...received,onGround:false,inWater:true}); reset.motion.epoch=0
    assert.match(applyNativeSelfPlayerMotion(actor,reset,{now:3100}).reason,/PHYSICS/)
  } finally {actor.dispose()}
})
