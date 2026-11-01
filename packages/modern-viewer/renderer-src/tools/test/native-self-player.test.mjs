import test from 'node:test'
import assert from 'node:assert/strict'
import { applyNativeSelfPlayerMotion, NativeSelfPlayerController } from '../../src/native-viewer/native-self-player.js'
import { NATIVE_YSM_SOURCE, NATIVE_YSM_JAR_SHA256 } from '../../src/native-viewer/native-ysm-state.js'

const UUID = '01234567-89ab-cdef-0123-456789abcdef'
const OTHER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

test('an observed encrypted server YSM stays explicit and never becomes a default skin',async()=>{
  let substitutes=0;const controller=new NativeSelfPlayerController({manifest:{sources:[],assets:{}}},{minecraftFactory:async()=>{substitutes++;throw Error('unexpected replacement')},ysmFactory:async()=>{substitutes++;throw Error('unexpected replacement')}});
  const self={uuid:UUID,entityId:7,paperAppearance:{playerUuid:UUID,entityId:7,available:false,nativeAvailable:true,modelId:'original.ysm',texture:'white',ysmVersion:'2.6.5',reason:'YSM_WEB_SOURCE_UNAVAILABLE'}};
  assert.equal(await controller.update(self,UUID),null);assert.equal(substitutes,0);assert.match(controller.appearance().status,/原作者公开/);assert.equal(controller.appearance().unavailable,true);assert.equal(controller.appearance().serverModel.modelId,'original.ysm');
  await controller.update({...self,paperAppearance:{...self.paperAppearance,playerUuid:OTHER}},UUID);assert.match(controller.appearance().status,/IDENTITY/);assert.equal(substitutes,0);controller.dispose();
});

test('Paper body/head yaw share the actor/camera display interval without changing authoritative samples',()=>{
 let received
 const actor={assetInfo:{kind:'ysm',uuid:UUID},applyMotion:input=>{received=input}}
 const self={uuid:UUID,bodyYaw:-3,headYaw:3},current={pose:{yaw:1},presentation:{self},selfPlayer:{uuid:UUID}}
 const before=structuredClone(current),displayPose={yaw:.5,bodyYaw:3.14,headYaw:3.1}
 applyNativeSelfPlayerMotion(actor,current,{displayPose,now:200})
 assert.equal(received.current.presentation.self.bodyYaw,3.14);assert.equal(received.self.headYaw,3.1)
 assert.strictEqual(received.current.pose,displayPose);assert.deepEqual(current,before)
 assert.equal(received.self.uuid,UUID)
})

test('YSM receives the same native self motion and server tick with seconds from RAF', () => {
  let received
  const actor = { assetInfo: { kind: 'ysm', uuid: UUID }, applyMotion: input => { received = input; return { available: true, state: 'walk' } } }
  const motion = { playerUuid: UUID, source: 'server_player_motion', serverTick: 9101, onGround: true }
  const self = { playerUuid: UUID, motion }
  const current = { presentation: { self }, motion: { proxyField: 'must-not-replace-native-row' }, pose: { yaw: 0 } }
  assert.deepEqual(applyNativeSelfPlayerMotion(actor, current, { dt: .016, now: 1234 }), { available: true, state: 'walk' })
  assert.strictEqual(received.self, self); assert.strictEqual(received.self.motion, motion)
  assert.strictEqual(received.current, current); assert.equal(received.self.motion.serverTick, 9101)
  assert.equal(received.dt, .016); assert.equal(received.now, 1234)
  for (const [dt, expected] of [[5, .1], [-.1, 0], [NaN, 0], [Infinity, 0]]) {
    applyNativeSelfPlayerMotion(actor, current, { dt, now: 1234 }); assert.equal(received.dt, expected)
  }
})

test('fast same-body velocity and ground samples update animation without replacing inventory or native mod motion',()=>{
 let input;const actor={assetInfo:{kind:'ysm',uuid:UUID},applyMotion:value=>{input=value}}
 const nativeMotion={serverTick:7},self={uuid:UUID,entityId:8,onGround:true,velocity:{x:0,y:0,z:0},motion:nativeMotion,equipment:{mainHand:'original'}}
 const current={presentation:{self},selfPlayer:{uuid:UUID,entityId:8,velocity:{x:.2,y:.1,z:0},onGround:false,sprinting:true,sneaking:false},pose:{yaw:0}}
 const before=structuredClone(current);applyNativeSelfPlayerMotion(actor,current,{now:1000})
 assert.equal(input.self.onGround,false);assert.equal(input.self.velocity.x,.2);assert.equal(input.self.sprinting,true)
 assert.strictEqual(input.self.motion,nativeMotion);assert.strictEqual(input.self.equipment,self.equipment);assert.deepEqual(current,before)
 applyNativeSelfPlayerMotion(actor,{...current,selfPlayer:{...current.selfPlayer,entityId:9}},{now:1000});assert.strictEqual(input.self,self)
})

test('missing YSM motion remains missing and foreign native self never reaches the actor', () => {
  const calls = []
  const actor = { assetInfo: { kind: 'ysm', uuid: UUID }, applyMotion: input => calls.push(input) }
  const current = { motion: { speed: 2 }, selfPlayer: { uuid: UUID, onGround: true, sneaking: false } }
  applyNativeSelfPlayerMotion(actor, current, { now: 20 })
  assert.equal(calls[0].self, null); assert.strictEqual(calls[0].current, current)
  assert.equal(calls[0].dt, 0)
  assert.throws(() => applyNativeSelfPlayerMotion(actor, { ...current, presentation: { self: { playerUuid: OTHER, motion: { serverTick: 1 } } } }), /MOTION_IDENTITY_MISMATCH/)
  assert.equal(calls.length, 1)
})

test('Minecraft retains the existing walking contract and motion freshness time', () => {
  const calls = [], motion = { speed: .1 }
  const actor = { assetInfo: { kind: 'minecraft', uuid: UUID }, applyMotion: (...args) => calls.push(args) }
  const current = { motion, presentation: { self: { crouching: false } }, selfPlayer: { onGround: true } }
  applyNativeSelfPlayerMotion(actor, current, { dt: .016, now: 200 })
  assert.deepEqual(calls[0], [motion, 200])
  applyNativeSelfPlayerMotion(actor, { ...current, selfPlayer: { onGround: false } }, { now: 201 })
  assert.deepEqual(calls[1], [null, 201])
  applyNativeSelfPlayerMotion(actor, { ...current, presentation: { self: { crouching: true } } }, { now: 202 })
  assert.deepEqual(calls[2], [null, 202])
})

test('controller publishes the actual actor support notice rather than a static-only label', async () => {
  const changes = [], notice = 'YSM 原模型 · 原生站立/行走/跑步/跳跃已接入'
  const candidate = { assetInfo: { kind: 'ysm', uuid: UUID, support: { notice } }, dispose () {} }
  const controller = new NativeSelfPlayerController({ manifest: { sources: [{ name: 'ysm-locked.jar' }], assets: {} } }, {
    ysmFactory: async () => candidate, onChange: (actor, status) => changes.push({ actor, status }) })
  await controller.update({ uuid: UUID }, UUID, { available: true, installed: true, enabled: true, mandatory: true,
    source: NATIVE_YSM_SOURCE, playerUuid: UUID, ysmVersion: '2.6.5', jarSha256: NATIVE_YSM_JAR_SHA256,
    modelId: 'misc/3_default_boy', texture: 'blue' })
  assert.strictEqual(changes.at(-1).actor, candidate); assert.equal(changes.at(-1).status, notice)
  controller.dispose()
})
