import test from 'node:test'
import assert from 'node:assert/strict'
import {createNativeActionSounds} from '../../src/native-viewer/native-action-sounds.js'
const blocks={'minecraft:stone':{volume:1,pitch:1,hit:'minecraft:block.stone.hit',break:'minecraft:block.stone.break',step:'minecraft:block.stone.step'}}
const sample=(time,x=0,events=[])=>({epoch:1,pose:{x,y:64,z:0},selfPlayer:{uuid:'self',onGround:true,surfaceBlock:'minecraft:stone'},
  presentation:{sampledAt:time,self:{inWater:false},activity:{sampledAt:time,playerUuid:'self',events,dig:null}}})
test('local digging uses the exact original block sound and cancels when the actual dig stops',()=>{
  let now=10000;const played=[],a=createNativeActionSounds({now:()=>now,play:v=>played.push(v)})
  const s=sample(now);s.presentation.activity.dig={name:'stone',position:{x:1,y:64,z:0},startedAt:now}
  a.observe(s,blocks);assert.equal(played[0].name,'block.stone.hit');assert.equal(played[0].volume,.25);assert.equal(played[0].pitch,.5)
  now+=100;a.observe(s,blocks);assert.equal(played.length,1)
  now+=200;a.observe(s,blocks);assert.equal(played.length,2)
  s.presentation.activity.dig=null;now+=300;a.observe(s,blocks);assert.equal(played.length,2)
})
test('own footsteps require real grounded travel and an exact known surface; teleports and sneaking are silent',()=>{
  let now=10000;const played=[],a=createNativeActionSounds({now:()=>now,play:v=>played.push(v)})
  a.observe(sample(now),blocks);now+=200;a.observe(sample(now,1.8),blocks);assert.equal(played[0].name,'block.stone.step')
  now+=200;a.observe(sample(now,20),blocks);assert.equal(played.length,1)
  const s=sample(now+200,22);s.selfPlayer.sneaking=true;a.observe(s,blocks);assert.equal(played.length,1)
  s.selfPlayer.sneaking=false;s.selfPlayer.surfaceBlock='mod:unknown';s.pose.x=24;a.observe(s,blocks);assert.equal(played.length,1)
})
test('retained activity is not replayed; fresh confirmed dig completion plays once, sent finish does not claim break',()=>{
  let now=10000;const played=[],a=createNativeActionSounds({now:()=>now,play:v=>played.push(v)})
  const event=(id,kind)=>({id,kind,at:now,name:'stone',position:{x:1,y:64,z:0}})
  a.observe(sample(now,0,[event(1,'dig_completed')]),blocks);assert.equal(played.length,0)
  now+=200;const s=sample(now,0,[event(1,'dig_completed'),event(2,'dig_finish_sent'),event(3,'dig_completed')])
  a.observe(s,blocks);a.observe(s,blocks);assert.equal(played.length,1);assert.equal(played[0].name,'block.stone.break')
  now+=4000;a.observe(sample(now-4000,0,[event(4,'dig_completed')]),blocks);assert.equal(played.length,1)
})
test('disconnect resets activity and never maps mod blocks to a vanilla approximation',()=>{
  let now=10000;const played=[],a=createNativeActionSounds({now:()=>now,play:v=>played.push(v)})
  const s=sample(now);s.presentation.activity.dig={name:'mod:stone',position:{x:1,y:64,z:0}}
  a.observe(s,blocks);assert.equal(played.length,0);a.reset()
  now+=200;a.observe(sample(now,10,[{id:5,kind:'slot_click',at:now}]),blocks);assert.equal(played.length,0)
})
