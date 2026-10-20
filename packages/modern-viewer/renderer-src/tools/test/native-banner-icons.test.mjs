import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import {vanillaItemStack} from '../../host/vanilla-item-stack.mjs';
import {parseNativeItemStack} from '../../src/native-viewer/native-item-stack.js';
import {NativeItemIcons} from '../../src/native-viewer/native-item-icons.js';
import {NativeAssetReader} from '../../src/native-viewer/model-loader.js';
import {pngRgba} from './fixtures/png-rgba.mjs';
import {prepareNativeBannerItem,NATIVE_BANNER_COLORS} from '../../src/native-viewer/native-banner-items.js';
import {resolveNativeItemAppearance} from '../../src/native-viewer/native-item-appearance.js';
import {buildNativeBlockItemObject,disposeNativeBlockItemObject} from '../../src/native-viewer/native-block-item-icons.js';
const root=new URL('../../../asset-packs/vanilla-1.21.1/',import.meta.url);
const reader=async()=>new NativeAssetReader(JSON.parse(await fs.readFile(new URL('native-assets.json',root),'utf8')),p=>fs.readFile(new URL(p,root)));
test('an observed empty banner pattern patch retains complete SNBT instead of losing the inventory item',()=>{
 const wire=vanillaItemStack({name:'brown_banner',count:1,components:[{type:'banner_patterns',data:[]}],removedComponents:[]});
 assert.equal(wire.reason,null);assert.deepEqual(parseNativeItemStack(wire.item).components['minecraft:banner_patterns'],[]);
});
test('all sixteen original dyes retain native geometry, texture layers and exact diffuse tint without generic replacements',async()=>{
 const r=await reader();
 for(const [color,rgb] of Object.entries(NATIVE_BANNER_COLORS)){
  const plan=await prepareNativeBannerItem(r,'minecraft:'+color+'_banner');
  assert.equal(plan.faces.length,24);assert.equal(plan.faces.filter(f=>f.tintColor===rgb).length,6);
  assert.deepEqual(plan.transform.rotation,[30,20,0]);
  const textures=new Map();for(const path of plan.texturePaths){const decoded=pngRgba(await r.bytes(path));
   assert.deepEqual([decoded.width,decoded.height],[64,64]);assert.ok(decoded.pixels.every((v,i)=>i%4!==3||v===0||v===255));
   textures.set(path,new THREE.Texture({width:64,height:64}));}
  const object=buildNativeBlockItemObject(plan,textures),flag=object.children.find(m=>m.userData.tintColor===rgb);
  assert.deepEqual(flag.material.uniforms.nativeTint.value.toArray(),[(rgb>>>16&255)/255,(rgb>>>8&255)/255,(rgb&255)/255]);
  disposeNativeBlockItemObject(object);for(const value of textures.values())value.dispose();
 }
});
test('decorated/unknown banner inputs stay explicit and GUI geometry never impersonates a supported held model',async()=>{
 const wire=vanillaItemStack({name:'brown_banner',count:1,components:[{type:'banner_patterns',data:[{pattern:{patternId:1},colorId:0}]}],removedComponents:[]});
 assert.match(wire.reason,/UNSUPPORTED:banner_patterns/);assert.equal(wire.item.snbt,undefined);
 const r=await reader(),raw={name:'minecraft:brown_banner',count:1,snbt:'{id:"minecraft:brown_banner",count:1,components:{"minecraft:banner_patterns":[{pattern:"unknown:pattern",color:"red"}]}}'};
 const icons=new NativeItemIcons(r);assert.match(icons.reason(raw),/VISUAL_COMPONENT_UNSUPPORTED/);icons.dispose();
 const plain=parseNativeItemStack({...raw,snbt:'{id:"minecraft:brown_banner",count:1}'});
 await assert.rejects(resolveNativeItemAppearance(r,plain,{kind:'thirdperson_righthand'}),/SPECIAL_MODEL_UNAVAILABLE/);
 const wrong={...r,manifest:{...r.manifest,clientJarSha256:'0'.repeat(64)}};
 await assert.rejects(prepareNativeBannerItem(wrong,'minecraft:brown_banner'),/CLIENT_UNVERIFIED/);
});
test('the shared icon queue renders the original brown banner cloth, pole and bar with original textures',async()=>{
 let renders=0;
 const icons=new NativeItemIcons(await reader(),{createUrl:()=> 'blob:banner',revokeUrl(){},bannerRendererOptions:{
  loadTexture:async bytes=>{const {width,height}=pngRgba(bytes);return new THREE.Texture({width,height});},
  createRenderer:()=>({clear(){},render(scene){renders++;assert.ok(scene.children[0].children.length>=18);},dispose(){}}),
  encode:async()=>new Blob([new Uint8Array([1])],{type:'image/png'})}});
 const item={name:'minecraft:brown_banner',count:1,snbt:'{id:"minecraft:brown_banner",count:1,components:{"minecraft:banner_patterns":[]}}'};
 icons.resolve(item);while(icons.active||icons.queue.length)await new Promise(r=>setImmediate(r));
 assert.equal(icons.resolve(item)?.kind,'native-builtin-banner-gui',icons.reason(item));assert.equal(renders,1);icons.dispose();
});
