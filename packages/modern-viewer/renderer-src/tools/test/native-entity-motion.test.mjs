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

test('maid client hurt countdown uses only received 1.21.1 hurt_animation and missing events remain explicit',()=>{
  const maid={...entity('touhou_little_maid:maid'),metadata:new Map([[9,{value:20}]])},motion=createNativeEntityMotion(maid)
  motion.observe(maid,'entity_metadata')
  motion.observe({...maid,cues:[{sequence:1,kind:'entity_status',code:2}]},'entity_status')
  assert.equal(motion.current().maid.hurtTime,0,'obsolete status 2 is not a hurt animation packet')
  const damaged={...maid,metadata:new Map([[9,{value:18}]])}
  motion.observe(damaged,'entity_metadata');assert.equal(motion.current().maid.hurtPending,true)
  const hurt={...damaged,cues:[{sequence:2,kind:'hurt_animation',yaw:90}]}
  motion.observe(hurt,'hurt_animation');assert.equal(motion.current().maid.hurtTime,10);assert.equal(motion.current().maid.hurtPending,false)
  for(let tick=1;tick<=10;tick++)assert.equal(motion.tick(hurt,1000+tick*50).maid.hurtTime,10-tick)
  motion.observe({...hurt,cues:[...hurt.cues,{sequence:3,kind:'animation',code:0}]},'animation')
  assert.equal(motion.current().maid.swingPending,true,'no invented swing duration or effect amplifier')
})

test('maid client swim history follows received flags and cannot silently return to a dry pose mid-blend',()=>{
  const maid={...entity('touhou_little_maid:maid'),metadata:new Map([[0,{value:16}]])},motion=createNativeEntityMotion(maid)
  assert.equal(motion.tick(maid,1050).maid.swimAmount,Math.fround(.09))
  const dry={...maid,metadata:new Map([[0,{value:0}]])},state=motion.tick(dry,1100)
  assert.equal(state.maid.swimAmount,0);assert.equal(state.maid.swimAmountOld,Math.fround(.09))
  assert.equal(motion.tick(dry,1150).maid.swimAmountOld,0)
})

test('maid native animation payload retains received IDs until the original NONE event, never from status guesses',()=>{
  const maid=entity('touhou_little_maid:maid'),motion=createNativeEntityMotion(maid)
  for(const [sequence,code]of [[1,1],[2,2],[3,3],[4,4],[5,0]]){
    const next={...maid,cues:[{sequence,kind:'maid_animation',code}]}
    motion.observe(next,'maid_animation');assert.equal(motion.current().maid.animationId,code)
    assert.equal(motion.tick(next,1000+sequence*50).maid.animationId,code)
  }
  motion.observe({...maid,cues:[{sequence:4,kind:'maid_animation',code:4}]},'maid_animation')
  assert.equal(motion.current().maid.animationId,0,'older events cannot restore a completed animation')
  motion.observe({...maid,cues:[{sequence:6,kind:'entity_status',code:1}]},'entity_status')
  assert.equal(motion.current().maid.animationId,0)
})
