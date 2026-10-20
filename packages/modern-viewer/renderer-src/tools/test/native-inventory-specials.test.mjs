import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {NativeAssetReader} from '../../src/native-viewer/model-loader.js';
import {NativeItemIcons} from '../../src/native-viewer/native-item-icons.js';
import {parseNativeItemStack} from '../../src/native-viewer/native-item-stack.js';
import {resolveNativeItemAppearance} from '../../src/native-viewer/native-item-appearance.js';
import {NativeCompassWobble,nativeDynamicGuiState,prepareNativeDynamicGuiIcon} from '../../src/native-viewer/native-dynamic-gui-icons.js';
const root=new URL('../../../asset-packs/vanilla-1.21.1/',import.meta.url);
const reader=async()=>new NativeAssetReader(JSON.parse(await fs.readFile(new URL('native-assets.json',root),'utf8')),p=>fs.readFile(new URL(p,root)));
const item=(name,components='')=>({name:'minecraft:'+name,count:1,snbt:`{id:"minecraft:${name}",count:1${components?',components:{'+components+'}':''}}`});
const view=()=>({available:true,playerUuid:'own',self:{uuid:'own',entityId:42,usingItem:false,position:{x:10.5,y:64,z:20.5},yaw:0},time:{age:100},
 itemProperties:{source:'same_player_spawn_position',playerUuid:'own',entityId:42,dimension:'minecraft:overworld',spawn:{x:10,y:64,z:20}}});
const settle=async icons=>{while(icons.active||icons.queue.length)await new Promise(r=>setImmediate(r));};

test('ordinary and enchanted named tridents use the original GUI trident sprite and retain glint/stack identity',async()=>{
 const r=await reader(),icons=new NativeItemIcons(r,{createUrl:()=> 'blob:original-trident',revokeUrl:()=>{}});
 for(const components of ['', '"minecraft:custom_name":"§b海渊之矛","minecraft:custom_data":{marker:1},"minecraft:enchantments":{levels:{"minecraft:loyalty":3}}']){
  const stack=item('trident',components),before=structuredClone(stack);
  icons.resolve(stack);await settle(icons);const icon=icons.resolve(stack);
  assert.equal(icon?.verified,true,icons.reason(stack));assert.equal(icon.sourcePath,'assets/minecraft/textures/item/trident.png');
  assert.equal(icon.providerEvidence.itemClass,'net.minecraft.world.item.TridentItem');
  if(components)assert.equal(icon.glint?.available,true,'the actual enchanted GUI stack keeps its glint');
  assert.deepEqual(stack,before);
 }
 const stack=parseNativeItemStack(item('trident'));
 await assert.rejects(resolveNativeItemAppearance(r,stack,{kind:'thirdperson_righthand'}),/SPECIAL_MODEL_UNAVAILABLE/,'GUI sprite must not replace the native 3D hand model');
 icons.dispose();
});

test('compass target distance uses the full original block center, not only its X/Z projection',()=>{
 const v=view(),stack=parseNativeItemStack(item('compass'));
 const state=nativeDynamicGuiState(stack,v,new NativeCompassWobble({random:()=>.25}));
 assert.equal(state.mode,'target');assert.ok(state.variant.startsWith('frame-'));
 v.self.position.y=64.5;
 const spinning=nativeDynamicGuiState(stack,v,new NativeCompassWobble({random:()=>.25}));
 assert.equal(spinning.mode,'random');assert.ok(Number.isFinite(spinning.properties.angle));
});

test('real random-spin conditions keep an original icon and use a separate once-per-tick wobble',async()=>{
 const v=view(),stack=parseNativeItemStack(item('compass'));v.self.position.y=64.5;
 let draws=0;const wobble=new NativeCompassWobble({random:()=>{draws++;return .25;}});
 const first=nativeDynamicGuiState(stack,v,wobble),again=nativeDynamicGuiState(stack,v,wobble);
 assert.equal(first.mode,'random');assert.deepEqual(first,again);assert.equal(draws,1);
 v.time.age++;assert.equal(nativeDynamicGuiState(stack,v,wobble).mode,'random');assert.equal(draws,2);
 const nether=view();nether.itemProperties.dimension='minecraft:the_nether';delete nether.itemProperties.spawn;
 assert.equal(nativeDynamicGuiState(stack,nether,wobble).mode,'random','the received non-natural dimension is an original random-spin condition');
 const r=await reader(),plan=await prepareNativeDynamicGuiIcon(r,first);
 assert.match(plan.model.textures.layer0,/compass_\d\d$/);
});

test('all current GUI consumers keep compass icons at and vertically above spawn without unbounded frame caches',async()=>{
 const icons=new NativeItemIcons(await reader(),{createUrl:()=> 'blob:original-compass',revokeUrl:()=>{}}),v=view(),stack=item('compass','"minecraft:custom_name":"§d技能罗盘"');
 for(let i=0;i<96;i++){
  v.time.age++;v.self.position.y=i%2?64.5:64;icons.setContext(v);icons.resolve(stack);await settle(icons);
  assert.equal(icons.resolve(stack)?.verified,true,icons.reason(stack));assert.match(icons.resolve(stack).sourcePath,/compass_\d\d\.png$/);
  assert.ok(icons.entries.size<=32,'one full stack has only the original 32 compass texture variants');
 }
 icons.dispose();
});
