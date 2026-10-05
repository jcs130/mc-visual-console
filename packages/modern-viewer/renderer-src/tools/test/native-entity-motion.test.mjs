import test from 'node:test'
import assert from 'node:assert/strict'
import {createNativeEntityMotion,NATIVE_MOB_MOTION_SOURCE} from '../../src/native-viewer/native-entity-motion.js'
const entity=(name='minecraft:pig')=>({name,position:{x:0,y:64,z:0},yaw:0,pitch:0,headYaw:0,spawnedAt:1000,onGround:true,cues:[]})

test('original client defaults create no invented browser tick and unknown mobs remain unsupported',()=>{
  const motion=createNativeEntityMotion(entity())
  assert.equal(motion.current().tick,0);assert.equal(motion.current().source,NATIVE_MOB_MOTION_SOURCE)
  assert.deepEqual(motion.current().walk,{speedOld:0,speed:0,position:0})
  assert.equal(createNativeEntityMotion(entity('mod:unknown')),null)
})

test('received target interpolates exactly three actual ticks and follows original float walk smoothing',()=>{
  const mob=entity(),motion=createNativeEntityMotion(mob)
  const next={...mob,position:{x:3,y:64,z:0},yaw:90};motion.observe(next,'entity_move_look')
  assert.equal(motion.current().position.x,0)
  const first=motion.tick(next,1050),second=motion.tick(next,1100),third=motion.tick(next,1150)
  assert.equal(first.position.x,1);assert.equal(second.position.x,2);assert.equal(third.position.x,3)
  assert.equal(first.yaw,30);assert.equal(third.yaw,90)
  assert.equal(first.walk.speed,Math.fround(.4));assert.equal(first.bodyYaw,30)
  assert.equal(motion.current().tick,3)
})

test('native ground transitions drive slime squish, and actual sheep status starts eating countdown',()=>{
  const slime=entity('minecraft:slime'),motion=createNativeEntityMotion(slime)
  const landed=motion.tick(slime,1050)
  assert.equal(landed.slime.targetSquish,Math.fround(-.5*Math.fround(.6)))
  const jump=motion.tick({...slime,onGround:false},1100)
  assert.equal(jump.slime.targetSquish,Math.fround(.6))
  const sheep=entity('minecraft:sheep'),wool=createNativeEntityMotion(sheep),cue={...sheep,cues:[{sequence:4,kind:'entity_status',code:10}]}
  assert.equal(wool.tick(cue,1050).eatCounter,39);assert.equal(wool.tick(cue,1100).eatCounter,38)
})

test('chicken original flap defaults decay on ground; clock regression rejects unsupported time',()=>{
  const chicken=entity('minecraft:chicken'),motion=createNativeEntityMotion(chicken)
  assert.equal(motion.current().chicken.flap,0)
  const grounded=motion.tick(chicken,1050);assert.equal(grounded.chicken.flapSpeed,0)
  const flight=motion.tick({...chicken,onGround:false},1100);assert.equal(flight.chicken.flapSpeed,1)
  assert.throws(()=>motion.tick(chicken,1000),/CLOCK_INVALID/)
})
