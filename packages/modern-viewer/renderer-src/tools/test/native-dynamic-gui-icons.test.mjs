import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {NativeAssetReader} from '../../src/native-viewer/model-loader.js';import {parseNativeItemStack} from '../../src/native-viewer/native-item-stack.js';
import {NativeItemIcons} from '../../src/native-viewer/native-item-icons.js';
import {resourcePath} from '../../src/native-viewer/model-loader.js';
import {nativeDynamicGuiState,prepareNativeDynamicGuiIcon,NativeCompassWobble} from '../../src/native-viewer/native-dynamic-gui-icons.js';
const directory=new URL('../../../asset-packs/vanilla-1.21.1/',import.meta.url);
const reader=async()=>new NativeAssetReader(JSON.parse(await fs.readFile(new URL('native-assets.json',directory),'utf8')),p=>fs.readFile(new URL(p,directory)));
const item=name=>({name:'minecraft:'+name,count:1,snbt:`{id:"minecraft:${name}",count:1}`});
const view=()=>({available:true,playerUuid:'own',self:{uuid:'own',entityId:42,usingItem:false,position:{x:0,y:64,z:0},yaw:0},time:{age:100},
  itemProperties:{source:'same_player_spawn_position',playerUuid:'own',entityId:42,dimension:'minecraft:overworld',spawn:{x:100,y:64,z:0}}});
test('every original compass predicate selects its exact texture, including both self-reference wrap frames',async()=>{
  const r=await reader();
  for(let i=0;i<32;i++){
    const prepared=await prepareNativeDynamicGuiIcon(r,{stack:parseNativeItemStack(item('compass')),properties:{angle:i/32}});
    const path=resourcePath(prepared.model.textures.layer0,'textures','.png');
    assert.equal(path,'assets/minecraft/textures/item/compass_'+String((i+16)%32).padStart(2,'0')+'.png');
    const bytes=await r.bytes(path);assert.equal(bytes[0],137);
  }
});
test('native compass wobble updates once per observed game tick and cannot invent absent spawn/context',()=>{
  const wobble=new NativeCompassWobble();assert.ok(Math.abs(wobble.update(1,.25)-.02)<1e-12);assert.ok(Math.abs(wobble.update(1,.8)-.02)<1e-12);
  const v=view(),stack=parseNativeItemStack(item('compass'));assert.ok(nativeDynamicGuiState(stack,v,wobble).variant.startsWith('frame-'));
  for(const mutate of [v=>delete v.itemProperties.spawn,v=>v.itemProperties.entityId=43,v=>v.itemProperties.dimension='minecraft:the_nether',v=>v.self.uuid='other']){
    const copy=view();mutate(copy);assert.throws(()=>nativeDynamicGuiState(stack,copy,wobble),/UNAVAILABLE/);
  }
});
test('inactive uncharged crossbow uses original standby texture; active, charged and custom models stay explicit',async()=>{
  const r=await reader(),v=view(),stack=parseNativeItemStack(item('crossbow')),state=nativeDynamicGuiState(stack,v,new NativeCompassWobble());
  assert.equal((await prepareNativeDynamicGuiIcon(r,state)).model.textures.layer0,'item/crossbow_standby');
  v.self.usingItem=true;assert.throws(()=>nativeDynamicGuiState(stack,v),/ACTIVE_USE_UNAVAILABLE/);v.self.usingItem=false;
  assert.throws(()=>nativeDynamicGuiState({...stack,components:{'minecraft:charged_projectiles':[]}},v),/VISUAL_COMPONENT_UNSUPPORTED/);
  assert.throws(()=>nativeDynamicGuiState({...stack,components:{'minecraft:custom_model_data':7}},v),/VISUAL_COMPONENT_UNSUPPORTED/);
});
test('actual GUI icon queue consumes same-body context and bounds compass cache by original frame rather than yaw floats',async()=>{
  const icons=new NativeItemIcons(await reader(),{createUrl:()=> 'blob:original',revokeUrl:()=>{}}),v=view();
  assert.equal(icons.resolve(item('crossbow')),null);icons.setContext(v);icons.resolve(item('crossbow'));icons.resolve(item('compass'));
  while(icons.active)await new Promise(r=>setTimeout(r,1));
  assert.equal(icons.reason(item('crossbow')),null);assert.equal(icons.reason(item('compass')),null);
  assert.match(icons.resolve(item('crossbow')).sourcePath,/crossbow_standby.png$/);
  assert.match(icons.resolve(item('compass')).sourcePath,/compass_\d\d.png$/);assert.equal(icons.entries.size,2);icons.dispose();
});
