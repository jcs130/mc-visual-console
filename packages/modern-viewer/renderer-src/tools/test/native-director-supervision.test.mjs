import test from'node:test';import assert from'node:assert/strict';import{planNativeDirectorResume as plan}from'../../host/native-director-policy.mjs';
const fixture=()=>({enabled:true,observerAlive:true,selectorAlive:false,expectedServer:'fixture:1',expectedObserverUuid:'observer',previousEpoch:'old',now:100000,
 native:{recordedAt:new Date(100000).toISOString(),connected:true,authenticated:true,spectator:true,server:'fixture:1',observerUuid:'observer',cameraUuid:'observer',phase:'idle',connectionEpoch:'new',requestId:null,activeLease:null},selector:{phase:'unknown_request_receipt'}});
function lateFixture(){const f=fixture();f.previousEpoch='new';
 Object.assign(f.native,{phase:'attached',requestId:'previous',activeLease:'lease',cameraUuid:'alice',targetUuid:'alice',target:'Alice',nativeWorldEpoch:1,
  offer:{id:'late',lease:'lease',target:'Alice',accepted:false,reason:'expired_request',at:50000}});
 f.selector={running:false,phase:'unknown_request_receipt',at:new Date(40000).toISOString(),pending:{id:'late',lease:'lease',target:'Alice',issuedAt:10000,expiresAt:20000,
  connectionEpoch:'new',nativeWorldEpoch:1,previousNativeRequestId:'previous',previousCameraUuid:'alice'}};return f;}
test('late terminal refusal resolves the recorded timeout even when the offer is old; never replays it',()=>{
 const f=lateFixture(),p=plan(f);assert.equal(p.action,'start');assert.equal(p.reconciliation.outcome,'not_admitted');assert.equal(p.reconciliation.completionVerified,false);
 assert.equal(p.newLeaseRequired,true);assert.equal(p.archivePreviousStatus,true);assert.equal(p.replayPreviousRequest,false);
 Object.assign(f.native,{phase:'stopped',reason:'target_died',cameraUuid:'observer',cameraLife:{uuid:'alice',requestId:'previous',nativeWorldEpoch:1,entityId:31,dead:true,observedAttachedAt:60000}});
 assert.equal(plan(f).reconciliation.previousTargetDied,true);
 assert.equal(plan({...f,lastResumeAt:95000}).action,'hold');assert.equal(plan({...f,recentResumes:4}).action,'hold');
 for(const patch of[{uuid:'other'},{requestId:'late'},{nativeWorldEpoch:2},{dead:false},{entityId:-1}]){const x=structuredClone(f);Object.assign(x.native.cameraLife,patch);assert.equal(plan(x).action,'hold');}
 f.native.terminalCameraLife=f.native.cameraLife;delete f.native.cameraLife;assert.equal(plan(f).reconciliation.previousTargetDied,true,'native terminal death remains valid after entity removal');
});
test('a refusal cannot revive manual stop, accepted requests, unknown cameras or changed identity/world',()=>{
 for(const patch of[{accepted:true},{neverAdmitted:false},{reason:'already_seen'},{reason:'native_screen_open'},{id:'other'},{lease:'other'},{target:'Bob'},{at:15000},{at:100001}]){
  const f=lateFixture();Object.assign(f.native.offer,patch);assert.equal(plan(f).action,'hold',JSON.stringify(patch));}
 for(const patch of[{requestId:'late'},{requestId:'other'},{activeLease:'other'},{nativeWorldEpoch:2},{cameraUuid:'other'},{phase:'unknown'},{phase:'cancelled'},
  {manualDetachRequested:true},{recordedAt:new Date(90000).toISOString()},{server:'other'},{transition:{active:true}}]){
  const f=lateFixture();Object.assign(f.native,patch);assert.equal(plan(f).action,'hold',JSON.stringify(patch));}
 for(const patch of[{stopRequested:true},{running:true},{phase:'director_stopped'},{at:new Date(5000).toISOString()}]){
  const f=lateFixture();Object.assign(f.selector,patch);assert.equal(plan(f).action,'hold');}
 const f=lateFixture();Object.assign(f.native.offer,{reason:'native_screen_open',neverAdmitted:true,at:15000});assert.equal(plan(f).action,'start');
});
test('a dead selector resumes only after a fresh new native connection, preserving the old unknown outcome',()=>{
 const f=fixture(),before=structuredClone(f),p=plan(f);assert.equal(p.action,'start');assert.equal(p.newLeaseRequired,true);assert.equal(p.replayPreviousRequest,false);assert.equal(p.archivePreviousStatus,true);assert.deepEqual(f,before);
 assert.equal(plan({...f,selectorAlive:true}).action,'keep');assert.equal(plan({...f,native:{...f.native,connectionEpoch:'old'}}).action,'hold');
});
test('manual stop, missing owner, stale authentication and foreign observer can never restart a selector',()=>{
 for(const patch of[{manualDetachRequested:true},{phase:'paused'},{phase:'unknown'},{cameraUuid:'stranger'},{server:'other'},{observerUuid:'other'},
  {recordedAt:new Date(90000).toISOString()},{recordedAt:new Date(100001).toISOString()},{connected:false},{authenticated:false},{spectator:false},{activeLease:'unconfirmed'},{transition:{active:true}}]){
  const f=fixture();Object.assign(f.native,patch);assert.notEqual(plan(f).action,'start',JSON.stringify(patch));
 }
 for(const phase of['director_stopped','manual_or_native_detach','paused_native_paused','native_offer_refused_manual_override'])assert.notEqual(plan({...fixture(),selector:{phase}}).action,'start');
 assert.equal(plan({...fixture(),observerAlive:false}).action,'stop');assert.equal(plan({...fixture(),selector:{stopRequested:true}}).reason,'manual_stop_retained');
 assert.equal(plan({...fixture(),enabled:false}).action,'hold');assert.equal(plan({...fixture(),previousEpoch:null}).action,'hold');
});
test('an attached new connection requires the actual current roster and recovery is rate limited',()=>{
 const f=fixture();Object.assign(f.native,{phase:'attached',target:'Alice',targetUuid:'alice',cameraUuid:'alice',requestId:'new-camera',activeLease:'new-lease',nativeWorldEpoch:2,renderedAt:100000,
  cameraLife:{requestId:'new-camera',uuid:'alice',nativeWorldEpoch:2,dead:false,observedAttachedAt:100000},targets:[{name:'Alice',uuid:'alice',spectator:false}]});
 assert.equal(plan(f).action,'start');f.native.targets[0].uuid='other';assert.equal(plan(f).action,'hold');
 assert.equal(plan({...fixture(),recentResumes:4}).reason,'resume_rate_limited');assert.equal(plan({...fixture(),lastResumeAt:95000}).reason,'resume_rate_limited');
});
