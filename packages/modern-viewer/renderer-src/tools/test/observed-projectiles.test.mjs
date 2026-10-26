import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import * as THREE from 'three';
import data from '../../src/modern-viewer/observed-projectile-data.json' with {type:'json'};
import {OBSERVED_PROJECTILE_TYPES,observedProjectileItem,createObservedProjectileVisual,ObservedProjectileLayer} from '../../src/modern-viewer/observed-projectiles.js';
import {pngRgba} from './fixtures/png-rgba.mjs';
const assets=new URL('../../../asset-packs/vanilla-1.21.1/assets/minecraft/',import.meta.url),models={};
async function model(name){if(models[name])return;const v=JSON.parse(await fs.readFile(new URL('models/'+name+'.json',assets)));models[name]=v;if(v.parent&&!v.parent.startsWith('builtin/'))await model(v.parent.replace(/^minecraft:/,''));}
for(const name of ['egg','ender_pearl','experience_bottle','splash_potion','lingering_potion','snowball','ender_eye','fire_charge','firework_rocket'])await model('item/'+name);
const textureLoader=async id=>{const pixels=pngRgba(await fs.readFile(new URL('textures/'+id.replace(/^minecraft:/,'')+'.png',assets)));const t=new THREE.Texture({width:pixels.width,height:pixels.height});t.userData.pixels=pixels;return t;};
const options={models,version:'1.21.1',textureLoader,readPixels:t=>t.userData.pixels};
test('every projectile in the primary Java registry has an explicit rendering path',()=>{
 const registry=createRequire(import.meta.url)('minecraft-data')('1.21.1');
 assert.ok(registry.entitiesArray.filter(e=>e.type==='projectile').length>=17);
 for(const e of registry.entitiesArray.filter(e=>e.type==='projectile'))assert.ok(e.name==='fishing_bobber'||OBSERVED_PROJECTILE_TYPES.includes(e.name),e.name);
});
test('witch potion distinguishes effects, lingering bottle, custom black, empty and corrupt metadata',()=>{
 const potion=data.potions.find(p=>p.name==='minecraft:poison'),id=data.items.find(p=>p.name==='minecraft:lingering_potion').id;
 const e={name:'potion',metadata:{8:{itemCount:1,itemId:id,components:[{type:'potion_contents',data:{potionId:potion.id,customEffects:[]}}]}}};
 assert.equal(observedProjectileItem(e).name,'lingering_potion');assert.equal(observedProjectileItem(e).color,potion.color&0xffffff);
 e.metadata[8].components[0].data.customColor=0;assert.equal(observedProjectileItem(e).color,0);
 e.metadata[8]={itemCount:0};assert.equal(observedProjectileItem(e),null);
 e.metadata[8]={itemCount:1,itemId:99999};assert.throws(()=>observedProjectileItem(e),/REGISTRY_UNAVAILABLE/);
 assert.equal(observedProjectileItem({name:'potion'}).color,data.emptyPotionColor&0xffffff);
});
test('other protocol versions use their supplied item registry, never primary-version numeric IDs',()=>{
 const registry={items:{1158:{name:'splash_potion'},1110:{name:'snowball'}}};
 const e={name:'snowball',metadata:{8:{itemCount:1,itemId:1110,components:[]}}};
 assert.equal(observedProjectileItem(e,'1.20.6',registry).name,'snowball');
 assert.throws(()=>observedProjectileItem(e,'1.20.6'),/REGISTRY_UNAVAILABLE/);
 e.name='potion';e.metadata[8]={itemCount:1,itemId:1158,components:[{type:'potion_contents',data:{potionId:23,customColor:0,customEffects:[]}}]};
 assert.equal(observedProjectileItem(e,'1.20.6',registry).color,0);
 delete e.metadata[8].components[0].data.customColor;
 assert.throws(()=>observedProjectileItem(e,'1.20.6',registry),/POTION_REGISTRY_UNAVAILABLE/);
});
test('original textures and geometry build for every newly covered entity without placeholder cubes',async()=>{
 for(const name of OBSERVED_PROJECTILE_TYPES.filter(n=>!['arrow','spectral_arrow','tipped_arrow'].includes(n))){
  const actor=await createObservedProjectileVisual({id:3,name,metadata:{}},options);
  let faces=0;actor.root.traverse(p=>{if(p.isMesh)faces+=p.geometry.index.count/6;});assert.ok(faces>0,name);
  assert.equal(actor.root.userData.geometrySource,'Minecraft_original_item_models_or_baked_layers');actor.dispose();
 }
});
test('late textures cannot resurrect destroyed entities; reused IDs and shifted origins stay correct',async()=>{
 const scene=new THREE.Scene(),pending=[],disposed=[];
 const layer=new ObservedProjectileLayer({scene:()=>scene,origin:()=>({x:100,y:60,z:200}),create:e=>new Promise(resolve=>pending.push(()=>resolve({root:new THREE.Group(),dispose(){disposed.push(e.name);this.root.removeFromParent();}})))});
 layer.update({id:1,name:'potion',pos:{x:101,y:62,z:203}});layer.remove(1);pending.shift()();await new Promise(r=>setImmediate(r));
 assert.equal(scene.children.length,0);assert.deepEqual(disposed,['potion']);
 layer.update({id:1,name:'snowball',pos:{x:101,y:62,z:203}});pending.shift()();await new Promise(r=>setImmediate(r));
 assert.deepEqual(scene.children[0].position.toArray(),[1,2,3]);
 layer.update({id:1,name:'snowball',pos:{x:105,y:63,z:204}});layer.tick();assert.deepEqual(scene.children[0].position.toArray(),[5,3,4]);
 layer.update({id:1,name:'zombie',pos:{x:105,y:63,z:204}});assert.equal(scene.children.length,0,'nonprojectile reuse must remove the old projectile');
 layer.clear();assert.equal(scene.children.length,0);
});
test('trident tip follows received velocity and never rotates back to the model upright axis',async()=>{
 const scene=new THREE.Scene(),layer=new ObservedProjectileLayer({scene:()=>scene,create:async()=>{const root=new THREE.Group();root.userData.directionAxis=[0,-1,0];return {root,dispose(){root.removeFromParent();}};}});
 layer.update({id:3,name:'trident',pos:{x:0,y:1,z:0},velocity:{x:1,y:0,z:0},yaw:0,pitch:0});await new Promise(r=>setImmediate(r));
 const tip=new THREE.Vector3(0,-1,0).applyQuaternion(scene.children[0].quaternion);assert.ok(tip.x>.999);
 layer.tick();assert.ok(new THREE.Vector3(0,-1,0).applyQuaternion(scene.children[0].quaternion).x>.999);layer.clear();
});
