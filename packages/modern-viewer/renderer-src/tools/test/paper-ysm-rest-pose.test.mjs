import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {applyRescuePose,relaxRestTail} from '../../src/modern-viewer/paper-ysm-rest-pose.js';
import {createPaperYsmActor} from '../../src/modern-viewer/paper-ysm.js';
const encode=o=>({base64:Buffer.from(JSON.stringify(o)).toString('base64')});
const bones=[{name:'Root',pivot:[0,0,0]}, {name:'UpBody',parent:'Root',pivot:[0,20,0]}, {name:'Head',parent:'UpBody',pivot:[0,30,0]}];
for(const [side,sign]of [['Right',-1],['Left',1]]){
 for(const [name,parent,pivot]of [['Arm','UpBody',[4*sign,27,0]],['ForeArm',side+'Arm',[4*sign,20,0]],['Hand',side+'ForeArm',[4*sign,14,0]],['Leg','Root',[2*sign,16,0]],['LowerLeg',side+'Leg',[2*sign,9,0]],['Foot',side+'LowerLeg',[2*sign,2,0]]])bones.push({name:side+name,parent,pivot});
}
for(let i=0;i<7;i++)bones.push({name:'Tail'+(i?i+1:''),parent:i?'Tail'+(i>1?i:''):'UpBody',pivot:[i*2,20,2+i*2]});
const bundle=(extra={})=>({modelId:'articulated-test',model:'m',animation:'a',textures:{main:'t'},files:{
 'ysm.json':encode({spec:2,properties:{free:true,width_scale:1,height_scale:1}}),
 m:encode({format_version:'1.12.0','minecraft:geometry':[{description:{identifier:'geometry.test',texture_width:16,texture_height:16},bones:bones.map(b=>({...b,cubes:[{origin:[b.pivot[0]-.5,b.pivot[1]-.5,b.pivot[2]-.5],size:[1,1,1],uv:[0,0]}]}))}]}),
 a:encode({format_version:'1.8.0',animations:{idle:{loop:true,bones:{}},sleep:{loop:true,bones:{}},...extra}}),t:{base64:''}}});
const actor=extra=>createPaperYsmActor(bundle(extra),'main',{loadTexture:async()=>new THREE.Texture()});
const p=(a,n)=>a.model.bones.get(n).getWorldPosition(new THREE.Vector3());
const down={motion:{bodyState:{source:'server',canAct:false,pose:'downed'}}};
test('confirmed downed selects supported rescue, palm contacts floor, limbs retain lengths and recovery clears pose',async()=>{
 const a=await actor();a.animate({motion:{onGround:true}},100);
 const before=[p(a,'RightArm').distanceTo(p(a,'RightForeArm')),p(a,'RightForeArm').distanceTo(p(a,'RightHand'))];
 a.animate(down,200);assert.equal(a.animationState.presentation.rescue.source,'viewer-authored');
 assert.equal(a.root.rotation.x,0,'no whole-body prone rotation');
 assert.ok(p(a,'RightHand').y<.10,'support palm is near the ground');
 assert.ok(p(a,'Head').y>.3,'head stays raised while waiting');
 assert.ok(Math.abs(p(a,'RightArm').distanceTo(p(a,'RightForeArm'))-before[0])<1e-6);
 assert.ok(Math.abs(p(a,'RightForeArm').distanceTo(p(a,'RightHand'))-before[1])<1e-6);
 const height=a.root.position.y;a.animate(down,300);assert.ok(Math.abs(a.root.position.y-height)<1e-9,'rest pose never accumulates translation');
 a.animate({motion:{onGround:true,bodyState:{source:'server',canAct:true,pose:'standing'}}},400);
 assert.deepEqual(a.root.position.toArray(),[0,0,0]);assert.deepEqual(a.animationState.presentation,{});
 a.dispose();
});
test('original downed clip has priority; unconfirmed pose alone never activates rescue',async()=>{
 const a=await actor({downed:{loop:true,bones:{Head:{rotation:[5,0,0]}}}});
 a.animate(down,100);assert.equal(a.animationState.presentation.rescue.source,'original-clip');assert.equal(a.root.rotation.x,0);
 a.animate({motion:{onGround:true,bodyState:{source:'unknown',canAct:false,pose:'downed'}}},200);
 assert.equal(a.animationState.base,'idle');assert.deepEqual(a.animationState.presentation,{});a.dispose();
});
test('rest tail preserves segment lengths and reports unavailable rigs instead of guessing',async()=>{
 const a=await actor();a.animate({motion:{onGround:true}},100);
 const lengths=Array.from({length:6},(_,i)=>p(a,'Tail'+(i?i+1:'')).distanceTo(p(a,'Tail'+(i+2))));
 const r=relaxRestTail(a.model,a.root,.2);assert.equal(r.source,'viewer-authored');
 for(let i=0;i<6;i++)assert.ok(Math.abs(p(a,'Tail'+(i?i+1:'')).distanceTo(p(a,'Tail'+(i+2)))-lengths[i])<1e-6);
 assert.ok(p(a,'Tail7').y<p(a,'Tail').y);
 assert.equal(relaxRestTail({bones:new Map()},a.root,0).available,false);
 assert.equal(applyRescuePose({bones:new Map()},a.root).available,false);a.dispose();
});
