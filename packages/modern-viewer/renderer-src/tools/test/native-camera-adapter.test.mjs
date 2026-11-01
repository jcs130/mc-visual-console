import test from 'node:test';import assert from 'node:assert/strict';
import {createNativeCameraAdapter,NATIVE_CAMERA_RECIPES} from '../../host/native-camera-adapter.mjs';
import {CameraDirector,callCameraTool} from '../../host/broadcast-camera.mjs';
function fixture(){
 let now=100000,writes=0;const n={schema:'mcvisual-native-director/v1',recordedAt:new Date(now).toISOString(),server:'fixture:25565',observerUuid:'observer-uuid',
  connected:true,authenticated:true,connectionBoundRequests:true,connectionEpoch:'epochA',nativeWorldEpoch:1,phase:'attached',availableViews:Object.keys(NATIVE_CAMERA_RECIPES),
  targets:[{name:'Alice',uuid:'actor-uuid'}],rigCancelSupported:true,renderedAt:now,cameraUuid:'actor-uuid',targetUuid:'actor-uuid',perspective:'THIRD_PERSON_BACK'};
 const settings={expectedServer:n.server,observerUuid:n.observerUuid,targetUuid:'actor-uuid',targetName:'Alice',now:()=>now,
  readNative:async()=>({...structuredClone(n),recordedAt:new Date(now).toISOString()}),
  writeRequest:async request=>{writes++;Object.assign(n,{requestId:request.id,activeLease:request.lease});n.drone={active:true,lastRenderedAt:now};
   n.shotExecution={requestId:request.id,view:request.view,phase:'running',fallback:false};},
  writeCancel:async request=>{n.cancelReceipt={...request,nativeWorldEpoch:1,phase:'cancelled'};n.phase='cancelled';}};
 const adapter=createNativeCameraAdapter(settings),director=new CameraDirector(adapter,{now:()=>now});const {lease}=director.claim('host');
 const plan={actionId:'camera-request',lease,shot:'drone_orbit_left',holdMs:10000};
 return{n,settings,adapter,director,plan,writes:()=>writes,tick:ms=>{now+=ms;}};
}
test('same SDK/tool operation waits for the finite native endpoint frame, not body attachment or RPC acceptance',async()=>{
 const f=fixture();assert.equal((await callCameraTool(f.director,'broadcast_camera_take',f.plan)).phase,'accepted');
 assert.equal((await f.director.result(f.plan.actionId)).phase,'transitioning');
 f.n.shotExecution.phase='settling';assert.equal((await f.director.result(f.plan.actionId)).phase,'transitioning');
 f.n.shotExecution.phase='completed';f.n.transition={active:true};assert.equal((await f.director.result(f.plan.actionId)).phase,'transitioning');
 f.n.transition.active=false;
 f.n.shotExecution.phase='completed';const done=await callCameraTool(f.director,'broadcast_camera_result',{actionId:f.plan.actionId});
 assert.equal(done.phase,'applied');assert.equal(done.evidence.execution.phase,'completed');assert.equal(f.writes(),1);
});
test('blocked orbit and degraded front view cannot masquerade as the requested shot completing',async()=>{
 for(const shot of ['drone_orbit_left','drone_front']){const f=fixture();await f.director.take({...f.plan,shot});
  f.n.shotExecution.phase=shot.includes('orbit')?'blocked':'holding';f.n.shotExecution.fallback=true;f.n.effectiveView='first_person';
  assert.equal((await f.director.result(f.plan.actionId)).phase,'rejected');}
});
test('adaptive rear follow reports its actual close-space first-person fallback explicitly',async()=>{
 const f=fixture();await f.director.take({...f.plan,shot:'drone_follow'});f.n.shotExecution.phase='holding';f.n.shotExecution.fallback=true;f.n.effectiveView='first_person';
 const done=await f.director.result(f.plan.actionId);assert.equal(done.phase,'applied');assert.equal(done.evidence.effectiveView,'first_person');
});
test('old clients and missing native capabilities cannot acquire names from the new recipe library',async()=>{
 const f=fixture();delete f.n.availableViews;
 assert.equal((await f.director.query()).observed.shots.filter(x=>x.available).length,0);
 await assert.rejects(f.director.take(f.plan),/SHOT_UNAVAILABLE/);assert.equal(f.writes(),0);
});
test('foreign observer, server, target or native lease does not provide completion evidence',async()=>{
 for(const key of ['observerUuid','server']){const f=fixture();f.n[key]='foreign';await assert.rejects(f.director.query(),/NATIVE_CAMERA_CONTEXT_UNAVAILABLE/);}
 const f=fixture();await f.director.take(f.plan);f.n.activeLease='foreign';f.n.shotExecution.phase='completed';
 assert.notEqual((await f.director.result(f.plan.actionId)).phase,'applied');f.n.targets[0].uuid='foreign';await assert.rejects(f.director.query(),/NATIVE_TARGET_IDENTITY_MISMATCH/);
});
test('world change and native unknown keep the original operation unresolved without resubmission',async()=>{
 const f=fixture();await f.director.take(f.plan);f.n.phase='unknown';const unknown=await f.director.result(f.plan.actionId);assert.equal(unknown.phase,'unknown');assert.equal(unknown.evidence.nativePhase,'unknown');
 f.n.nativeWorldEpoch=2;assert.equal((await f.director.result(f.plan.actionId)).phase,'unknown');assert.equal(f.writes(),1);
});
test('cancellation uses the original native binding, while a pending unknown never becomes a false cancellation',async()=>{
 const f=fixture();await f.director.take(f.plan);assert.equal((await f.director.cancel(f.plan.actionId,f.plan.lease)).phase,'cancelled');
 const g=fixture();g.settings.writeCancel=async request=>{g.n.cancelReceipt={...request,nativeWorldEpoch:1,phase:'unknown'};g.n.phase='unknown';};
 const adapter=createNativeCameraAdapter(g.settings),d=new CameraDirector(adapter,{now:()=>100000});const {lease}=d.claim('host-two');
 await d.take({...g.plan,lease});assert.equal((await d.cancel(g.plan.actionId,lease)).phase,'unknown');
});
