import test from 'node:test';import assert from 'node:assert/strict';
import {validateChoiceProbabilities,createSystemOneDecisionPort} from '../../host/systemone-decisions.mjs';
import {CAMERA_SCRIPT_PROTOCOL as schema,validateCameraScript,blendCameraScripts} from '../../host/camera-script.mjs';
import {nativeCameraCandidates,selectCameraBallot,NativeCameraPacing} from '../../host/native-director-policy.mjs';
const menu=[{id:'keep'},{id:'normal',name:'A',view:'drone_follow',motion:{schema,speed:1,height:1,distance:5.5}},{id:'slow',name:'A',view:'drone_follow',motion:{schema,speed:.7,height:1.8,distance:6.5}}];
const votes=p=>['action','space','continuity'].map(role=>({role,choice:'normal',probabilities:p}));
test('complete distributions survive transport; malformed, extra and unnormalised values are rejected',async()=>{
 const criteria={keep:'hold',normal:'follow',slow:'slow'};assert.deepEqual(validateChoiceProbabilities({keep:.1,normal:.6,slow:.3},criteria),{keep:.1,normal:.6,slow:.3});
 for(const p of[{keep:1},{keep:.1,normal:.6,slow:.3,command:0},{keep:NaN,normal:1,slow:0},{keep:0,normal:4,slow:0},{keep:.1,normal:.1,slow:.1}])assert.equal(validateChoiceProbabilities(p,criteria),null);
 const port=createSystemOneDecisionPort({endpoint:'http://explicit/v1/systemone',apiKey:'test',sessionId:'test',fetchImpl:async()=>new Response(JSON.stringify({answers:{action:{choice:'normal',probabilities:{keep:.1,normal:.6,slow:.3},confidence:.6}}}))});
 const r=await port.request({state:{},questions:{action:{type:'choice',instructions:'pick',criteria}}});assert.deepEqual(r.answers.action.probabilities,{keep:.1,normal:.6,slow:.3});port.stop();
});
test('probability ambiguity holds; supported same-family parameters interpolate, never unrelated cameras',()=>{
 const r=selectCameraBallot(menu,votes({keep:.05,normal:.6,slow:.35}));assert.equal(r.kind,'use');assert.equal(r.source,'probabilities');
 assert.ok(r.choice.motion.speed<1&&r.choice.motion.speed>.7);assert.ok(r.choice.motion.height>1&&r.choice.motion.height<1.8);
 assert.equal(selectCameraBallot(menu,votes({keep:.48,normal:.27,slow:.25})).kind,'keep');
 const hard=selectCameraBallot(menu,votes(undefined));assert.equal(hard.source,'hard_choices');assert.equal(hard.scores,undefined);
 const mixed=[...menu,{id:'foreign',name:'B',view:'drone_front',motion:{schema,speed:1.5,height:12,distance:10}}];
 assert.deepEqual(blendCameraScripts(mixed,{normal:1,foreign:100},'normal'),menu[1].motion);
});
test('camera scripts reject commands, arbitrary coordinates, nonfinite values and conflicting semantics',()=>{
 for(const value of[{schema,x:12},{schema,speed:Infinity},{schema,height:20},{schema,speed:.1},{schema,durationMs:4001.5}])assert.throws(()=>validateCameraScript(value,'drone_follow'));
 assert.throws(()=>validateCameraScript({schema,height:2},'drone_orbit_left'));
 assert.throws(()=>validateCameraScript({schema,durationMs:8000},'drone_follow'));
 assert.throws(()=>validateCameraScript({schema,speed:1.5,durationMs:4000},'drone_orbit_left'));
 assert.deepEqual(validateCameraScript({schema,durationMs:12000,arcDegrees:35,speed:.8},'drone_orbit_left'),{schema,speed:.8,durationMs:12000,arcDegrees:35});
});
function fixture(){let now=100000;const n={phase:'attached',target:'A',targetUuid:'a',cameraUuid:'a',requestId:'first',connectionEpoch:'connection',nativeWorldEpoch:1,renderedAt:now,
 effectiveView:'drone_follow',projection:'perspective',offer:{at:60000},targets:[{name:'A',uuid:'a',alive:true,loaded:true},{name:'B',uuid:'b',alive:true,loaded:true}],
 availableViews:['drone_follow','drone_eye','first_person','drone_front_left','ortho_isometric'],cameraScript:{schema},orthographic:{ready:true},
 spatial:{targetUuid:'a',nativeWorldEpoch:1,known:true,layout:'open',floorSafe:true,at:now,orthographicVisibility:1}};
 const pacing=new NativeCameraPacing({now:()=>now,currentView:x=>x.effectiveView});pacing.observe(n);
 return{n,pacing,tick:ms=>{now+=ms;n.renderedAt=now;n.spatial.at=now;},ack:(id,name='A',view='drone_eye')=>{n.requestId=id;n.target=name;n.targetUuid=name.toLowerCase();n.cameraUuid=n.targetUuid;n.effectiveView=view;pacing.observe(n);},now:()=>now};}
test('native menus use runtime capabilities and current-subject space evidence; no speculative orbit or other-actor orthographic',()=>{
 const f=fixture(),choice={name:'A',view:'drone_follow',kind:'movement'};const offered=nativeCameraCandidates(choice,f.n,{now:f.now()});
 assert.ok(offered.length>=4);assert.ok(offered.some(o=>o.id==='proposal_slow'));assert.ok(offered.some(o=>o.view==='ortho_isometric'));
 assert.ok(!nativeCameraCandidates({...choice,name:'B'},f.n,{now:f.now()}).some(o=>o.view.startsWith('ortho_')));
 delete f.n.cameraScript;assert.ok(nativeCameraCandidates(choice,f.n,{now:f.now()}).every(o=>!o.motion));
});
test('pacing counts actual render changes, imposes dwell, return/cut budgets and protects combat',()=>{
 const f=fixture(),choice={name:'B',view:'drone_follow',kind:'movement'};assert.equal(f.pacing.check(choice,f.n).allow,true);f.tick(31000);
 assert.equal(f.pacing.check(choice,f.n,{activity:[{name:'A',lastCombatAt:f.now()}]}).reason,'protect_live_combat');
 assert.equal(f.pacing.check(choice,f.n).allow,true);f.n.phase='ready';f.n.requestId='offered';f.pacing.observe(f.n);assert.equal(f.pacing.current.uuid,'a');
 f.n.phase='attached';f.ack('b','B','drone_follow');f.tick(31000);assert.equal(f.pacing.check({name:'A',view:'drone_follow'},f.n).reason,'subject_return_cooldown_60s');
 f.tick(30000);assert.equal(f.pacing.check({name:'A',view:'drone_follow'},f.n).allow,true,'return cooldown expires during an unchanged holding shot');
 f.pacing.stop();f.tick(90000);assert.equal(f.pacing.check(choice,f.n).reason,'stopped');
 const g=fixture();g.tick(31000);for(let i=0;i<4;i++){g.ack('r'+i);g.tick(13000);}assert.equal(g.pacing.check({name:'A',view:'drone_follow'},g.n).reason,'cut_budget_4_per_minute');
});
test('manual menus and invalid render times cannot advance pacing or authorize a camera',()=>{
 const f=fixture();f.n.manualDetachRequested=true;assert.equal(f.pacing.check({name:'B',view:'drone_follow'},f.n).reason,'manual_or_unresolved');
 f.n.manualDetachRequested=false;f.n.screenOpen=true;assert.equal(f.pacing.check({name:'B',view:'drone_follow'},f.n).allow,false);
 const g=fixture();g.n.requestId='future';g.n.renderedAt=g.now()+60000;g.pacing.observe(g.n);assert.notEqual(g.pacing.current.signature.split(':')[0],'future');
});
test('automatic safety fallbacks keep their actual view without consuming editorial cuts or restarting dwell',()=>{
 const f=fixture(),before=f.pacing.current.shotAt;f.tick(14000);f.n.effectiveView='first_person';f.pacing.observe(f.n);
 assert.equal(f.pacing.current.view,'first_person');assert.equal(f.pacing.current.shotAt,before);assert.equal(f.pacing.history.length,0);
 f.tick(4000);f.n.effectiveView='drone_eye';f.pacing.observe(f.n);assert.equal(f.pacing.history.length,0);assert.equal(f.pacing.current.view,'drone_eye');
});
