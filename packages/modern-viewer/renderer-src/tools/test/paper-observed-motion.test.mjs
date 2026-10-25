import test from 'node:test';
import assert from 'node:assert/strict';
import {paperObservedLocomotion} from '../../host/paper-observed-motion.mjs';
import {PaperObservedPlayer} from '../../host/paper-observation.mjs';
import {bundledYsmMotionInput} from '../../src/native-viewer/native-bundled-ysm-motion.js';
import {applyNativeSelfPlayerMotion} from '../../src/native-viewer/native-self-player.js';
const uuid='01234567-89ab-3def-8123-456789abcdef',world='11111111-1111-3111-8111-111111111111';
const sample=(tick,x=0,extra={})=>({uuid,name:'ObservedAgent',entityId:8,world:{uuid:world,name:'minecraft:overworld',minY:-64,height:384},
 serverTick:tick,observedAt:100000+tick*50,position:{x,y:64,z:0},velocity:{x:0,y:0,z:0},yawDegrees:0,pitchDegrees:0,eyeHeight:1.62,
 gameTime:tick,dayTime:6000,health:20,onGround:true,sneaking:false,bodyYaw:0,headYaw:0,mainArm:'right',...extra});
const receipt=p=>({uuid,generation:world,available:true,player:p,packets:[],configurationPackets:[]});
function player(){return new PaperObservedPlayer({playerUuid:uuid,name:'ObservedAgent',registry:{},registrySha256:'a'.repeat(64),decodePacket:()=>{throw Error('unexpected decode');}});}
test('network-driven movement uses actual tick displacement without falsifying Paper velocity',()=>{
 const a=sample(1,0),b=sample(3,.4),v=paperObservedLocomotion(a,b);
 assert.equal(v.available,true);assert.equal(v.spanTicks,2);assert.deepEqual(v.velocity,{x:.2,y:0,z:0});assert.deepEqual(b.velocity,{x:0,y:0,z:0});
 assert.deepEqual(paperObservedLocomotion(b,sample(4,.4)).velocity,{x:0,y:0,z:0});
});
test('gaps, teleports, identity changes and old protocols never invent locomotion',()=>{
 const a=sample(1);
 for(const b of [sample(1),sample(0),sample(22,1),sample(2,9),sample(2,.2,{entityId:9}),sample(2,.2,{world:{uuid:'other'}}),sample(2,.2,{observedAt:102000})])
  assert.equal(paperObservedLocomotion(a,b).available,false);
 assert.equal(paperObservedLocomotion(a,sample(2,.2),true).available,false);
 assert.equal(paperObservedLocomotion(a,sample(undefined)),null);
});
test('duplicate Paper ticks retain their original motion sample; a new body resets it',()=>{
 const p=player();let ticks=0;p.on('physicsTick',()=>ticks++);
 p.ingest(receipt(sample(1)));p.ingest(receipt(sample(1,0,{observedAt:100090})));
 p.ingest(receipt(sample(3,.4)));assert.equal(ticks,2);assert.equal(p.motionSample().tick,3);
 const motion=p.presentation().self.locomotion;assert.equal(motion.spanTicks,2);assert.equal(motion.velocity.x,.2);
 p.ingest(receipt(sample(3,.4)));assert.deepEqual(p.presentation().self.locomotion,motion);assert.equal(ticks,2);
 assert.throws(()=>p.ingest(receipt(sample(2))),/TICK_REGRESSED/);assert.equal(p.latest.serverTick,3);
 p.ingest({...receipt(sample(1,5,{entityId:9})),generation:'22222222-2222-3222-8222-222222222222'});
 assert.equal(p.presentation().self.locomotion.available,false);assert.equal(ticks,3);p.close();
});
function frame(){const a=sample(1),b=sample(3,.4),locomotion=paperObservedLocomotion(a,b),self={...b,locomotion};return {epoch:1,pose:{yaw:0,pitch:0},selfPlayer:self,
 motion:{source:'same_player_physics_tick',schemaVersion:1,tickMs:50,tick:3,epoch:1,sampledAt:b.observedAt},
 presentation:{available:true,playerUuid:uuid,source:'paper_server_observation',sampledAt:b.observedAt,self}};}
test('YSM selects a walking speed from received displacement even when native impulse velocity is zero',()=>{
 const f=frame(),m=bundledYsmMotionInput(f,uuid,100150);assert.equal(m.horizontalSpeed,4);assert.equal(m.locomotionSource,'paper_position_delta');
 for(const patch of [{entityId:9},{playerUuid:world},{tick:4},{available:false},{spanTicks:0},{sampledAt:99000}]){
  const bad=structuredClone(f);Object.assign(bad.presentation.self.locomotion,patch);assert.throws(()=>bundledYsmMotionInput(bad,uuid,100150),/LOCOMOTION/);
 }
 const legacy=structuredClone(f);delete legacy.presentation.self.locomotion;legacy.presentation.self.velocity.x=.1;
 assert.equal(bundledYsmMotionInput(legacy,uuid,100150).horizontalSpeed,2);
});
test('fast same-body movement and pose reach animation before the next inventory frame',()=>{
 const f=frame();f.presentation.self={...f.presentation.self,pose:0,locomotion:{...f.selfPlayer.locomotion,tick:1}};
 f.selfPlayer={...f.selfPlayer,pose:3,usingItem:true,useItemRemainingTicks:25};const before=structuredClone(f);
 const actor={assetInfo:{source:'paper_server_appearance',uuid},applyMotion({current}){return bundledYsmMotionInput(current,uuid,100150);}};
 const m=applyNativeSelfPlayerMotion(actor,f,{now:100150});assert.equal(m.pose,'swimming');assert.equal(m.horizontalSpeed,4);assert.deepEqual(f,before);
});
