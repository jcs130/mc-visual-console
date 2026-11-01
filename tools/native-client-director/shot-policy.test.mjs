import test from 'node:test';import assert from 'node:assert/strict';
import {selectNativeShot,nativeShotReceipt,NATIVE_CAMERA_RECIPES,mayPreferOrthographic,nativeCurrentView} from './shot-policy.mjs';
const caps={availableViews:Object.keys(NATIVE_CAMERA_RECIPES)};

test('startup adopts actual first-person fallback instead of the stale requested front rig',()=>{
 const n={...caps,projection:'perspective',perspective:'FIRST_PERSON',drone:{active:true},droneShot:'drone_front',effectiveView:'first_person'};
 assert.equal(nativeCurrentView(n),'first_person');
 assert.equal(nativeCurrentView({...n,projection:'orthographic',projectionProfile:'ortho_isometric',orthographic:{active:true}}),'ortho_isometric');
 assert.equal(nativeCurrentView({...n,projection:'orthographic',projectionProfile:'ortho_isometric',orthographic:{active:false}}),'first_person');
});

test('a first-person safety fallback can recover without overriding fresh GUI interaction',()=>{
 assert.equal(mayPreferOrthographic('first_person',{now:100000}),true);
 assert.equal(mayPreferOrthographic('first_person',{now:100000,lastInteractionAt:90000}),false);
 assert.equal(mayPreferOrthographic('first_person',{now:100000,lastInteractionAt:90000,preferOrthographic:true}),true);
 assert.equal(mayPreferOrthographic('first_person',{screenOpen:true,preferOrthographic:true}),false);
 assert.equal(mayPreferOrthographic('first_person',{now:100000,lastInteractionAt:84000}),true);
 assert.equal(mayPreferOrthographic('first_person',{now:100000,lastInteractionAt:100001}),false);
 assert.equal(mayPreferOrthographic('drone_eye',{screenOpen:true}),false);
 assert.equal(mayPreferOrthographic('ortho_isometric'),false);
 assert.equal(mayPreferOrthographic('drone_orbit_left'),false);
});
test('new views require explicit host opt-in and real native capabilities',()=>{
 const choice={kind:'movement',view:'drone_follow'};
 assert.equal(selectNativeShot(choice,caps),choice);
 assert.equal(selectNativeShot(choice,caps,{enabled:true}).view,'drone_front_left');
 assert.equal(selectNativeShot(choice,{availableViews:['drone_follow']},{enabled:true}).view,'drone_follow');
 assert.equal(selectNativeShot(choice,{availableViews:[]},{enabled:true}),null);
});
test('activity uses readable views; orbit requires a verified deliberate showcase',()=>{
 const views={combat:'drone_eye',interaction:'first_person',movement:'drone_front_left',conversation:'drone_front',overview:'drone_overview'};
 for(const[kind,view]of Object.entries(views))assert.equal(selectNativeShot({kind,view:'drone_follow'},caps,{enabled:true}).view,view);
 assert.equal(selectNativeShot({kind:'showcase',view:'drone_follow'},caps,{enabled:true}).view,'drone_follow');
 assert.equal(selectNativeShot({kind:'showcase',view:'drone_follow',verifiedOutcome:true},caps,{enabled:true}).view,'drone_orbit_left');
});
function fixture(){return{request:{id:'op',lease:'owner',view:'drone_orbit_left',connectionEpoch:'conn',nativeWorldEpoch:1,targetUuid:'actor',issuedAt:100},
 native:{requestId:'op',activeLease:'owner',connectionEpoch:'conn',nativeWorldEpoch:1,phase:'attached',targetUuid:'actor',cameraUuid:'actor',renderedAt:100,
 drone:{active:true,lastRenderedAt:100},shotExecution:{requestId:'op',view:'drone_orbit_left',phase:'running',fallback:false}}};}
test('RPC attachment and elapsed motion do not finish a finite program frame',()=>{
 const{native:n,request:r}=fixture();const result=()=>nativeShotReceipt(n,r,200);
 assert.equal(result().kind,'waiting');n.shotExecution.phase='settling';assert.equal(result().kind,'waiting');
 n.shotExecution.phase='completed';n.transition={active:true};assert.equal(result().kind,'waiting');
 n.transition.active=false;assert.equal(result().kind,'applied');
});
test('fresh world, lease, actor and post-request native render evidence are all necessary',()=>{
 for(const patch of[{activeLease:'foreign'},{connectionEpoch:'other'},{nativeWorldEpoch:2},{cameraUuid:'other'},{targetUuid:'other'},
  {renderedAt:99},{renderedAt:201},{drone:{active:true,lastRenderedAt:99}},{drone:{active:true,lastRenderedAt:201}}]){
  const{native:n,request:r}=fixture();n.shotExecution.phase='completed';Object.assign(n,patch);assert.notEqual(nativeShotReceipt(n,r,200).kind,'applied');
 }
});
test('unknown, blocked and cancellation remain distinct from successful camera motion',()=>{
 const{native:n,request:r}=fixture();n.phase='unknown';assert.equal(nativeShotReceipt(n,r,200).kind,'unknown');
 n.phase='cancelled';assert.equal(nativeShotReceipt(n,r,200).kind,'cancelled');n.phase='attached';n.shotExecution.phase='blocked';
 assert.equal(nativeShotReceipt(n,r,200).kind,'rejected');
});
test('close rear follow can finish on a documented first-person fallback, a requested front cannot',()=>{
 for(const view of['drone_follow','drone_front']){const{native:n,request:r}=fixture();r.view=view;n.shotExecution={requestId:'op',view,phase:'holding',fallback:true};
  n.effectiveView='first_person';assert.equal(nativeShotReceipt(n,r,200).kind,view==='drone_follow'?'applied':'rejected');}
});

test('prefer original OrthoCamera only for current proven open geometry, with a projection cooldown',()=>{
 const now=100000,n={...caps,projection:'perspective',orthographic:{ready:true},cameraUuid:'actor',nativeWorldEpoch:1,targets:[{name:'Alice',uuid:'actor'}],
  spatial:{at:now,targetUuid:'actor',nativeWorldEpoch:1,layout:'open',known:true,floorSafe:true,orthographicVisibility:1}};
 const choice={name:'Alice',kind:'overview',view:'drone_overview'},opts={enabled:true,orthographic:true,now};
 assert.equal(selectNativeShot(choice,n,opts).view,'ortho_overview');
 const room={...n,spatial:{...n.spatial,layout:'room'}};
 assert.equal(selectNativeShot(choice,room,opts).view,'ortho_overview');
 assert.equal(selectNativeShot(choice,n,{...opts,lastProjectionChangeAt:now-1000}).view,'drone_overview');
 for(const patch of[{layout:'tunnel'},{layout:'layered'},{known:false},{floorSafe:false},{targetUuid:'other'},{at:now-3000},{orthographicVisibility:.4}]){
  const other={...n,spatial:{...n.spatial,...patch}};assert.equal(selectNativeShot(choice,other,opts).view,'drone_overview');}
 assert.equal(selectNativeShot({...choice,kind:'combat'},n,opts).view,'drone_eye');
 assert.equal(selectNativeShot({...choice,kind:'interaction'},n,opts).view,'first_person');
 assert.equal(selectNativeShot({...choice,kind:'interaction'},n,{...opts,preferOrthographic:true}).view,'ortho_close');
 assert.equal(selectNativeShot({...choice,kind:'interaction'},{...n,screenOpen:true},{...opts,preferOrthographic:true}).view,'first_person');
 const active={...n,projection:'orthographic',projectionProfile:'ortho_overview'};
 const recent={...opts,lastProjectionChangeAt:now-1000};
 assert.equal(selectNativeShot({...choice,kind:'combat'},active,recent).view,'ortho_overview','fresh battle labels do not force a projection change');
 assert.equal(selectNativeShot({...choice,kind:'movement'},active,recent).view,'ortho_overview','keep the proven composition during its dwell');
 assert.equal(selectNativeShot({...choice,kind:'combat'},active,opts).view,'ortho_isometric','readable battle keeps a safe orthographic view');
 assert.equal(selectNativeShot({...choice,kind:'interaction'},active,recent).view,'first_person','precise interaction can request POV');
 assert.equal(selectNativeShot({...choice,kind:'combat'},{...active,spatial:{...n.spatial,layout:'tunnel'}},recent).view,'drone_eye','dwell does not pretend an unsafe view is available');
 const held={...active,phase:'attached',target:'Alice',targetUuid:'actor',orthographic:{ready:true,active:true},targets:[...n.targets,{name:'Bob',uuid:'bob'}]};
 const other={name:'Bob',kind:'movement',view:'drone_follow'};
 assert.equal(selectNativeShot(other,held,{...recent,preferOrthographic:true}),null,'orthographic preference also holds the visible subject, rather than cutting away after twelve seconds');
 assert.notEqual(selectNativeShot(other,held,{...opts,preferOrthographic:true}),null,'subject hold expires');
 assert.notEqual(selectNativeShot(other,{...held,spatial:{...held.spatial,known:false}},{...recent,preferOrthographic:true}),null,'unknown geometry cannot pretend the current frame is safe');
});

test('orthographic receipt requires actual projection/profile and bound native frame, including SDK fallback refusal',()=>{
 const{native:n,request:r}=fixture();r.view='ortho_isometric';n.projection='orthographic';n.projectionProfile=r.view;
 n.orthographic={requestId:r.id,view:r.view,active:true,phase:'transitioning',targetUuid:'actor',nativeWorldEpoch:1,renderedAt:100};
 assert.equal(nativeShotReceipt(n,r,200).kind,'waiting');n.orthographic.phase='holding';assert.equal(nativeShotReceipt(n,r,200).kind,'applied');
 n.projectionProfile='ortho_top';assert.equal(nativeShotReceipt(n,r,200).kind,'waiting');n.projectionProfile=r.view;
 n.orthographic.targetUuid='other';assert.equal(nativeShotReceipt(n,r,200).kind,'waiting');n.orthographic.targetUuid='actor';
 n.orthographic.phase='blocked';n.projection='perspective';assert.equal(nativeShotReceipt(n,r,200).kind,'rejected');
});
