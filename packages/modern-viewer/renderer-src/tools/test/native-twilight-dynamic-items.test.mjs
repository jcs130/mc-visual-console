import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {parseNativeItemStack,nativeLongValue} from '../../src/native-viewer/native-item-stack.js'
import {nativeTwilightOreMeterState,prepareNativeTwilightOreMeter,heldTwilightOreMeter,twilightOreMeterLines,twilightOreRatioText} from '../../src/native-viewer/native-twilight-ore-meter.js'
import {nativeTwilightTravellerState,twilightTravellerContext,prepareNativeTwilightTraveller} from '../../src/native-viewer/native-twilight-travellers.js'
import {resolveNativeItemAppearance} from '../../src/native-viewer/native-item-appearance.js'
import {renderNativeGeneratedLayers} from '../../src/native-viewer/native-generated-icon-layers.js'
import {NativeAssetReader} from '../../src/native-viewer/model-loader.js'
import {nativeTwilightJarState,prepareNativeTwilightJar} from '../../src/native-viewer/native-twilight-jars.js'

const uuid='12345678-1234-4234-8234-123456789abc',sha='a'.repeat(64)
const item=(leaf,components='')=>({name:'twilightforest:'+leaf,count:1,snbt:`{id:"twilightforest:${leaf}",count:1,components:{${components}}}`})
const stack=(leaf,components)=>parseNativeItemStack(item(leaf,components))
const definitions=[{id:0,key:'twilightforest:water_walk',value:{type:'twilightforest:component',component:{'twilightforest:water_walk':{}}}},
 {id:1,key:'twilightforest:step_up',value:{type:'twilightforest:attribute',component:'twilightforest:high_step',builtin_modifier:1}},
 {id:2,key:'twilightforest:red_thread_vision',value:{type:'twilightforest:component',component:{'twilightforest:red_thread_vision':{}}}},
 {id:3,key:'twilightforest:swap_hotbar',value:{type:'twilightforest:transferable_component',component:'twilightforest:swap_hotbar_modifier',transferable_components:{'minecraft:container':[]}}}]
const view={available:true,playerUuid:uuid,twilightTravellerRegistry:{available:true,playerUuid:uuid,registry:'twilight:travellers_modifiers',source:'same_connection_configuration_registry_data',sha256:sha,entries:definitions}}
const context=()=>twilightTravellerContext(view)

test('real ore description keys, full long identifiers and signed absolute chunk bounds survive',()=>{
  const s=stack('ore_meter','"twilightforest:ore_range":2,"twilightforest:ore_data":{counts:{"block.minecraft.iron_ore":7,"block.minecraft.diamond_ore":2},scanned_chunk:-12884901890L,scanned_block_count:1000,universal_id:9223372036854775807L}')
  const result=nativeTwilightOreMeterState(s)
  assert.deepEqual(result.scan.chunk,{x:-2,z:-4});assert.deepEqual(result.scan.blockBounds,{minX:-64,maxX:15,minZ:-96,maxZ:-17})
  assert.equal(result.scan.identifier,'9223372036854775807');assert.equal(result.scan.counts[0].translationKey,'block.minecraft.diamond_ore')
  assert.equal(result.scan.individualOrePositionsAvailable,false);assert.equal(result.active,true)
  assert.equal(twilightOreRatioText(.0625),'0.062');assert.equal(twilightOreRatioText(.1875),'0.188')
  assert.equal(nativeLongValue({type:'long',value:'1'}),null)
  assert.throws(()=>nativeTwilightOreMeterState(stack('ore_meter','"twilightforest:ore_loading":-1')),/COMPONENT_INVALID/)
  assert.throws(()=>nativeTwilightOreMeterState(stack('ore_meter','"twilightforest:ore_data":{counts:{},scanned_chunk:{type:"long",value:"2"},scanned_block_count:1,universal_id:1L}')),/COMPONENT_INVALID/)
})
test('ore loading icon and dots use received progress, and only this account held meter produces overlay',()=>{
  const s=stack('ore_meter','"twilightforest:ore_loading":3')
  assert.equal(nativeTwilightOreMeterState(s,{random:()=>0}).active,true)
  assert.equal(nativeTwilightOreMeterState(s,{random:()=>.99}).active,true)
  assert.equal(nativeTwilightOreMeterState(stack('ore_meter','"twilightforest:ore_loading":2'),{random:()=>.99}).active,false)
  assert.equal(nativeTwilightOreMeterState(stack('ore_meter','"twilightforest:ore_loading":73'),{random:()=>0}).active,false)
  const v={available:true,playerUuid:uuid,inventory:{playerUuid:uuid,hotbarStart:36,selectedHotbarSlot:0,offhandSlot:45,slots:[{slot:36,item:item('ore_meter','"twilightforest:ore_loading":11')}]}}
  const state=heldTwilightOreMeter(v);assert.equal(state.dots,3)
  assert.deepEqual(twilightOreMeterLines(state,()=> '正在扫描'),['正在扫描...'])
  assert.equal(heldTwilightOreMeter({...v,playerUuid:'other'}),null)
  assert.equal(heldTwilightOreMeter({...v,inventory:{...v.inventory,selectedHotbarSlot:1}}),null)
})
test('traveller predicates use observed order, marker presence, builtin exclusion and component removal',()=>{
  const s=stack('travellers_boots','"twilightforest:red_thread_vision":{},"twilightforest:water_walk":{},"minecraft:damage":155')
  const result=nativeTwilightTravellerState(s,context())
  assert.equal(result.broken,true);assert.deepEqual(result.modifiers,['twilightforest:water_walk','twilightforest:red_thread_vision'])
  assert.deepEqual(nativeTwilightTravellerState(stack('travellers_boots','"!twilightforest:travellers_armor":{},"minecraft:damage":155'),context()).broken,false)
  assert.equal(nativeTwilightTravellerState(stack('travellers_boots','"minecraft:unbreakable":{},"minecraft:damage":155'),context()).broken,false)
  assert.equal(nativeTwilightTravellerState(stack('travellers_boots','"minecraft:max_damage":200,"minecraft:damage":155'),context()).broken,false)
  assert.equal(nativeTwilightTravellerState(stack('travellers_boots','"minecraft:max_damage":1,"!minecraft:damage":{}'),context()).broken,false)
  assert.throws(()=>nativeTwilightTravellerState(s,null),/REGISTRY_UNAVAILABLE/)
  assert.throws(()=>nativeTwilightTravellerState(s,{...context(),playerUuid:'different'}),/REGISTRY_UNAVAILABLE/)
  assert.equal(twilightTravellerContext({...view,playerUuid:'different'}),null)
  assert.throws(()=>nativeTwilightTravellerState(stack('travellers_boots','"twilightforest:new_unknown_visual":{}'),context()),/VISUAL_COMPONENT_UNSUPPORTED/)
  assert.deepEqual(nativeTwilightTravellerState(stack('travellers_wings','"twilightforest:swap_hotbar_modifier":{}'),context()).modifiers,[])
  assert.deepEqual(nativeTwilightTravellerState(stack('travellers_wings','"twilightforest:swap_hotbar_modifier":{},"minecraft:container":[]'),context()).modifiers,['twilightforest:swap_hotbar'])
})
test('jar lids follow original default rules; copyOne reads only slot zero and preserves nested typed components',()=>{
  assert.equal(nativeTwilightJarState(stack('mason_jar')).lid,'twilightforest:twilight_oak_log')
  assert.equal(nativeTwilightJarState(stack('mason_jar','"twilightforest:jar_lid":{lid:"minecraft:mangrove_log"}')).lidModel,'twilightforest:block/lid/vanilla_mangrove_log')
  assert.equal(nativeTwilightJarState(stack('mason_jar','"twilightforest:jar_lid":{lid:"minecraft:diamond"}')).lid,'twilightforest:twilight_oak_log')
  assert.equal(nativeTwilightJarState(stack('mason_jar','"minecraft:container":[{slot:2,item:{id:"minecraft:diamond",count:3}}]')).content,null)
  const state=nativeTwilightJarState(stack('mason_jar','"minecraft:container":[{slot:0,item:{id:"twilightforest:glass_sword",count:1,components:{"twilightforest:sidestep_cooldown":9223372036854775807L}}}]'))
  assert.equal(state.content.id,'twilightforest:glass_sword');assert.equal(nativeLongValue(state.content.components['twilightforest:sidestep_cooldown']),9223372036854775807n)
  assert.throws(()=>nativeTwilightJarState(stack('mason_jar','"minecraft:container":[{slot:0,item:{id:"minecraft:diamond",count:1}},{slot:0,item:{id:"minecraft:stick",count:2}}]')),/CONTAINER/)
  assert.throws(()=>nativeTwilightJarState(stack('mason_jar','"minecraft:container":[{slot:0,item:{id:"twilightforest:mason_jar",count:1}}]')),/RECURSION/)
})
const root=process.env.TWILIGHT_NATIVE_ASSETS
test('original traveller layer selection and meter overrides load verified assets through shared appearance API',{skip:!root},async()=>{
  const manifest=JSON.parse(await fs.readFile(path.join(root,'native-assets.json'))),reader=new NativeAssetReader(manifest,p=>fs.readFile(path.join(root,p)))
  const c=context(),s=stack('travellers_boots','"twilightforest:water_walk":{},"minecraft:damage":155'),prepared=await prepareNativeTwilightTraveller(reader,s,c)
  assert.equal(prepared.model.textures.layer0,'twilightforest:item/travellers_boots_broken')
  assert.equal(prepared.model.textures.layer1,'twilightforest:item/travellers_modifiers/boots/broken/water_walk')
  const appearance=await resolveNativeItemAppearance(reader,s,{kind:'gui',observed:c})
  assert.equal(appearance.geometry,'generated');assert.equal(appearance.family,'twilight-traveller')
  const rendered=await renderNativeGeneratedLayers(reader,prepared.model),svg=await rendered.blob.text()
  assert(svg.includes('scale(1.0010000467300415)'));assert.equal(rendered.pixelParityVerified,false)
  const normal=await prepareNativeTwilightOreMeter(reader,stack('ore_meter'),{active:false}),active=await prepareNativeTwilightOreMeter(reader,stack('ore_meter'),{active:true})
  assert(normal.model.sourcePaths.some(p=>p.endsWith('/ore_meter.json')))
  assert(active.model.sourcePaths.some(p=>p.endsWith('/ore_meter_active.json')))
})
test('jar GUI uses original block body, selected original lid and original ISTER item transform',{skip:!root},async()=>{
  const manifest=JSON.parse(await fs.readFile(path.join(root,'native-assets.json'))),reader=new NativeAssetReader(manifest,p=>fs.readFile(path.join(root,p)))
  const plan=await prepareNativeTwilightJar(reader,stack('mason_jar','"twilightforest:jar_lid":{lid:"minecraft:oak_log"}'))
  assert.equal(plan.model.elements.length,6);assert.equal(plan.faces.length,24)
  assert.deepEqual(plan.model.elements[0].from,[3,0,3]);assert.deepEqual(plan.model.elements[0].to,[13,14,13])
  assert.deepEqual(plan.transform.rotation,[30,225,0]);assert.deepEqual(plan.transform.scale,[.625,.625,.625])
  assert(plan.texturePaths.some(p=>p.endsWith('/oak_log.png')));assert(plan.texturePaths.some(p=>p.endsWith('/jar_side.png')))
  assert(!plan.texturePaths.some(p=>p.endsWith('/player_head.png')))
})

