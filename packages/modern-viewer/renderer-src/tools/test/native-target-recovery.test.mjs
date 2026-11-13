import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeTargetDeathRecovery as death,planNativeDirectorResume as resume,NativeCameraPacing} from '../../host/native-director-policy.mjs';
import {directorTargetLoss} from '../../../../../tools/native-client-director/connection-recovery.mjs';
const now=100000;
const fixture=()=>({expectedTarget:'Alice',expectedUuid:'alice',now,native:{
 recordedAt:new Date(now).toISOString(),connected:true,authenticated:true,spectator:true,server:'fixture:1',
 phase:'stopped',reason:'target_died',observerUuid:'observer',cameraUuid:'observer',target:'Alice',targetUuid:'alice',
 connectionEpoch:'same',nativeWorldEpoch:4,requestId:'accepted',activeLease:'lease',
 offer:{id:'accepted',lease:'lease',target:'Alice',accepted:true,at:90000},
 terminalCameraLife:{uuid:'alice',requestId:'accepted',entityId:31,nativeWorldEpoch:4,dead:true,observedAttachedAt:91000},
 observerAccess:{mode:'bound-player',boundTargetUuid:'alice'},
 targets:[{name:'Alice',uuid:'alice',entityId:32,loaded:true,alive:true,spectator:false,sampledAt:now}]}});
test('historical death survives respawn world replacement; current camera loss waits without replay',()=>{
 const f=fixture();assert.equal(death(f).action,'reselect');f.native.nativeWorldEpoch=5;
 assert.equal(directorTargetLoss(f).action,'reselect');
 f.native.cameraUuid=null;assert.equal(directorTargetLoss(f).action,'wait');
 f.native.cameraUuid='alice';assert.equal(directorTargetLoss(f).action,'reselect');
 assert.equal(death(f).completionVerified,false);assert.equal(death(f).replayPreviousRequest,false);
 assert.equal(f.native.terminalCameraLife.nativeWorldEpoch,4,'death evidence must not be rewritten to the new world');
});
test('same-UUID corpse is never adopted as a living respawn; absence of a roster does not prove it',()=>{
 for(const patch of[{alive:false},{loaded:false},{sampledAt:now-4000},{sampledAt:now+1001},{uuid:'foreign'},{spectator:true}]){
  const f=fixture();f.native.cameraUuid='alice';Object.assign(f.native.targets[0],patch);
  assert.equal(death(f).action,'wait',JSON.stringify(patch));
 }
 const f=fixture();f.native.cameraUuid='alice';f.native.targets=[];assert.equal(death(f).action,'wait');
});
test('fresh alive readback may reuse the old numeric entity ID, but never completes the old request',()=>{
 const f=fixture();f.native.cameraUuid='alice';f.native.targets[0].entityId=31;
 const r=death(f);assert.equal(r.action,'reselect');assert.equal(r.completionVerified,false);assert.equal(r.replayPreviousRequest,false);
});
test('changed request, lease, observer binding, death identity and manual control reject recovery',()=>{
 for(const patch of[{requestId:'other'},{activeLease:'other'},{target:'Bob'},{cameraUuid:'foreign'},
  {nativeWorldEpoch:3},{phase:'paused'},{phase:'unknown'},{phase:'cancelled'},{manualDetachRequested:true},
  {connected:false},{authenticated:false},{spectator:false},{recordedAt:new Date(now-6000).toISOString()},
  {observerAccess:{mode:'bound-player',boundTargetUuid:'other'}}]){
  const f=fixture();Object.assign(f.native,patch);assert.equal(directorTargetLoss(f),null,JSON.stringify(patch));
 }
 for(const patch of[{uuid:'other'},{requestId:'other'},{entityId:-1},{nativeWorldEpoch:5},{dead:false},{observedAttachedAt:now+1001}]){
  const f=fixture();Object.assign(f.native.terminalCameraLife,patch);assert.equal(death(f),null,JSON.stringify(patch));
 }
});
test('a diagnostic published during the asynchronous file read does not turn a known death into a fatal stop',()=>{
 const f=fixture();f.native.recordedAt=new Date(now+25).toISOString();assert.equal(directorTargetLoss(f).action,'reselect');
 f.native.cameraUuid='alice';f.native.targets[0].sampledAt=now+25;assert.equal(directorTargetLoss(f).action,'reselect');
});
const stopped=()=>({enabled:true,observerAlive:true,selectorAlive:false,expectedServer:'fixture:1',expectedObserverUuid:'observer',previousEpoch:'same',now,
 native:fixture().native,selector:{running:false,phase:'native_stopped_requires_review',at:new Date(now-1000).toISOString(),pending:null,
 knownTargetLoss:{requestId:'accepted',connectionEpoch:'same',target:'Alice',uuid:'alice',reason:'target_died'}}});
test('supervision recovers the proven same-connection death stop with a new lease, never an old action',()=>{
 const f=stopped(),r=resume(f);assert.equal(r.action,'start');assert.equal(r.reconciliation.kind,'target_death');
 assert.equal(r.reconciliation.completionVerified,false);assert.equal(r.replayPreviousRequest,false);assert.equal(r.newLeaseRequired,true);
 f.native.nativeWorldEpoch=5;assert.equal(resume(f).action,'start');
 f.native.cameraUuid=null;assert.equal(resume(f).action,'hold');
 f.native.cameraUuid='alice';assert.equal(resume(f).action,'start');
 assert.equal(resume({...f,recentResumes:4}).action,'hold');
 for(const patch of[{phase:'unknown_request_receipt'},{stopRequested:true},{pending:{id:'unsettled'}},{running:true},
  {knownTargetLoss:null},{knownTargetLoss:{...f.selector.knownTargetLoss,connectionEpoch:'old'}},
  {knownTargetLoss:{...f.selector.knownTargetLoss,uuid:'other'}}]){
  const x=structuredClone(f);Object.assign(x.selector,patch);assert.equal(resume(x).action,'hold',JSON.stringify(patch));
 }
});
test('pacing allows a fresh respawn attachment only for its verified target',()=>{
 const f=fixture();f.native.cameraUuid='alice';const pacing=new NativeCameraPacing({now:()=>now,currentView:()=> 'first_person'});
 const choice={name:'Alice',view:'first_person',kind:'overview'};
 assert.equal(pacing.check(choice,f.native,{recovery:true}).allow,true);
 assert.equal(pacing.check({...choice,name:'Bob'},f.native,{recovery:true}).allow,false);
 f.native.cameraUuid=null;assert.equal(pacing.check(choice,f.native,{recovery:true}).allow,false);
});
