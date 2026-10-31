import test from 'node:test';
import assert from 'node:assert/strict';
import {CameraDirector,CAMERA_PROTOCOL,CAMERA_TOOLS,callCameraTool,suggestFallbackShot,loadCameraShotLibrary,mapCameraRecipes} from '../../host/broadcast-camera.mjs';

function fixture({cancel=true}={}) {
  let now=100000;let writes=0;
  const native={schema:CAMERA_PROTOCOL,at:now,scope:'local-world-1',subjectUuid:'subject-1',shots:[{id:'isometric',available:true},{id:'overview',available:true},{id:'perspective',available:true},{id:'top',available:false}]};
  const adapter={observe:async()=>({...structuredClone(native),at:now}),submit:async op=>{writes++;native.receipt={actionId:op.actionId,lease:op.lease,phase:'accepted'};}};
  if(cancel)adapter.cancel=async op=>{native.receipt={actionId:op.actionId,lease:op.lease,phase:'cancelled'};};
  const director=new CameraDirector(adapter,{now:()=>now});
  const {lease}=director.claim('test-host');
  const plan={actionId:'shot_1',lease,shot:'isometric',holdMs:10000};
  return {director,native,adapter,plan,advance:n=>now+=n,writes:()=>writes};
}
test('acceptance does not mean rendered completion',async()=>{
  const f=fixture();assert.equal((await f.director.take(f.plan)).phase,'accepted');
  f.native.receipt.phase='applied';assert.equal((await f.director.result(f.plan.actionId)).phase,'accepted');
  f.native.receipt.rendered=true;assert.equal((await f.director.result(f.plan.actionId)).phase,'applied');
});
test('stable action ids deduplicate and conflicting payloads reject',async()=>{
  const f=fixture();await f.director.take(f.plan);await f.director.take(f.plan);assert.equal(f.writes(),1);
  await assert.rejects(f.director.take({...f.plan,shot:'overview'}),/ACTION_ID_CONFLICT/);
});
test('only one pending native operation, including concurrent calls',async()=>{
  const f=fixture();const results=await Promise.allSettled([f.director.take(f.plan),f.director.take({...f.plan,actionId:'shot_2'})]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.writes(),1);
});
test('unavailable capabilities and stale observations do not mutate camera',async()=>{
  const f=fixture();await assert.rejects(f.director.take({...f.plan,shot:'top'}),/SHOT_UNAVAILABLE/);
  f.adapter.observe=async()=>({...f.native,at:1});await assert.rejects(f.director.take(f.plan),/STALE_CAMERA_OBSERVATION/);assert.equal(f.writes(),0);
});
test('completed shots dwell before another agent decision',async()=>{
  const f=fixture();await f.director.take(f.plan);Object.assign(f.native.receipt,{phase:'applied',rendered:true});await f.director.result(f.plan.actionId);
  await assert.rejects(f.director.take({...f.plan,actionId:'shot_2'}),/CAMERA_MINIMUM_HOLD/);
  f.advance(10001);assert.equal((await f.director.take({...f.plan,actionId:'shot_2'})).phase,'accepted');
});
test('a changed subject or world leaves original action unknown, without replay',async()=>{
  const f=fixture();await f.director.take(f.plan);f.native.scope='world-2';
  Object.assign(f.native.receipt,{phase:'applied',rendered:true});assert.equal((await f.director.result(f.plan.actionId)).phase,'unknown');
  await assert.rejects(f.director.take({...f.plan,actionId:'shot_2'}),/CAMERA_OPERATION_PENDING/);assert.equal(f.writes(),1);
});
test('mismatched native lease cannot complete a shot',async()=>{
  const f=fixture();await f.director.take(f.plan);Object.assign(f.native.receipt,{lease:'other',phase:'applied',rendered:true});
  f.advance(10001);assert.equal((await f.director.result(f.plan.actionId)).phase,'unknown');
});
test('aborting a wait does not fake cancellation of the operation',async()=>{
  const f=fixture();await f.director.take(f.plan);const controller=new AbortController();
  const waiter=f.director.wait(f.plan.actionId,{signal:controller.signal});setTimeout(()=>controller.abort(),5);
  await assert.rejects(waiter,{name:'AbortError'});assert.equal((await f.director.result(f.plan.actionId)).phase,'accepted');
});
test('native cancel acknowledgement is required',async()=>{
  const f=fixture();await f.director.take(f.plan);f.adapter.cancel=async()=>({accepted:true});
  assert.equal((await f.director.cancel(f.plan.actionId,f.plan.lease)).phase,'accepted');
  f.native.receipt.phase='cancelled';assert.equal((await f.director.result(f.plan.actionId)).phase,'cancelled');
});
test('manual takeover cancels the pending shot and requires explicit resume/new lease',async()=>{
  const f=fixture();await f.director.take(f.plan);await f.director.handoverToManual();
  assert.equal((await f.director.result(f.plan.actionId)).phase,'cancelled');
  assert.throws(()=>f.director.claim('new-agent'),/MANUAL_LOCKED/);f.director.resumeFromManual();
  const next=f.director.claim('new-agent');assert.notEqual(next.lease,f.plan.lease);
  await assert.rejects(f.director.take({...f.plan,actionId:'shot_2'}),/CAMERA_LEASE_MISMATCH/);
});
test('stop is terminal, with no timer or late callback able to reclaim ownership',async()=>{
  const f=fixture();await f.director.take(f.plan);await f.director.stop();
  f.advance(100000);assert.throws(()=>f.director.resumeFromManual(),/DIRECTOR_STOPPED/);
  assert.throws(()=>f.director.claim('new-agent'),/DIRECTOR_STOPPED/);await assert.rejects(f.director.take({...f.plan,actionId:'shot_2'}),/DIRECTOR_STOPPED/);assert.equal(f.writes(),1);
});
test('stopping while an asynchronous submit is waiting aborts its native commit',async()=>{
  const f=fixture();let unblock;let committed=0;
  f.adapter.submit=async (op,{signal})=>{await new Promise(resolve=>unblock=resolve);if(signal.aborted)throw Error('aborted');committed++;};
  const submission=f.director.take(f.plan);await new Promise(resolve=>setImmediate(resolve));
  await f.director.stop();unblock();await submission;assert.equal(committed,0);
  assert.equal((await f.director.result(f.plan.actionId)).phase,'cancelled');
});
test('model tool handler and SDK share exact operation state',async()=>{
  const f=fixture();assert.equal(CAMERA_TOOLS.length,4);
  assert.deepEqual(await callCameraTool(f.director,'broadcast_camera_take',f.plan),await f.director.result(f.plan.actionId));
  assert.deepEqual(await callCameraTool(f.director,'broadcast_camera_query'),await f.director.query());
  await assert.rejects(callCameraTool(f.director,'arbitrary_command',{}),/UNKNOWN_CAMERA_TOOL/);
});
test('fallback only selects an available shot from structured activity',()=>{
  const f=fixture();assert.equal(suggestFallbackShot({...f.native,activity:'combat'}),'perspective');
  assert.equal(suggestFallbackShot({...f.native,activity:'building'}),'overview');assert.equal(suggestFallbackShot({...f.native,shots:[]} ),null);
});
test('packaged camera knowledge has unique recipes and resolvable fallback references',async()=>{
  const library=await loadCameraShotLibrary();assert.equal(library.schema,'mcvisual.shot-recipes/v1');
  const ids=new Set(library.recipes.map(x=>x.id));assert.equal(ids.size,library.recipes.length);
  for(const recipe of library.recipes){assert.ok(recipe.purpose&&recipe.finish&&recipe.requires.length);for(const fallback of recipe.fallback)assert.ok(ids.has(fallback));}
});
test('a named recipe never invents an executable shot or grants an unavailable backend feature',async()=>{
  const library=await loadCameraShotLibrary();
  const observed={shots:[{id:'native-first',recipeId:'pov_action',available:true},{id:'orbit_arc',available:true},{id:'low-native',recipeId:'low_hero',available:false}]};
  const mapped=mapCameraRecipes(observed,library);
  assert.deepEqual(mapped.find(x=>x.recipeId==='pov_action').shotIds,['native-first']);
  assert.deepEqual(mapped.find(x=>x.recipeId==='orbit_arc').shotIds,[]);
  assert.deepEqual(mapped.find(x=>x.recipeId==='low_hero').shotIds,[]);
});
