import test from 'node:test';import assert from 'node:assert/strict';
import {directorExpiredOffer} from './connection-recovery.mjs';
function fixture(){const now=30000,r={id:'new',lease:'host',target:'A',issuedAt:10000,expiresAt:20000,connectionEpoch:'connection',nativeWorldEpoch:1,previousNativeRequestId:'old',previousCameraUuid:'a'};
 const n={connected:true,authenticated:true,spectator:true,observerUuid:'observer',phase:'attached',requestId:'old',targetUuid:'a',cameraUuid:'a',connectionEpoch:'connection',nativeWorldEpoch:1,
  recordedAt:new Date(now).toISOString(),offer:{id:'new',lease:'host',target:'A',accepted:false,reason:'expired_request',at:now}};
 return{n,r,check:()=>directorExpiredOffer({native:n,request:r,expectedObserverUuid:'observer',now})};}
test('a scoped rejected expiry with the original camera intact permits a new decision, never replay or completion',()=>{
 const f=fixture(),v=f.check();assert.equal(v.action,'reselect_after_explicit_non_execution');assert.equal(v.requestReissued,false);assert.equal(v.completionVerified,false);
});
test('expired offers cannot resume manual, unknown, changed-world or unconfirmed cameras',()=>{
 for(const patch of[{phase:'unknown'},{phase:'paused'},{manualDetachRequested:true},{connected:false},{authenticated:false},{observerUuid:'other'},{nativeWorldEpoch:2},{connectionEpoch:'other'},{requestId:'new'},{requestId:'unrelated'},{cameraUuid:'other'},{recordedAt:new Date(10000).toISOString()}]){
  const f=fixture();Object.assign(f.n,patch);assert.equal(f.check(),null,JSON.stringify(patch));
 }
});
test('missing provenance, stale or other-request refusals do not prove non-execution',()=>{
 for(const patch of[{id:'other'},{lease:'other'},{target:'B'},{accepted:true},{reason:'already_seen'},{at:20000},{at:31000}]){
  const f=fixture();Object.assign(f.n.offer,patch);assert.equal(f.check(),null,JSON.stringify(patch));
 }
 const f=fixture();delete f.r.previousNativeRequestId;assert.equal(f.check(),null);
 const g=fixture();g.r.expiresAt=30001;assert.equal(g.check(),null);
});
