import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createNativeBedrockModel} from '../../src/native-viewer/native-entity-model-bedrock.js';
import {applyPaperYsmAnimation} from '../../src/modern-viewer/paper-ysm-animation.js';
import {createPaperHeldItem} from '../../src/modern-viewer/paper-ysm-items.js';

const source=new URL('../../../asset-packs/native-1.21.1/assets/yes_steve_model/builtin/default/',import.meta.url);
const read=p=>JSON.parse(fs.readFileSync(new URL(p,source),'utf8'));
const models={'item/generated':{parent:'builtin/generated'},'item/crossbow':{parent:'item/generated',textures:{layer0:'item/crossbow_standby'},display:{
 thirdperson_righthand:{rotation:[-90,0,-60],translation:[2,.1,-3],scale:[.9,.9,.9]},
 thirdperson_lefthand:{rotation:[-90,0,30],translation:[2,.1,-3],scale:[.9,.9,.9]},
}}};
const options={textureLoader:async()=>new THREE.Texture(),readPixels:async()=>({width:2,height:2,pixels:new Uint8Array(16).fill(255)})};

test('crossbow muzzle points outwards in original YSM charged poses, both hands and all body yaws',async()=>{
 const geometry=read('models/main.json'),armClips=read('animations/arm.animation.json');
 for(const hand of ['mainhand','offhand']){
  const model=createNativeBedrockModel(geometry,new THREE.MeshBasicMaterial(),{maxBones:512,maxCubes:2048,maxCubesPerBone:256,allowNegativeSizes:true});
  const root=new THREE.Group(),basis=new THREE.Group();root.add(basis);basis.scale.set(-1,-1,1);basis.add(model.root);
  applyPaperYsmAnimation(model,armClips,'hold_'+hand+':charged_crossbow',0,{headYaw:0,headPitch:0});
  const side=hand==='mainhand'?'right':'left',item=await createPaperHeldItem(models,{name:'crossbow'},side,options);
  model.bones.get(side==='right'?'RightHandLocator':'LeftHandLocator').add(item.root);
  // Original sprite: stock at bottom-right, muzzle towards top-left. The
  // model remains centred; compare physical direction, not our matrix formula.
  const stock=new THREE.Vector3(12/16-.5,.5-13/16,0),muzzle=new THREE.Vector3(4/16-.5,.5-4/16,0);
  for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
   root.rotation.y=yaw;root.updateMatrixWorld(true);
   const firing=muzzle.clone().applyMatrix4(item.root.matrixWorld).sub(stock.clone().applyMatrix4(item.root.matrixWorld)).normalize();
   const forward=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0),yaw);
   assert.ok(firing.dot(forward)>.8,`${hand}: muzzle must face forward, got ${firing.toArray()}`);
  }
  item.dispose();model.dispose();
 }
});

test('custom geometric crossbows preserve their authored frame',async()=>{
 const custom={'item/crossbow':{textures:{all:'block/stone'},display:{thirdperson_righthand:{rotation:[12,30,40],translation:[1,2,3]}},elements:[{from:[0,0,0],to:[16,16,16],faces:{north:{texture:'#all'}}}]}};
 const {paperYsmItemMount}=await import('../../src/modern-viewer/paper-ysm-items.js');
 const item=await createPaperHeldItem(custom,{name:'crossbow'},'right',options),expected=paperYsmItemMount(custom['item/crossbow'].display.thirdperson_righthand,'right');
 assert.ok(item.root.matrix.elements.every((x,i)=>Math.abs(x-expected.elements[i])<1e-10));item.dispose();
});
