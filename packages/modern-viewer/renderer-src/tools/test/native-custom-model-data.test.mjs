import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {NativeAssetReader} from '../../src/native-viewer/model-loader.js'
import {parseNativeItemStack} from '../../src/native-viewer/native-item-stack.js'
import {nativeItemComponentState} from '../../src/native-viewer/native-static-item-providers.js'
import {resolveNativeItemAppearance,NATIVE_ITEM_APPEARANCE_CONTEXTS} from '../../src/native-viewer/native-item-appearance.js'
import {resolveNativeBlockItemModel} from '../../src/native-viewer/native-block-item-icons.js'
import {prepareNativeHeldItem} from '../../src/native-viewer/native-held-items.js'
import {pngRgba} from './fixtures/png-rgba.mjs'

const root=new URL('../../../asset-packs/vanilla-1.21.1/',import.meta.url)
const raw=components=>({name:'minecraft:iron_sword',count:1,snbt:`{id:"minecraft:iron_sword",count:1,components:{${components}}}`})
async function originalReader(){
 const manifest=JSON.parse(await fs.readFile(new URL('native-assets.json',root),'utf8'))
 return new NativeAssetReader(manifest,path=>fs.readFile(new URL(path,root)))
}
test('public RPG sword with CMD 731001 retains its original model, both hand transforms and complete stack',async()=>{
 const reader=await originalReader(),item=raw('"minecraft:custom_model_data":731001,"minecraft:damage":7,"minecraft:custom_name":"RPG Sword","minecraft:enchantments":{levels:{"minecraft:sharpness":3}}'),stack=parseNativeItemStack(item)
 for(const kind of NATIVE_ITEM_APPEARANCE_CONTEXTS){
  const selected=await resolveNativeItemAppearance(reader,stack,{kind})
  assert.equal(selected.stack,stack);assert.equal(selected.stack.components['minecraft:custom_model_data'],731001)
  assert.equal(selected.model.textures.layer0,'minecraft:item/iron_sword')
  assert(selected.sourcePaths.includes('assets/minecraft/models/item/handheld.json'))
  assert.equal(selected.requirements.propertyEvaluation,'custom_model_data_1_21_1')
 }
 for(const arm of ['left','right']){
  const plan=await prepareNativeHeldItem(reader,item,arm,{readPixels:async bytes=>pngRgba(bytes)})
  assert.equal(plan.kind,'native-generated-held');assert(plan.faces.length>0)
  assert.equal(plan.texturePath,'assets/minecraft/textures/item/iron_sword.png')
  assert.equal(plan.stack.components['minecraft:damage'],7)
 }
})
test('1.21.1 CMD default/removal and malformed components remain explicit',()=>{
 for(const value of ['', '"!minecraft:custom_model_data":{}'])assert.equal(nativeItemComponentState(parseNativeItemStack(raw(value))).customModelData,0)
 for(const value of [-2147483648,-1,0,731001,2147483647])assert.equal(nativeItemComponentState(parseNativeItemStack(raw(`"minecraft:custom_model_data":${value}`))).customModelData,value)
 for(const value of ['"bad"','{}','{type:"int",value:731001}','0.5d','2147483648'])assert.throws(()=>nativeItemComponentState(parseNativeItemStack(raw(`"minecraft:custom_model_data":${value}`))),/CUSTOM_MODEL_DATA_INVALID/)
 assert.throws(()=>nativeItemComponentState(parseNativeItemStack(raw('"minecraft:custom_model_data":1,"!minecraft:custom_model_data":{}'))),/COMPONENT_PATCH_INVALID/)
})
test('original override order resolves large CMD thresholds without widening unrelated properties',async()=>{
 const definitions={
  'assets/minecraft/models/item/test.json':{parent:'minecraft:item/generated',textures:{layer0:'minecraft:item/iron_sword'},overrides:[{predicate:{custom_model_data:731000},model:'minecraft:item/a'},{predicate:{custom_model_data:731001},model:'minecraft:item/b'}]},
  'assets/minecraft/models/item/a.json':{parent:'minecraft:item/test',textures:{layer0:'minecraft:item/golden_sword'}},
  'assets/minecraft/models/item/b.json':{parent:'minecraft:item/test',textures:{layer0:'minecraft:item/diamond_sword'}},
  'assets/minecraft/models/item/generated.json':{parent:'builtin/generated'}
 }
 const reader={json:async path=>{assert(definitions[path],path);return definitions[path]}}
 for(const [value,texture]of [[0,'iron_sword'],[731000,'golden_sword'],[731001,'diamond_sword'],[731002,'diamond_sword']]){
  const model=await resolveNativeBlockItemModel(reader,'minecraft:item/test',[],{properties:{custom_model_data:value}})
  assert.equal(model.textures.layer0,'minecraft:item/'+texture);assert.equal(model.nativeGenerated,true)
 }
 definitions['assets/minecraft/models/item/test.json'].overrides=[{predicate:{pull:731001},model:'minecraft:item/a'}]
 await assert.rejects(resolveNativeBlockItemModel(reader,'minecraft:item/test',[],{properties:{pull:731001}}),/PROPERTY_UNAVAILABLE/)
})
