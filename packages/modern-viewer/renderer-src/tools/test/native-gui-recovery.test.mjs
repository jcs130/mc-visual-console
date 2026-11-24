import test from 'node:test';
import assert from 'node:assert/strict';
import {planNativeDirectorResume as plan,nativeGuiAttachmentPending as wait} from '../../host/native-director-policy.mjs';
import {nativeShotReceipt} from '../../../../../tools/native-client-director/shot-policy.mjs';
const fixture=()=>{
 const r={id:'request',lease:'lease',target:'Alice',targetUuid:'alice',issuedAt:10000,expiresAt:20000,nativeWorldEpoch:1,connectionEpoch:'epoch',view:'first_person'};
 const n={recordedAt:new Date(100000).toISOString(),renderedAt:100000,connected:true,authenticated:true,spectator:true,server:'fixture:1',observerUuid:'observer',phase:'attached',target:'Alice',targetUuid:'alice',cameraUuid:'alice',requestId:r.id,activeLease:r.lease,nativeWorldEpoch:2,connectionEpoch:'epoch',perspective:'FIRST_PERSON',
  offer:{id:r.id,lease:r.lease,target:r.target,accepted:true},cameraLife:{requestId:r.id,uuid:'alice',entityId:31,nativeWorldEpoch:2,dead:false,observedAttachedAt:100000},targets:[{name:'Alice',uuid:'alice',entityId:31,loaded:true,alive:true,spectator:false}]};
 return{enabled:true,observerAlive:true,selectorAlive:false,expectedServer:'fixture:1',expectedObserverUuid:'observer',previousEpoch:'epoch',now:100000,native:n,selector:{running:false,phase:'unknown_request_receipt',at:new Date(40000).toISOString(),pending:r}};
};
test('a late actual camera binding resumes once without claiming the old shot completed',()=>{
 const f=fixture(),p=plan(f);assert.equal(p.action,'start');assert.equal(p.reason,'late_native_attachment_confirmed');
 assert.equal(p.reconciliation.outcome,'camera_bound');assert.equal(p.reconciliation.completionVerified,false);assert.equal(p.reconciliation.requestedViewVerified,false);
 assert.equal(p.replayPreviousRequest,false);assert.equal(p.newLeaseRequired,true);assert.equal(p.archivePreviousStatus,true);
 assert.equal(plan({...f,recentResumes:4}).action,'hold');assert.equal(plan({...f,lastResumeAt:95000}).action,'hold');
});
test('late readback cannot restart manual/unknown/cancelled, stale, foreign or incomplete camera states',()=>{
 for(const patch of[{phase:'unknown'},{phase:'paused'},{phase:'cancelled'},{manualDetachRequested:true},{screenOpen:true},{viewDeferred:true},{cameraUuid:'observer'},
  {targetUuid:'other'},{activeLease:'other'},{requestId:'other'},{target:'Bob'},{observerUuid:'other'},{server:'other'},{renderedAt:90000},
  {recordedAt:new Date(90000).toISOString()},{nativeWorldEpoch:0},{transition:{active:true}},{targets:[]}]){
  const f=fixture();Object.assign(f.native,patch);assert.equal(plan(f).action,'hold',JSON.stringify(patch));
 }
 for(const patch of[{dead:true},{uuid:'other'},{requestId:'other'},{nativeWorldEpoch:1},{entityId:-1},{observedAttachedAt:90000},{observedAttachedAt:100001}]){
  const f=fixture();Object.assign(f.native.cameraLife,patch);assert.equal(plan(f).action,'hold');
 }
 for(const patch of[{stopRequested:true},{running:true},{phase:'director_stopped'}]){const f=fixture();Object.assign(f.selector,patch);assert.equal(plan(f).action,'hold');}
});
test('only fresh exact GUI attachment may extend waiting, never count as a rendered shot',()=>{
 const f=fixture(),n=f.native,r={...f.selector.pending,nativeWorldEpoch:2};n.screenOpen=true;n.viewDeferred=true;
 assert.equal(wait(n,r,f),true);assert.deepEqual(nativeShotReceipt(n,r,f.now),{kind:'waiting',reason:'native_gui_view_deferred'});
 for(const patch of[{viewDeferred:false},{screenOpen:false},{phase:'unknown'},{cameraUuid:'observer'},{activeLease:'other'},{manualDetachRequested:true},{recordedAt:new Date(90000).toISOString()}])assert.equal(wait({...n,...patch},r,f),false);
 assert.equal(wait(n,r,{now:f.now}),false);assert.equal(wait({...n,cameraLife:{...n.cameraLife,dead:true}},r,f),false);
 n.screenOpen=false;n.viewDeferred=false;assert.equal(nativeShotReceipt(n,r,f.now).kind,'applied');
});
