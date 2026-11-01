import test from 'node:test';import assert from 'node:assert/strict';
import {selectNativeShot,nativeShotReceipt,NATIVE_CAMERA_RECIPES} from './shot-policy.mjs';
const caps={availableViews:Object.keys(NATIVE_CAMERA_RECIPES)};
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
