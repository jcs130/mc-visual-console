import test from'node:test';import assert from'node:assert/strict';import{planNativeDirectorResume as plan}from'../../host/native-director-policy.mjs';
const fixture=()=>({enabled:true,observerAlive:true,selectorAlive:false,expectedServer:'fixture:1',expectedObserverUuid:'observer',previousEpoch:'old',now:100000,
 native:{recordedAt:new Date(100000).toISOString(),connected:true,authenticated:true,spectator:true,server:'fixture:1',observerUuid:'observer',cameraUuid:'observer',phase:'idle',connectionEpoch:'new',requestId:null,activeLease:null},selector:{phase:'unknown_request_receipt'}});
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
