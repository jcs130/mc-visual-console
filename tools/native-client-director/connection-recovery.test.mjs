import test from 'node:test';
import assert from 'node:assert/strict';
import {directorConnectionRecovery as recover,directorTargetLoss as targetLoss} from './connection-recovery.mjs';
const input=()=>({enabled:true,previousEpoch:'old',expectedObserverUuid:'observer',targets:['Alice'],
  native:{connectionEpoch:'new',connected:true,authenticated:true,phase:'idle',observerUuid:'observer',cameraUuid:'observer'}});

const death=()=>({expectedTarget:'Alice',expectedUuid:'uuid-a',native:{phase:'stopped',reason:'target_died',
  connected:true,authenticated:true,spectator:true,target:'Alice',observerUuid:'observer',cameraUuid:'observer',
  nativeWorldEpoch:4,manualDetachRequested:false,cameraLife:{uuid:'uuid-a',entityId:31,nativeWorldEpoch:4,dead:true}}});
test('only native confirmed death on the same target/world yields a fresh selection cooldown',()=>{
  assert.deepEqual(targetLoss(death()),{reason:'target_died',cooldownMs:15000});
  const d=death();const old=structuredClone(d);targetLoss(d);assert.deepEqual(d,old,'readback classifier mutates no control state');
});
test('manual pause, unknown result, another camera and unproven death never recover',()=>{
  for(const patch of [{phase:'paused'},{phase:'unknown'},{manualDetachRequested:true},{cameraUuid:'foreign'},
      {connected:false},{authenticated:false},{spectator:false},{target:'Bob'},{cameraLife:null}]){
    const d=death();Object.assign(d.native,patch);assert.equal(targetLoss(d),null,JSON.stringify(patch));
  }
  for(const patch of [{uuid:'uuid-b'},{entityId:-1},{nativeWorldEpoch:3},{dead:false}]){
    const d=death();Object.assign(d.native.cameraLife,patch);assert.equal(targetLoss(d),null,JSON.stringify(patch));
  }
});
test('a confirmed fresh observer connection permits only a new camera lease',()=>{
  const result=recover(input());assert.equal(result.action,'recover');assert.equal(result.newLeaseRequired,true);
  assert.equal(result.replayPreviousRequest,false);assert.equal(result.previousOutcome,'unknown_unless_previously_confirmed');
});
test('connection recovery is explicit opt-in and does not alter an unchanged connection',()=>{
  assert.equal(recover({...input(),enabled:false}).action,'stop');
  const i=input();i.native.connectionEpoch='old';assert.deepEqual(recover(i),{action:'unchanged'});
});
test('authentication, account identity and known camera identity remain required',()=>{
  for(const patch of [{authenticated:false},{connected:false}]){
    const i=input();Object.assign(i.native,patch);assert.equal(recover(i).action,'wait');
  }
  for(const patch of [{observerUuid:'other'},{cameraUuid:'unknown'},{phase:'unknown'}]){
    const i=input();Object.assign(i.native,patch);assert.equal(recover(i).action,'stop');
  }
});
test('manual pause is preserved across reconnection',()=>{
  const i=input();i.native.phase='paused';assert.equal(recover(i).reason,'manual_or_native_detach');
});
test('an already attached camera is accepted only with matched native UUID and allowed target',()=>{
  const i=input();Object.assign(i.native,{phase:'attached',target:'Alice',targetUuid:'alice',cameraUuid:'alice'});
  assert.equal(recover(i).action,'recover');i.native.target='unlisted';assert.equal(recover(i).action,'stop');
});
