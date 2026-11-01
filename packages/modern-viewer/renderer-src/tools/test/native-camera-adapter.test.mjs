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

test('SDK and MCP carry bounded script parameters and verify the same native rendered values',async()=>{
 const f=fixture();f.n.cameraScript={schema:'mcvisual.camera-script/v1',parameters:['distance','height','speed'],preflightRequiredForFinite:true};let forwarded;
 const original=f.settings.writeRequest;f.settings.writeRequest=async r=>{forwarded=r;await original(r);};
 const d=new CameraDirector(createNativeCameraAdapter(f.settings),{now:()=>100000}),{lease}=d.claim('parameter-host');
 const plan={actionId:'parameter-shot',lease,shot:'drone_follow',holdMs:10000,motion:{schema:'mcvisual.camera-script/v1',height:1.8,distance:6.5,speed:.7}};
 const r=await callCameraTool(d,'broadcast_camera_take',plan);assert.deepEqual(r.operation.motion,plan.motion);assert.deepEqual(forwarded.motion,plan.motion);
 Object.assign(f.n.shotExecution,{phase:'holding',scriptSchema:plan.motion.schema,height:1.8,distance:6.5,speed:.7});
 assert.equal((await callCameraTool(d,'broadcast_camera_result',{actionId:plan.actionId})).phase,'applied');
 await assert.rejects(d.take({...plan,motion:{...plan.motion,speed:.8}}),/ACTION_ID_CONFLICT/);
 const g=fixture();await assert.rejects(g.director.take({...g.plan,shot:'drone_follow',motion:plan.motion}),/CAMERA_SCRIPT_UNAVAILABLE/);assert.equal(g.writes(),0);
});
test('native script receipt must prove requested values rather than just the view name',async()=>{
 const f=fixture();f.n.cameraScript={schema:'mcvisual.camera-script/v1'};const plan={...f.plan,shot:'drone_follow',motion:{schema:'mcvisual.camera-script/v1',height:1.8,speed:.7}};
 await f.director.take(plan);Object.assign(f.n.shotExecution,{phase:'holding',scriptSchema:plan.motion.schema,height:3,speed:1});
 const r=await f.director.result(plan.actionId);assert.equal(r.phase,'rejected');assert.equal(r.evidence.reason,'script_parameters_not_rendered');
});
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

test('native OrthoCamera SDK/tool receipts retain real projection and configured preset',async()=>{
 const f=fixture();f.n.orthographic={ready:true,worldCutawaySupported:false,active:false,phase:'stopped'};
 const plan={...f.plan,shot:'ortho_isometric'};assert.equal((await callCameraTool(f.director,'broadcast_camera_take',plan)).phase,'accepted');
 f.n.orthographic={ready:true,worldCutawaySupported:false,active:true,requestId:plan.actionId,view:plan.shot,phase:'holding',targetUuid:'actor-uuid',nativeWorldEpoch:1,renderedAt:100000};
 f.n.projection='perspective';f.n.projectionProfile=null;assert.equal((await f.director.result(plan.actionId)).phase,'transitioning');
 f.n.projection='orthographic';f.n.projectionProfile=plan.shot;
 const done=await callCameraTool(f.director,'broadcast_camera_result',{actionId:plan.actionId});assert.equal(done.phase,'applied');
 assert.equal(done.evidence.projection,'orthographic');assert.equal(done.evidence.projectionProfile,plan.shot);assert.equal(f.writes(),1);
 const g=fixture();await assert.rejects(g.director.take({...g.plan,shot:'ortho_isometric'}),/SHOT_UNAVAILABLE/);
 g.n.orthographic={ready:true,active:false};assert.equal((await g.director.query()).observed.shots.find(s=>s.id==='ortho_isometric').available,false,'legacy global clipping is not advertised as safe orthographic coverage');
});

test('the expanded native catalogue stays bounded rather than accepting unlimited tool descriptions',async()=>{
 const f=fixture();assert.equal((await f.director.query()).observed.shots.length,20);
 const original=f.adapter.observe;f.adapter.observe=async()=>{const n=await original();n.shots=Array.from({length:33},(_,i)=>({id:'s'+i,available:true}));return n;};
 await assert.rejects(f.director.query(),/INVALID_CAMERA_OBSERVATION/);
});
