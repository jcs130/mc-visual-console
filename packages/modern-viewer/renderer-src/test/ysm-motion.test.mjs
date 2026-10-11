import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createViewerYsmMotion} from '../host/viewer-ysm-motion.mjs';
const uuid='00000000-0000-3000-8000-000000000001';
function fixture(){let clock=1000;const entity={id:7,uuid,position:{x:0,y:64,z:0},yaw:0,headYaw:.5,pitch:-.2,metadata:{0:8,6:0,8:3,18:0},equipment:[{name:'diamond_sword',count:1},{name:'torch',count:12}]};const bot=Object.assign(new EventEmitter(),{entities:{7:entity},_client:new EventEmitter()});const events=[];const row={playerUuid:uuid,entityId:7,epoch:'epoch',available:true};const bridge=createViewerYsmMotion(bot,{now:()=>clock,binding:id=>id===7?row:null,emit:(name,value)=>events.push({name,value})});return {bot,entity,row,events,bridge,time:n=>clock=n};}
test('same connection emits actual equipment/flags, ground packets and movement in blocks per second',()=>{
  const f=fixture();f.bridge.send(f.row);let motion=f.events.at(-1).value;
  assert.equal(motion.mainArm,'left');assert.equal(motion.pose,'standing');assert.equal(motion.usingItem,true);assert.equal(motion.activeHand,'offhand');assert.equal(motion.equipment[0].name,'diamond_sword');assert.equal(motion.onGround,undefined);
  f.bot._client.emit('packet',{entityId:7,onGround:true},{name:'rel_entity_move'});f.time(1100);f.entity.position.x=.4;f.bot.emit('entityMoved',f.entity);motion=f.events.at(-1).value;
  assert.equal(motion.horizontalSpeed,4);assert.equal(motion.onGround,true);assert.ok(motion.headPitchDegrees>0);
  f.time(1400);f.bridge.send(f.row);assert.equal(f.events.at(-1).value.horizontalSpeed,0);
  f.time(1500);f.entity.position.x=500;f.bot.emit('entityMoved',f.entity);assert.equal(f.events.at(-1).value.horizontalSpeed,0);f.bridge.dispose();
});
test('actual animation packet identifies offhand, repeated attacks and hurt once, never borrowed by reused ID',()=>{
  const f=fixture();f.bot._client.emit('animation',{entityId:7,animation:3});const first=f.events.at(-1).value;
  assert.equal(first.swing.hand,'offhand');assert.equal(first.swing.ageSeconds,0);
  f.time(1200);f.bot._client.emit('animation',{entityId:7,animation:0});assert.ok(f.events.at(-1).value.swing.sequence>first.swing.sequence);
  f.bot.emit('entityHurt',f.entity);assert.equal(f.events.at(-1).value.hurt.ageSeconds,0);
  f.entity.uuid='00000000-0000-3000-8000-000000000002';const count=f.events.length;
  f.bot._client.emit('animation',{entityId:7,animation:0});assert.equal(f.events.length,count);
  f.bridge.dispose();assert.equal(f.bot._client.listenerCount('animation'),0);assert.equal(f.bot.listenerCount('entityMoved'),0);
});
test('unknown/oversized item visual data is flagged; resetting drops old actions',()=>{
  const f=fixture();f.entity.equipment[0].components=[{name:'custom_model_data',value:'x'.repeat(9000)}];f.bridge.send(f.row);
  assert.equal(f.events.at(-1).value.equipment[0].visualDataUnavailable,true);
  f.bot._client.emit('animation',{entityId:7,animation:0});f.bridge.reset();f.bridge.send(f.row);assert.equal(f.events.at(-1).value.swing,undefined);f.bridge.dispose();
});

test('own arm packets are observed without changing writes, and unrelated outgoing bytes are not parsed',()=>{
  const f=fixture();f.bridge.dispose();f.bot.version='1.20.6';f.bot.entity=f.entity;f.bot._client.uuid=uuid;f.bot._client.state='play';
  const serializer=new EventEmitter();let parsed=0;
  serializer.createPacketBuffer=()=>Buffer.from([0x36,0]);serializer.mainType='packet';
  serializer.proto={parsePacketBuffer(_type,bytes){parsed++;return {data:{name:'arm_animation',params:{hand:bytes[1]}}};}};
  f.bot._client.serializer=serializer;const originalWrite=()=>{};f.bot._client.write=originalWrite;
  const bridge=createViewerYsmMotion(f.bot,{now:()=>1000,binding:id=>id===7?f.row:null,emit:(name,value)=>f.events.push({name,value})});
  serializer.emit('data',Buffer.from([0x06,1]));serializer.emit('data',Buffer.from([0x36,0,1]));assert.equal(parsed,0);
  serializer.emit('data',Buffer.from([0x36,1]));assert.equal(f.events.at(-1).value.swing.hand,'offhand');assert.equal(parsed,1);
  assert.equal(f.bot._client.write,originalWrite);bridge.dispose();assert.equal(serializer.listenerCount('data'),0);
});
