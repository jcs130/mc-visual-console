import test from 'node:test';
import assert from 'node:assert/strict';
import {directorConnectionRecovery as recover,directorTargetLoss as targetLoss,directorWorldReconciliation as reconcileWorld} from './connection-recovery.mjs';
test('a new world can be reconciled for the same rendered request without resending or claiming completion',()=>{
 const r={id:'request',lease:'lease',connectionEpoch:'connection',nativeWorldEpoch:1,targetUuid:'alice',issuedAt:1000};
 const n={connected:true,authenticated:true,phase:'attached',spectator:true,observerUuid:'observer',requestId:r.id,activeLease:r.lease,
   connectionEpoch:r.connectionEpoch,nativeWorldEpoch:2,targetUuid:'alice',cameraUuid:'alice',offer:{id:r.id,lease:r.lease,accepted:true},
   cameraLife:{requestId:r.id,uuid:'alice',entityId:12,nativeWorldEpoch:2,dead:false,observedAttachedAt:2000},renderedAt:2000,recordedAt:new Date(2000).toISOString()};
 const f={native:n,request:r,expectedObserverUuid:'observer',now:2100};
 assert.deepEqual(reconcileWorld(f),{requestId:'request',previousWorldEpoch:1,nativeWorldEpoch:2,targetUuid:'alice',requestReissued:false,completionVerified:false});
 assert.equal(r.nativeWorldEpoch,1,'the original request remains untouched');
 for(const patch of [{phase:'unknown'},{phase:'paused'},{manualDetachRequested:true},{connectionEpoch:'new'},{observerUuid:'other'},
   {requestId:'other'},{activeLease:'other'},{targetUuid:'other'},{cameraUuid:'observer'},{nativeWorldEpoch:1},{renderedAt:0},
   {transition:{active:true}},{offer:{...n.offer,accepted:false}},{cameraLife:{...n.cameraLife,dead:true}},
   {cameraLife:{...n.cameraLife,requestId:'old'}},{cameraLife:{...n.cameraLife,nativeWorldEpoch:1}}])assert.equal(reconcileWorld({...f,native:{...n,...patch}}),null,JSON.stringify(patch));
 assert.equal(reconcileWorld({...f,now:6000}),null,'stale attachments cannot rebind a pending request');
});
const input=()=>({enabled:true,previousEpoch:'old',expectedObserverUuid:'observer',targets:['Alice'],
  native:{connectionEpoch:'new',connected:true,authenticated:true,phase:'idle',observerUuid:'observer',cameraUuid:'observer'}});

const death=()=>({expectedTarget:'Alice',expectedUuid:'uuid-a',native:{phase:'stopped',reason:'target_died',
  connected:true,authenticated:true,spectator:true,target:'Alice',observerUuid:'observer',cameraUuid:'observer',
  nativeWorldEpoch:4,manualDetachRequested:false,cameraLife:{uuid:'uuid-a',entityId:31,nativeWorldEpoch:4,dead:true}}});
test('only native confirmed death on the same target/world yields a fresh selection cooldown',()=>{
  assert.deepEqual(targetLoss(death()),{reason:'target_died',cooldownMs:15000});
  const d=death();const old=structuredClone(d);targetLoss(d);assert.deepEqual(d,old,'readback classifier mutates no control state');
});
const positionFailure=()=>({expectedTarget:'Alice',expectedUuid:'uuid-a',native:{phase:'stopped',reason:'target_position_unconfirmed',
  connected:true,authenticated:true,spectator:true,target:'Alice',observerUuid:'observer',cameraUuid:'observer',manualDetachRequested:false,
  requestId:'position-failure',nativeWorldEpoch:5,offer:{id:'position-failure',lease:'lease-1'},
  positionFailure:{requestId:'position-failure',lease:'lease-1',targetUuid:'uuid-a',observerUuid:'observer',cameraUuid:'observer',nativeWorldEpoch:5,observedAt:10000,commands:2}}});
test('unconfirmed positioning with a proven self camera permits a different subject, not a teleport replay',()=>{
  assert.deepEqual(targetLoss(positionFailure()),{reason:'target_position_unconfirmed',cooldownMs:30000,previousTeleportOutcome:'unconfirmed',replayPreviousRequest:false});
});
test('position timeout recovery requires exact native request/lease/world and no attachment command',()=>{
  for(const patch of [{requestId:'other'},{lease:'other'},{targetUuid:'other'},{observerUuid:'other'},{cameraUuid:'other'},{nativeWorldEpoch:4},{commands:3},{observedAt:null}]){
    const f=positionFailure();Object.assign(f.native.positionFailure,patch);assert.equal(targetLoss(f),null,JSON.stringify(patch));
  }
  for(const patch of [{phase:'unknown'},{phase:'paused'},{manualDetachRequested:true}]){
    const f=positionFailure();Object.assign(f.native,patch);assert.equal(targetLoss(f),null,JSON.stringify(patch));
  }
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
test('packed recovery retains a proven death across missing camera and a later world',()=>{
 const f=death();Object.assign(f,{now:100000});Object.assign(f.native,{recordedAt:new Date(100000).toISOString(),connectionEpoch:'same',requestId:'accepted',activeLease:'lease',
  offer:{id:'accepted',lease:'lease',target:'Alice',accepted:true},terminalCameraLife:{...f.native.cameraLife,requestId:'accepted',observedAttachedAt:90000}});
 f.native.cameraUuid=null;assert.equal(targetLoss(f)?.action,'wait');
 f.native.cameraUuid='observer';f.native.nativeWorldEpoch=5;assert.equal(targetLoss(f)?.action,'reselect');
 f.native.manualDetachRequested=true;assert.equal(targetLoss(f),null);
});
