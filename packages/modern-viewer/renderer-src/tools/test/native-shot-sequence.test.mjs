import test from 'node:test';import assert from 'node:assert/strict';
import {NativeCameraSequence,NativeCameraPacing,nativeCameraCandidates,nativeScheduledCamera} from '../../host/native-director-policy.mjs';
import {validateCameraScript} from '../../host/camera-script.mjs';
function fixture(enabled=true,cadenceProfile='steady'){
 let time=100000;const now=()=>time;
 const n={schema:'mcvisual-native-director/v1',connected:true,authenticated:true,spectator:true,phase:'attached',recordedAt:new Date(time).toISOString(),renderedAt:time,
  target:'A',targetUuid:'a',cameraUuid:'a',requestId:'original',connectionEpoch:'c',nativeWorldEpoch:1,projection:'perspective',effectiveView:'drone_front_left',
  offer:{id:'original',accepted:true,at:time-30000},targets:[{name:'A',uuid:'a',loaded:true,alive:true}],
  availableViews:['first_person','drone_eye','drone_front_left','drone_front_right','drone_front','drone_side_left','drone_side_right','drone_orbit_left','drone_orbit_right','drone_push_in','drone_pull_out','ortho_overview','ortho_close','ortho_isometric'],
  cameraScript:{schema:'mcvisual.camera-script/v1',preflightRequiredForFinite:true},rigCancelSupported:true,
  drone:{active:true,lastRenderedAt:time},shotExecution:{requestId:'original',view:'drone_front_left',phase:'holding'},
  orthographic:{ready:true,worldCutawaySupported:false,roomClip:false},
  spatial:{known:true,targetUuid:'a',nativeWorldEpoch:1,at:time,layout:'open',floorSafe:true,headroom:10,spanX:16,spanZ:16,orthographicVisibility:1}};
 const activity=[{name:'A',motion:'stationary',positionAt:time,stillSince:time-30000}];
 const sequence=new NativeCameraSequence({enabled,now,currentView:n=>n.effectiveView,cadenceProfile});
 const tick=ms=>{time+=ms;n.recordedAt=new Date(time).toISOString();n.renderedAt=time;n.spatial.at=time;n.drone.lastRenderedAt=time;activity[0].positionAt=time;};
 return{n,activity,sequence,now,tick,choose:options=>sequence.choose(n,{activity,...options})};
}
test('quiet open scenes offer bounded finite arcs from actual camera state, and model menus preserve them',()=>{
 const f=fixture(),p=f.choose();assert.equal(p.view,'drone_orbit_left');assert.equal(p.sequence.pathPreflightRequired,true);
 assert.deepEqual(p.motion,validateCameraScript(p.motion,p.view));assert.ok(!('height'in p.motion));assert.ok(!('distance'in p.motion));
 const menu=nativeCameraCandidates(p,f.n,{now:f.now()});assert.deepEqual(menu.find(o=>o.id==='proposal').motion,p.motion);
 assert.equal(menu.filter(o=>o.view.startsWith('drone_orbit_')).length,1);
 assert.ok(!nativeCameraCandidates({...p,sequence:undefined},f.n,{now:f.now()}).some(o=>o.view.startsWith('drone_orbit_')));
});

test('explicit lively coverage becomes due after 5 seconds and never admits a stale or foreign scheduled fallback',()=>{
 const f=fixture(true,'lively');f.n.offer.at=f.now();f.n.availableViews.push('drone_follow');
 Object.assign(f.activity[0],{motion:'recent_sample',stillSince:f.now(),lastMotionAt:f.now()});
 f.tick(4999);f.activity[0].stillSince=f.now();f.activity[0].lastMotionAt=f.now();assert.equal(f.choose(),null);f.tick(1);
 const choice=f.choose();assert.notEqual(choice.view,f.n.effectiveView);assert.ok(!choice.view.startsWith('drone_orbit_'));assert.equal(nativeScheduledCamera(choice,f.n,{now:f.now()}),true);
 assert.equal(nativeScheduledCamera(choice,f.n,{now:f.now(),deadline:true}),false);
 f.tick(2000);assert.equal(nativeScheduledCamera({...choice,sequence:{...choice.sequence,nativeSceneAt:f.n.spatial.at}},f.n,{now:f.now(),deadline:true}),true);
 for(const mutate of[n=>n.screenOpen=true,n=>n.manualDetachRequested=true,n=>n.spatial.floorSafe=false,n=>n.nativeWorldEpoch++,n=>n.requestId='other',n=>n.recordedAt=new Date(0).toISOString()]){
  const n=structuredClone(f.n);mutate(n);assert.equal(nativeScheduledCamera(choice,n,{now:f.now(),deadline:true}),false);
 }
 const offered=nativeCameraCandidates(choice,f.n,{now:f.now()});assert.deepEqual(offered.find(c=>c.id==='proposal').motion,choice.motion);
 assert.ok(offered.every(c=>c.view!==f.n.effectiveView),'a scheduled menu cannot renew the same actual camera');
});

test('stationary three-second cue starts only a small native-preflight motion, without claiming its endpoint',()=>{
 const f=fixture(true,'lively');f.n.offer.at=f.now();f.activity[0].stillSince=f.now();
 f.tick(2999);assert.equal(f.choose(),null);f.tick(1);const choice=f.choose();
 assert.equal(choice.sequence.cadence.cause,'stationary_motion');assert.equal(choice.view,'drone_orbit_left');
 assert.deepEqual(choice.motion,{schema:'mcvisual.camera-script/v1',speed:1,durationMs:4000,arcDegrees:15});
 assert.equal(nativeScheduledCamera(choice,f.n,{now:f.now()}),true);
 assert.equal(nativeScheduledCamera({...choice,motion:{...choice.motion,arcDegrees:60}},f.n,{now:f.now()}),false);
 const pacing=new NativeCameraPacing({cadenceProfile:'lively',now:f.now,currentView:n=>n.effectiveView});
 assert.equal(pacing.check(choice,f.n,{activity:f.activity}).allow,true);
 assert.equal(pacing.check(choice,f.n,{activity:[{name:'A',lastCombatAt:f.now()}]}).reason,'protect_live_action');
 f.n.requestId='arc';f.n.shotExecution={requestId:'arc',view:choice.view,phase:'running'};f.n.offer={id:'arc',accepted:true,at:f.now()};
 f.tick(30000);assert.equal(f.choose(),null,'elapsed cadence cannot terminate running native movement');
});

test('lively per-camera tempo does not permit faster subject switching or bypass manual stop',()=>{
 const f=fixture(true,'lively');f.n.offer.at=f.now();f.n.targets.push({name:'B',uuid:'b',loaded:true,alive:true});
 const pacing=new NativeCameraPacing({cadenceProfile:'lively',now:f.now,currentView:n=>n.effectiveView});pacing.observe(f.n);
 f.tick(6000);assert.equal(pacing.check({name:'B',view:'first_person'},f.n).allow,false);
 f.tick(7000);assert.equal(pacing.check({name:'B',view:'first_person'},f.n).reason,'minimum_subject_hold');
 pacing.stop();assert.equal(pacing.check(f.choose(),f.n).reason,'stopped');
});
test('advice and request acceptance cannot advance an actual shot or finish finite motion',()=>{
 const f=fixture(),p=f.choose();assert.deepEqual(f.choose(),p,'unapplied proposal does not advance sequence');
 Object.assign(f.n,{requestId:'arc',effectiveView:p.view,offer:{id:'arc',accepted:true,at:f.now()},shotExecution:{requestId:'arc',view:p.view,phase:'running'}});
 f.tick(30000);assert.equal(f.choose(),null);assert.equal(f.sequence.stats().phase,'awaiting_finite_endpoint');
 f.n.shotExecution.phase='completed';const next=f.choose();assert.ok(next);assert.notEqual(next.view,p.view);
});
test('native and same-subject evidence must remain fresh and in the same world',()=>{
 for(const mutate of[n=>n.renderedAt-=4000,n=>n.recordedAt=new Date(90000).toISOString(),n=>n.spatial.targetUuid='other',n=>n.spatial.nativeWorldEpoch=2,n=>n.spatial.floorSafe=false,n=>n.targets[0].alive=false,n=>n.cameraUuid='other']){
  const f=fixture();mutate(f.n);assert.equal(f.choose(),null);
 }
});
test('combat, recent interaction and real GUI protect action readability',()=>{
 for(const key of ['lastCombatAt','lastInteractionAt']){const f=fixture();f.activity[0][key]=f.now();assert.equal(f.choose(),null);}
 const f=fixture();f.n.screenOpen=true;assert.equal(f.choose(),null);
});
test('moving actors and tight spaces cannot receive a stationary orbit',()=>{
 const f=fixture();f.activity[0].motion='recent_sample';assert.ok(!f.choose().view.startsWith('drone_orbit_'));
 assert.equal(f.choose().kind,'overview','a newly received position is not evidence of travel');f.activity[0].lastMotionAt=f.now();assert.equal(f.choose().kind,'movement');
 const g=fixture();g.n.spatial.layout='tunnel';assert.equal(g.choose().view,'first_person');
 for(const change of[n=>n.cameraScript.preflightRequiredForFinite=false,n=>n.rigCancelSupported=false,n=>n.spatial.headroom=2,n=>n.spatial.spanX=4]){
  const h=fixture();change(h.n);assert.ok(!h.choose().view.startsWith('drone_orbit_'));
 }
});
test('blocked finite paths back off rather than reissuing the same animation',()=>{
 const f=fixture();f.n.shotExecution={requestId:'original',view:'drone_orbit_left',phase:'blocked'};
 assert.ok(!f.choose().view.startsWith('drone_orbit_'));f.tick(61000);assert.equal(f.choose().view,'drone_orbit_left');
});

test('an actual nonfinite safety fallback chooses another composition instead of repeating the failed side',()=>{
 const f=fixture();f.n.effectiveView='first_person';f.n.drone.active=false;
 f.n.shotExecution={requestId:f.n.requestId,view:'drone_front_left',phase:'holding',fallback:true};
 const next=f.choose();assert.equal(next.view,'drone_front');
 const menu=nativeCameraCandidates({...next,kind:'movement'},f.n,{now:f.now()});
 assert.ok(menu.every(o=>o.view!=='drone_front_left'),'the movement alternative also honours the actual rejected side');
 f.n.shotExecution.requestId='retired-request';assert.equal(f.choose().view,'drone_front_left','a retired request cannot forbid the current camera');
});
test('orthographic progression honours projection dwell, preserves floors, and returns to perspective',()=>{
 const f=fixture();Object.assign(f.n,{projection:'orthographic',effectiveView:'ortho_overview'});
 const options={orthographic:true,preferOrthographic:true,lastProjectionChangeAt:f.now()-20000};
 assert.equal(f.choose(options).view,'ortho_close');f.tick(30000);assert.equal(f.choose(options).view,'drone_front_left');
 const g=fixture();g.n.orthographic.worldCutawaySupported=true;
 assert.ok(!g.choose({orthographic:true,preferOrthographic:true}).view.startsWith('ortho_'));
});
test('sequence is explicitly enabled and stopped instances cannot revive',()=>{
 const f=fixture(false);assert.equal(f.choose(),null);const g=fixture();g.sequence.stop();g.tick(60000);assert.equal(g.choose(),null);assert.equal(g.sequence.stats().phase,'stopped');
});
