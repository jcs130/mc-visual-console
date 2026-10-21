import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {NativeAssetReader} from '../../src/native-viewer/model-loader.js';
import {parseNativeItemStack} from '../../src/native-viewer/native-item-stack.js';
import {resolveNativeItemAppearance} from '../../src/native-viewer/native-item-appearance.js';
const root=new URL('../../../asset-packs/vanilla-1.21.1/',import.meta.url);
const reader=async()=>new NativeAssetReader(JSON.parse(await fs.readFile(new URL('native-assets.json',root))),path=>fs.readFile(new URL(path,root)));
test('untrimmed armor uses original locked item texture despite inactive trim overrides',async()=>{
  const assets=await reader();
  for(const name of ['iron_helmet','iron_boots','diamond_chestplate']){
    const stack=parseNativeItemStack({name:'minecraft:'+name,count:1,snbt:`{id:"minecraft:${name}",count:1,components:{"minecraft:damage":51}}`});
    const appearance=await resolveNativeItemAppearance(assets,stack,{kind:'gui'});
    assert.equal(appearance.model.textures.layer0,'minecraft:item/'+name);
    assert.equal(appearance.geometry,'generated');
  }
});
test('unknown armor trims stay explicit instead of showing an untrimmed replacement',async()=>{
  const stack=parseNativeItemStack({name:'minecraft:iron_helmet',count:1,snbt:'{id:"minecraft:iron_helmet",count:1,components:{"minecraft:trim":{material:"minecraft:gold",pattern:"minecraft:coast"}}}'});
  await assert.rejects(resolveNativeItemAppearance(await reader(),stack,{kind:'gui'}),/VISUAL_COMPONENT_UNSUPPORTED:minecraft:trim/);
});
