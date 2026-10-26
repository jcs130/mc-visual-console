import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPaperHeldItem,PaperYsmHeldItems,PAPER_SHIELD_PARTS,paperYsmItemMount} from '../../src/modern-viewer/paper-ysm-items.js';

// Original 1.20.6 item/shield display; kept separate from geometry for both arms.
const models={'item/shield':{parent:'builtin/entity',display:{
 thirdperson_righthand:{rotation:[0,90,0],translation:[10,6,-4],scale:[1,1,1]},
 thirdperson_lefthand:{rotation:[0,90,0],translation:[10,6,12],scale:[1,1,1]},
}}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('original shield plate, handle, UV atlas and special-renderer transform reach both YSM hands',async()=>{
 assert.deepEqual(PAPER_SHIELD_PARTS.parts.map(p=>p.cubes[0]),[
   {origin:[-6,-11,-2],size:[12,22,1],uv:[0,0]},
   {origin:[-1,-3,-1],size:[2,6,6],uv:[26,0]}]);
 for(const arm of ['left','right']){
  const calls=[],texture=new THREE.Texture();let disposals=0;texture.addEventListener('dispose',()=>disposals++);
  const item=await createPaperHeldItem(models,{name:'shield'},arm,{textureLoader:async id=>{calls.push(id);return texture;}});
  assert.deepEqual(calls,['minecraft:entity/shield_base_nopattern']);
  const native=item.root.children[0];native.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(native);
  assert.deepEqual(bounds.min.toArray(),[-6/16,-11/16,-2/16]);
  assert.deepEqual(bounds.max.toArray(),[6/16,11/16,5/16]);
  const front=native.getObjectByName('plate').children.find(m=>m.userData.nativeFace==='north');
  assert.deepEqual(Array.from(front.geometry.attributes.uv.array),[13/64,63/64,1/64,63/64,1/64,41/64,13/64,41/64]);
  const expected=paperYsmItemMount(models['item/shield'].display['thirdperson_'+arm+'hand'],arm)
   .multiply(new THREE.Matrix4().makeTranslation(-.5,-.5,-.5)).multiply(new THREE.Matrix4().makeScale(1,-1,-1));
  assert.ok(item.root.matrix.elements.every((v,i)=>Math.abs(v-expected.elements[i])<1e-8));
  // Physical invariant in the actual YSM actor basis (X/Y inverted): plate
  // outside the palm, handle inside, in BOTH hands and at any player yaw.
  const actorBasis=new THREE.Matrix4().makeScale(-1,-1,1);
  const shieldMatrix=actorBasis.clone().multiply(item.root.matrix);
  const plate=new THREE.Vector3(0,0,-1.5/16).applyMatrix4(shieldMatrix);
  const grip=new THREE.Vector3(0,0,2/16).applyMatrix4(shieldMatrix);
  assert.ok(Math.abs(grip.x)<1e-6,'turning the shield must not move its grip off the palm');
  for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
   const outward=new THREE.Vector3(arm==='left'?-1:1,0,0).applyAxisAngle(new THREE.Vector3(0,1,0),yaw);
   const towardPlate=plate.clone().sub(grip).applyAxisAngle(new THREE.Vector3(0,1,0),yaw);
   assert.ok(towardPlate.dot(outward)>.2,'the plate must face away from the body, not the handle');
  }
  item.dispose();item.dispose();assert.equal(disposals,1);
 }
});
test('offhand updates attach, clear and reassign the shield to the native locator',async()=>{
 const right=new THREE.Group(),left=new THREE.Group();
 const held=new PaperYsmHeldItems({bones:new Map([['RightHandLocator',right],['LeftHandLocator',left]])},models,{textureLoader:async()=>new THREE.Texture()});
 held.apply([null,{name:'shield'}]);await tick();
 assert.equal(held.stats().left.status,'ready');assert.equal(left.children.length,1);assert.equal(right.children.length,0);
 held.apply([null,null]);await tick();assert.equal(left.children.length,0);
 held.apply([null,{name:'shield'}],'left');await tick();assert.equal(right.children.length,1);
 held.dispose();assert.equal(right.children.length,0);
});
test('unsupported patterned or custom shields remain explicit instead of showing the wrong skin',async()=>{
 await assert.rejects(createPaperHeldItem(models,{name:'shield',components:[{type:'banner_patterns'}]},'left'),/PATTERN_UNSUPPORTED/);
 await assert.rejects(createPaperHeldItem(models,{name:'shield',components:[{type:'custom_model_data'}]},'left'),/DYNAMIC_VISUAL_UNSUPPORTED/);
});
