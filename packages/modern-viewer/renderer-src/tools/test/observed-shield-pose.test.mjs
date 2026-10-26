import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {PaperYsmAnimation} from '../../src/modern-viewer/paper-ysm-animation.js';
import {createPaperHeldItem} from '../../src/modern-viewer/paper-ysm-items.js';
import {batchStaticYsmBones} from '../../src/modern-viewer/ysm-bone-batch.js';
const models={'item/shield':{parent:'builtin/entity',display:{thirdperson_righthand:{rotation:[0,90,0],translation:[10,6,-4]},thirdperson_lefthand:{rotation:[0,90,0],translation:[10,6,12]}}}};
function rig(){const root=new THREE.Group(),bones=new Map();for(const side of ['Right','Left']){let parent=root;for(const part of ['Arm','ForeArm','Hand','HandLocator']){const b=new THREE.Group();b.name=side+part;parent.add(b);bones.set(b.name,b);parent=b;}}
const initial=new Map([...bones].map(([n,b])=>[n,{position:b.position.clone(),rotation:b.rotation.clone()}]));return {root,bones,initial,reset(){for(const[n,b]of bones){b.position.copy(initial.get(n).position);b.rotation.copy(initial.get(n).rotation);b.scale.setScalar(1);}}};}
const main={format_version:'1.8.0',animations:{idle:{loop:true,bones:{}},use_offhand:{loop:true,bones:{RightArm:{rotation:[90,0,0]}}}}};
test('fallback holds the original shield upright at its grip, supports either hand and clears immediately',async()=>{
for(const mainArm of ['right','left'])for(const hand of ['mainhand','offhand']){
 const m=rig(),side=(hand==='mainhand')===(mainArm==='right')?'Right':'Left',physical=side.toLowerCase();
 const item=await createPaperHeldItem(models,{name:'shield'},physical,{textureLoader:async()=>new THREE.Texture()});m.bones.get(side+'HandLocator').add(item.root);
 const control=new PaperYsmAnimation(m,main),equipment=hand==='mainhand'?[{name:'shield'},null]:[null,{name:'shield'}];
 const active={motion:{onGround:true,equipment,usingItem:true,activeHand:hand,mainArm}};
 const a=control.apply(active,1000);assert.equal(a.shieldPose.available,true);assert.equal(a.shieldPose.alignment,'original_item_locator');assert.ok(!a.clips.includes('use_offhand'));
 m.root.updateWorldMatrix(true,true);const up=new THREE.Vector3(0,1,0).transformDirection(item.root.matrixWorld),normal=new THREE.Vector3(0,0,-1).transformDirection(item.root.matrixWorld);
 assert.ok(Math.abs(up.y)>0.999,'shield plate remains vertical');assert.ok(normal.z<-.999,'plate faces model forward, handle stays behind it');
 const held=m.bones.get(side+'Hand').quaternion.clone();control.apply(active,5000);assert.ok(held.angleTo(m.bones.get(side+'Hand').quaternion)<1e-7,'no looping punch');
 control.apply({motion:{...active.motion,usingItem:false}},5001);assert.equal(m.bones.get(side+'Arm').rotation.x,0);assert.equal(m.bones.get(side+'Hand').rotation.y,0);
 const dead=control.apply({motion:{...active.motion,bodyState:{source:'server',canAct:false,pose:'downed'}}},6000);assert.equal(dead.shieldPose,null);item.dispose();
}});
test('authored shield-use clips take priority and unsupported rigs remain explicit',()=>{
 const m=rig(),arm={format_version:'1.8.0',animations:{'use_offhand:shield':{loop:true,bones:{LeftArm:{rotation:[-25,0,0]}}}}};
 const motion={onGround:true,equipment:[null,{name:'shield'}],usingItem:true,activeHand:'offhand'};
 const state=new PaperYsmAnimation(m,main,{arm}).apply({motion},1000);assert.equal(state.shieldPose,null);assert.ok(state.clips.includes('use_offhand:shield'));
 m.bones.delete('LeftHand');assert.equal(new PaperYsmAnimation(m,main).apply({motion},1000).shieldPose.available,false);
});
test('batching retains procedural arm and hand movement even without authored clips',()=>{
 const m=rig(),material=new THREE.MeshBasicMaterial();
 for(const name of ['LeftArm','LeftForeArm','LeftHand'])for(let i=0;i<2;i++)m.bones.get(name).add(new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1),material));
 const batch=batchStaticYsmBones(m,material,[main],['LeftArm','LeftForeArm','LeftHand']);
 for(const name of ['LeftArm','LeftForeArm','LeftHand'])assert.equal(m.bones.get(name).children.filter(c=>c.isMesh).length,1,name+' geometry follows its bone');
 batch.dispose();material.dispose();
});
