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
import {EventEmitter} from 'node:events';
import {observeVanillaNativeStream} from '../../host/vanilla-native-stream.mjs';
import {NATIVE_BANNER_PATTERNS} from '../../src/native-viewer/native-banner-data.js';
import {observeVanillaBannerRegistry,vanillaBannerPatternsSnbt} from '../../host/vanilla-banner-components.mjs';
import {inspectNativeItemPng} from '../audit-native-item-gui.mjs';
import {createRequire} from 'node:module';
const root=new URL('../../../asset-packs/vanilla-1.21.1/',import.meta.url);
const reader=async()=>new NativeAssetReader(JSON.parse(await fs.readFile(new URL('native-assets.json',root),'utf8')),p=>fs.readFile(new URL(p,root)));
test('protocol-767 registry and SlotComponent binary round trips preserve the actual layers container through Prismarine Item',()=>{
 const require=createRequire(import.meta.url),mp=createRequire(require.resolve('mineflayer'))('minecraft-protocol');
 const registry=require('minecraft-data')('1.21.1'),Item=require('prismarine-item')('1.21.1');
 const bot={version:'1.21.1',registry,_client:new EventEmitter()},stream=observeVanillaNativeStream(bot,'a'.repeat(64));
 const config=mp.createSerializer({version:'1.21.1',state:'configuration',isServer:true}).proto;
 const packet={name:'registry_data',params:{id:'minecraft:banner_pattern',entries:[{key:'minecraft:creeper',value:{type:'compound',value:{asset_id:{type:'string',value:'minecraft:creeper'},translation_key:{type:'string',value:'block.minecraft.banner.creeper'}}}}]}};
 const received=config.parsePacketBuffer('packet',config.createPacketBuffer('packet',packet)).data;
 bot._client.emit(received.name,received.params);
 const play=mp.createSerializer({version:'1.21.1',state:'play',isServer:true}).proto;
 const patch={type:'banner_patterns',data:{layers:[{pattern:{patternId:0},colorId:15}]}};
 const decoded=play.parsePacketBuffer('SlotComponent',play.createPacketBuffer('SlotComponent',patch)).data;
 const item=Item.fromNotch({itemId:registry.itemsByName.brown_banner.id,itemCount:1,components:[decoded],removeComponents:[]});
 const projected=vanillaItemStack(item,registry);assert.equal(projected.reason,null);
 assert.deepEqual(parseNativeItemStack(projected.item).components['minecraft:banner_patterns'],[{pattern:'minecraft:creeper',color:'black'}]);stream.close();
});
test('an observed empty banner pattern patch retains complete SNBT instead of losing the inventory item',()=>{
 const wire=vanillaItemStack({name:'brown_banner',count:1,components:[{type:'banner_patterns',data:{layers:[]}}],removedComponents:[]});
 assert.equal(wire.reason,null);assert.deepEqual(parseNativeItemStack(wire.item).components['minecraft:banner_patterns'],[]);
});
test('received banner registry order resolves the actual holder and renders that exact pattern, never a guessed vanilla numeric ID',async()=>{
 const registry={},bot={version:'1.21.1',registry,_client:new EventEmitter()},stream=observeVanillaNativeStream(bot,'a'.repeat(64));
 const entry=name=>({key:'minecraft:'+name,value:{type:'compound',value:{asset_id:{type:'string',value:'minecraft:'+name},translation_key:{type:'string',value:'block.minecraft.banner.'+name}}}});
 bot._client.emit('registry_data',{id:'minecraft:banner_pattern',entries:[entry('stripe_top'),entry('creeper')]});
 const wire=vanillaItemStack({name:'brown_banner',count:1,components:[{type:'banner_patterns',data:{layers:[{pattern:{patternId:1},colorId:15}]}}],removedComponents:[]},registry);
 assert.equal(wire.reason,null);const stack=parseNativeItemStack(wire.item);
 assert.deepEqual(stack.components['minecraft:banner_patterns'],[{pattern:'minecraft:creeper',color:'black'}]);
 const plan=await prepareNativeBannerItem(await reader(),stack.id,stack);
 assert.ok(plan.sourcePaths.includes('assets/minecraft/textures/entity/banner/creeper.png'));
 assert.equal(plan.faces.filter(f=>f.renderOrder===2&&f.tintColor===0x1d1d21).length,6);
 stream.close();assert.equal(bot._client.listenerCount('registry_data'),0);
 assert.match(vanillaItemStack({name:'brown_banner',count:1,components:[{type:'banner_patterns',data:{layers:[{pattern:{patternId:1},colorId:15}]}}],removedComponents:[]},registry).reason,/UNAVAILABLE/);
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
 const wire=vanillaItemStack({name:'brown_banner',count:1,components:[{type:'banner_patterns',data:{layers:[{pattern:{patternId:1},colorId:0}]}}],removedComponents:[]});
 assert.match(wire.reason,/REGISTRY_UNAVAILABLE/);assert.equal(wire.item.snbt,undefined);
 const r=await reader(),raw={name:'minecraft:brown_banner',count:1,snbt:'{id:"minecraft:brown_banner",count:1,components:{"minecraft:banner_patterns":[{pattern:"unknown:pattern",color:"red"}]}}'};
 const icons=new NativeItemIcons(r);assert.match(icons.reason(raw),/BANNER_PATTERN_UNSUPPORTED/);icons.dispose();
 const plain=parseNativeItemStack({...raw,snbt:'{id:"minecraft:brown_banner",count:1}'});
 await assert.rejects(resolveNativeItemAppearance(r,plain,{kind:'thirdperson_righthand'}),/SPECIAL_MODEL_UNAVAILABLE/);
 const wrong={...r,manifest:{...r.manifest,clientJarSha256:'0'.repeat(64)}};
 await assert.rejects(prepareNativeBannerItem(wrong,'minecraft:brown_banner'),/CLIENT_UNVERIFIED/);
});
test('all 43 original pattern assets load with their exact colored layer and native first-sixteen rendering cap',async()=>{
 const r=await reader();
 for(const name of NATIVE_BANNER_PATTERNS){
  const row={pattern:'minecraft:'+name,color:'red'},plan=await prepareNativeBannerItem(r,'minecraft:white_banner',{components:{'minecraft:banner_patterns':[row]}});
  const path='assets/minecraft/textures/entity/banner/'+name+'.png',decoded=inspectNativeItemPng(await r.bytes(path));
  assert.deepEqual([decoded.width,decoded.height],[64,64]);assert.equal(decoded.maxAlpha,1,name);
  assert.equal(plan.faces.filter(f=>f.renderOrder===2&&f.tintColor===NATIVE_BANNER_COLORS.red).length,6);
  const textures=new Map(plan.texturePaths.map(path=>[path,new THREE.Texture({width:64,height:64})])),object=buildNativeBlockItemObject(plan,textures);
  const overlay=object.children.find(m=>m.renderOrder===2);assert.equal(overlay.material.transparent,true);assert.equal(overlay.material.side,THREE.DoubleSide);
  disposeNativeBlockItemObject(object);for(const texture of textures.values())texture.dispose();
 }
 const layers=Array.from({length:20},(_,i)=>({pattern:'minecraft:'+NATIVE_BANNER_PATTERNS[i],color:i%2?'white':'black'}));
 const plan=await prepareNativeBannerItem(r,'minecraft:brown_banner',{components:{'minecraft:banner_patterns':layers}});
 assert.equal(Math.max(...plan.faces.map(f=>f.renderOrder??0)),17);assert.equal(layers.length,20);
});
test('server registry overrides, duplicate keys, foreign registries, invalid colors and excessive layers cannot borrow a plain icon',()=>{
 const registry={},entry={key:'minecraft:creeper',value:{type:'compound',value:{asset_id:{type:'string',value:'minecraft:skull'},translation_key:{type:'string',value:'block.minecraft.banner.creeper'}}}};
 observeVanillaBannerRegistry(registry,{id:'minecraft:banner_pattern',entries:[entry]});
 const row={pattern:{patternId:0},colorId:0};assert.throws(()=>vanillaBannerPatternsSnbt([row],registry),/UNAVAILABLE/);
 assert.throws(()=>vanillaBannerPatternsSnbt([{...row,colorId:16}],registry),/INVALID/);
 assert.throws(()=>vanillaBannerPatternsSnbt(Array(65).fill(row),registry),/INVALID/);
 assert.throws(()=>vanillaBannerPatternsSnbt([row],{}),/UNAVAILABLE/);
 const inline={pattern:{data:{assetId:'minecraft:creeper',translationKey:'block.minecraft.banner.creeper'}},colorId:1};
 assert.match(vanillaBannerPatternsSnbt([inline],registry),/asset_id:"minecraft:creeper"/);
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
