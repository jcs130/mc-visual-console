import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { observeVanillaHands } from '../../host/vanilla-hand-state.mjs'
import { nativeHandAnimation, nativeHandUse, nativeFirstPersonConsumeMatrix, nativeFirstPersonSwingMatrix, nativeFirstPersonEmptyArmMatrix, nativeThirdPersonSwingPose } from '../../src/native-viewer/native-first-person-motion.js'

const uuid = '01234567-89ab-cdef-0123-456789abcdef'
function fixture() {
  const bot = new EventEmitter(), client = new EventEmitter(), serializer = new EventEmitter()
  serializer.createPacketBuffer = ({params}) => Buffer.from([0x36,params.hand])
  Object.assign(client,{uuid,state:'play',serializer})
  Object.assign(bot,{version:'1.21.1',_client:client,entity:{id:3,uuid,metadata:[],effects:{}},usingHeldItem:false,settings:{mainHand:'left'}})
  return {bot,serializer}
}
test('own serialized swing, configured hand and actual use state survive with no writes', () => {
  const {bot,serializer} = fixture(); let time=1000
  const hands=observeVanillaHands(bot,{now:()=>time})
  hands.snapshot(); serializer.emit('data',Buffer.from([0x36,0]))
  let state=hands.snapshot(); assert.equal(state.mainArm,'left'); assert.equal(state.swing.hand,'mainhand')
  time=1050; serializer.emit('data',Buffer.from([0x36,0])); assert.equal(hands.snapshot().swing.startedAt,1000)
  serializer.emit('data',Buffer.from([0x06,1])); assert.equal(hands.snapshot().swing.sequence,1)
  bot.usingHeldItem=true; assert.equal(hands.snapshot().usingItem,true)
  time=1400; assert.equal(hands.snapshot().swing,null)
  bot.emit('spawn'); assert.equal(hands.snapshot().swing,null)
  hands.close(); assert.equal(serializer.listenerCount('data'),0); assert.equal(bot.listenerCount('spawn'),0)
})
test('pre-play serializers are never asked to construct a game packet', () => {
  const {bot,serializer}=fixture(); bot._client.state='login'
  serializer.createPacketBuffer=()=>assert.fail('not in PLAY')
  const hands=observeVanillaHands(bot); assert.equal(serializer.listenerCount('data'),0); hands.close()
})
test('first-person animation respects UUID/entity/freshness and original matrix endpoints', () => {
  const self={uuid,entityId:3,handAnimation:{source:'same_player_vanilla_hand_packets',playerUuid:uuid,entityId:3,
    sampledAt:1000,mainArm:'left',usingItem:false,spinAttack:false,swing:{hand:'mainhand',startedAt:1000,durationTicks:6,sequence:1}}}
  assert.equal(nativeHandAnimation(self,'left',1150).progress,.5)
  assert.equal(nativeHandAnimation(self,'right',1150).progress,0)
  assert.equal(nativeHandAnimation(self,'left',3000),null)
  assert.equal(nativeHandAnimation({...self,entityId:4},'left',1150),null)
  const origin=nativeFirstPersonSwingMatrix(0,'right')
  assert.ok(Math.abs(origin.elements[12]-.56)<1e-6); assert.ok(Math.abs(origin.elements[13]+.52)<1e-6)
  assert.notDeepEqual(nativeFirstPersonSwingMatrix(.5,'right').elements,origin.elements)
  assert.ok(nativeFirstPersonEmptyArmMatrix(.5,'left').elements.every(Number.isFinite))
})
test('observed humanoid swings move the attacking arm and torso, and reset at rest', () => {
  const base=Object.fromEntries(['rightArm','leftArm','rightLeg','leftLeg'].map(key=>[key,{x:0,y:0,z:0}]))
  const pose=nativeThirdPersonSwingPose(base,.5,'right',0)
  assert.ok(Math.abs(pose.bodyYaw)>.1);assert.ok(pose.rotations.rightArm.x<-.5)
  assert.notEqual(pose.positions.right.z,0)
  const rest=nativeThirdPersonSwingPose(base,0,'right',0)
  assert.equal(rest.positions.right.x,-5);assert.equal(rest.positions.left.x,5)
  assert.equal(rest.rotations.rightArm.x,0)
})

test('consumption timing observes one actual outgoing packet, no restart on snapshots, and stops on release/item/identity change',()=>{
  const {bot}=fixture(),writes=[];bot._client.write=(...args)=>writes.push(args);bot.registry={foodsByName:{apple:{}}}
  bot.heldItem={name:'apple',count:1,components:[],removedComponents:[]};let time=1000
  const hands=observeVanillaHands(bot,{now:()=>time});bot.usingHeldItem=true
  bot._client.write('use_item',{hand:0});assert.equal(writes.length,1)
  let state=hands.snapshot();assert.equal(state.use.durationTicks,32);assert.equal(state.use.kind,'eat')
  time=1350;state=hands.snapshot();assert.equal(state.use.startedAt,1000)
  const self={uuid,entityId:3,handAnimation:state},use=nativeHandUse(self,'left',{name:'minecraft:apple'},time)
  assert.ok(use);assert.equal(nativeHandUse(self,'right',{name:'minecraft:apple'},time),null)
  assert.equal(nativeHandUse(self,'left',{name:'minecraft:stick'},time),null)
  assert.equal(nativeHandUse({...self,entityId:4},'left',{name:'minecraft:apple'},time),null)
  assert.notDeepEqual(nativeFirstPersonConsumeMatrix(use.remainingTicks,32,'left').elements,nativeFirstPersonConsumeMatrix(32,32,'left').elements)
  bot._client.write('block_dig',{status:5});assert.equal(hands.snapshot().use,null)
  bot._client.write('use_item',{hand:0});bot.heldItem=null;assert.equal(hands.snapshot().use,null)
  bot.heldItem={name:'honey_bottle',count:1,components:[],removedComponents:[]};bot._client.write('use_item',{hand:0});assert.equal(hands.snapshot().use.durationTicks,40)
  bot.emit('respawn');assert.equal(hands.snapshot().use,null);hands.close();assert.equal(bot._client.listenerCount('packet'),0)
})
