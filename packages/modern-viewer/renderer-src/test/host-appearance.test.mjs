import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {APPEARANCE_CHANNEL,PAPER_YSM_JAR_SHA256,parseAppearancePacket,createViewerAppearanceBridge} from '../host/viewer-appearance.mjs';
const uuid='5b3b3c00-781f-3ddb-8770-13749bdf4737',epoch='00000000-0000-4000-8000-000000000001';
const row={schemaVersion:1,type:'state',source:'freesia_worker',epoch,playerUuid:uuid,available:true,ysmVersion:'2.4.1',protocolVersion:'2.4.0',jarSha256:PAPER_YSM_JAR_SHA256,entityId:7,modelId:'alex',texture:'gsl',mandatory:true,animation:'idle'};
const packet=value=>({channel:APPEARANCE_CHANNEL,data:Buffer.from(JSON.stringify(value))});
test('only pinned server metadata is accepted, without native 2.6.5 ID aliases',()=>{
  assert.equal(parseAppearancePacket(packet(row)).modelId,'alex');
  assert.equal(parseAppearancePacket(packet({...row,modelId:'玩家/白猫',texture:'白色'})).modelId,'玩家/白猫');
  for(const patch of [{ysmVersion:'2.6.5'},{jarSha256:'0'.repeat(64)},{source:'client'},{entityId:-1},{mandatory:1},{epoch:'old'},{modelId:'../bad\\path'}])assert.equal(parseAppearancePacket(packet({...row,...patch})),null);
  assert.equal(parseAppearancePacket({...packet(row),data:Buffer.alloc(2049)}),null);
});
test('read-only observer binds actual UUID and entity ID; stale entity reuse never applies',()=>{
  const bot=Object.assign(new EventEmitter(),{_client:Object.assign(new EventEmitter(),{write(){throw Error('must stay read-only');}}),player:{uuid:'00000000-0000-3000-8000-000000000002'},entities:{7:{id:7,uuid}}});
  const bridge=createViewerAppearanceBridge(bot);const events=[];const off=bridge.subscribeSocket({emit:(name,value)=>events.push({name,value})});
  bot._client.emit('custom_payload',packet(row));assert.equal(bridge.snapshot()[0].entityId,7);assert.equal(bridge.snapshot()[0].renderAvailable,false);
  bot.entities[7].uuid='00000000-0000-3000-8000-000000000003';assert.equal(bridge.snapshot().length,0);
  bot._client.emit('custom_payload',packet({...row,entityId:8}));assert.equal(bridge.snapshot().length,0);
  bot.emit('respawn');assert.equal(bridge.snapshot().length,0);off();bridge.dispose();assert.equal(bot._client.listenerCount('custom_payload'),0);
});
test('own actor and server unavailable status stay distinct from geometry support',()=>{
  const bot=Object.assign(new EventEmitter(),{_client:new EventEmitter(),player:{uuid},entity:{id:7},entities:{}});const bridge=createViewerAppearanceBridge(bot);
  bot._client.emit('custom_payload',packet(row));assert.equal(bridge.snapshot()[0].available,true);
  bot._client.emit('custom_payload',packet({...row,available:false}));assert.equal(bridge.snapshot()[0].available,false);assert.equal(bridge.snapshot()[0].reason,'YSM_WORKER_STATE_UNAVAILABLE');
  bot._client.emit('custom_payload',packet({...row,type:'remove'}));assert.equal(bridge.snapshot().length,0);bridge.dispose();
});

test('heartbeats expire and peer unavailability keeps only a verified native binding',()=>{
  let clock=1000;
  const bot=Object.assign(new EventEmitter(),{_client:new EventEmitter(),entities:{7:{id:7,uuid}}});
  const bridge=createViewerAppearanceBridge(bot,{now:()=>clock});
  bot._client.emit('custom_payload',packet(row));
  bot._client.emit('custom_payload',packet({...row,available:false}));
  assert.equal(bridge.snapshot()[0].available,false);
  assert.equal('receivedAt' in bridge.snapshot()[0],false);
  clock+=15001;assert.equal(bridge.snapshot().length,0);
  bot._client.emit('custom_payload',packet(row));assert.equal(bridge.snapshot().length,1);
  bot.emit('respawn');assert.equal(bridge.snapshot().length,0);
  bot._client.emit('custom_payload',packet(row));assert.equal(bridge.snapshot().length,1);
  bridge.dispose();
});

test('a failed Web subscriber cannot interrupt the gameplay packet listener',()=>{
  const bot=Object.assign(new EventEmitter(),{_client:new EventEmitter(),entities:{7:{id:7,uuid}}});
  const bridge=createViewerAppearanceBridge(bot);let fail=false;
  bridge.subscribeSocket({emit(){if(fail)throw Error('viewer disconnected');}});fail=true;
  assert.doesNotThrow(()=>bot._client.emit('custom_payload',packet(row)));
  assert.equal(bridge.snapshot()[0].modelId,'alex');bridge.dispose();
});
