import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as THREE from 'three'
import {NativeAssetReader} from '../../src/native-viewer/model-loader.js'
import {nativeEntityRenderState,nativeEntityModelDefinition,nativeSheepColor,createNativeEntityActor,NATIVE_ENTITY_RENDER_TYPES} from '../../src/native-viewer/native-entity-dispatch.js'
import {createNativeEntityMotion} from '../../src/native-viewer/native-entity-motion.js'
const entity=(name='minecraft:pig',metadata=[])=>{const e={entityId:12,uuid:'12345678-1234-5678-1234-567812345678',name,position:{x:10,y:64,z:12},yaw:0,pitch:0,headYaw:0,spawnedAt:1000,metadata,equipment:[],cues:[]};e.motion=createNativeEntityMotion(e)?.current();return e}

test('matched SynchedEntityData defaults are explicit and wrong serializer/value has no fallback',()=>{
  assert.equal(nativeEntityRenderState(entity()).baby,false)
  assert.equal(nativeEntityRenderState(entity('minecraft:slime')).size,1)
  assert.equal(nativeEntityRenderState(entity('minecraft:sheep',[{key:17,type:'byte',value:30}])).color,14)
  assert.equal(nativeEntityRenderState(entity('minecraft:sheep',[{key:17,type:'byte',value:30}])).sheared,true)
  assert.throws(()=>nativeEntityRenderState(entity('minecraft:pig',[{key:16,type:'int',value:0}])),/SERIALIZER/)
  assert.throws(()=>nativeEntityRenderState(entity('minecraft:slime',[{key:16,type:'int',value:0}])),/SIZE/)
  assert.throws(()=>nativeEntityRenderState(entity('mod:unknown')),/UNSUPPORTED/)
})

test('nondefault village type/profession are resolved only from actual native registries',()=>{
  const e=entity('minecraft:villager',[{key:18,type:'villager_data',value:{villagerType:50,villagerProfession:90,level:3}}])
  assert.throws(()=>nativeEntityRenderState(e),/REGISTRY_UNAVAILABLE/)
  const registries={source:'server_builtin_registries',villagerTypes:[{id:50,name:'minecraft:plains'}],villagerProfessions:[{id:90,name:'minecraft:farmer'}]}
  assert.deepEqual(nativeEntityRenderState(e,{registries}).villager,{type:'minecraft:plains',profession:'minecraft:farmer',level:3})
  assert.deepEqual(nativeEntityRenderState(entity('minecraft:villager')).villager,{type:'minecraft:plains',profession:'minecraft:none',level:1})
})

test('special poses, unknown equipment and jeb sheep effects fail explicitly',()=>{
  assert.throws(()=>nativeEntityRenderState(entity('minecraft:pig',[{key:6,type:'pose',value:2}])),/POSE_UNSUPPORTED/)
  assert.throws(()=>nativeEntityRenderState({...entity(),equipment:[{slot:0,item:{itemCount:1,itemId:9001}}]}),/EQUIPMENT_RENDERING_UNSUPPORTED/)
  assert.throws(()=>nativeEntityRenderState(entity('minecraft:sheep',[{key:2,type:'optional_component',value:{text:'jeb_'}}])),/CUSTOM_NAME_EFFECT_UNSUPPORTED/)
})

test('original cow horns, pig snout/saddle dilation, chicken beak and villager nose are actual model parts',()=>{
  assert.equal(nativeEntityModelDefinition('minecraft:cow').parts[0].cubes.length,3)
  assert.deepEqual(nativeEntityModelDefinition('minecraft:pig').parts[0].cubes[1].origin,[-2,0,-9])
  assert.equal(nativeEntityModelDefinition('minecraft:pig','saddle').parts[0].cubes[1].dilation,.5)
  assert.deepEqual(nativeEntityModelDefinition('minecraft:chicken').parts.find(p=>p.name==='beak').cubes[0].size,[4,2,2])
  assert.equal(nativeEntityModelDefinition('minecraft:villager').parts.find(p=>p.name==='nose').parent,'head')
  assert.deepEqual(nativeSheepColor(0),[230/255,230/255,230/255])
  // Locked DyeColor.RED textureDiffuseColor 11546150 (0xb02e26),
  // Sheep.getColor applies floor(channel * 0.75f) -> 132, 34, 28.
  assert.deepEqual(nativeSheepColor(14),[132/255,34/255,28/255])
})

test('all six locked mobs build with original manifest-verified assets and real variants',{skip:!process.env.NATIVE_ENTITY_ASSET_DIR},async()=>{
  const directory=process.env.NATIVE_ENTITY_ASSET_DIR,manifest=JSON.parse(await fs.readFile(path.join(directory,'native-assets.json'),'utf8'))
  const reader=new NativeAssetReader(manifest,filename=>fs.readFile(path.join(directory,filename)))
  const decode=async bytes=>{const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);return new THREE.Texture({width:view.getUint32(16),height:view.getUint32(20)})}
  for(const name of NATIVE_ENTITY_RENDER_TYPES.filter(name=>name.startsWith('minecraft:'))){
    const e=entity(name),actor=await createNativeEntityActor(reader,e,{loadTexture:decode})
    assert.equal(actor.assetInfo.type,name)
    assert.equal(actor.root.visible,true)
    assert.ok(actor.assetInfo.sourcePaths.every(filename=>manifest.assets[filename]))
    actor.update(e,1000);assert.deepEqual(actor.root.position.toArray(),[10,64,12])
    assert.throws(()=>actor.update({...e,uuid:'00000000-0000-0000-0000-000000000000'},1000),/IDENTITY_MISMATCH/)
    assert.throws(()=>actor.update({...e,motion:{...e.motion,position:{x:10,y:NaN,z:12}}},1000),/MOTION_UNAVAILABLE/)
    assert.throws(()=>actor.update({...e,motion:{...e.motion,tickMs:100}},1000),/MOTION_UNAVAILABLE/)
    actor.dispose();actor.dispose();assert.equal(actor.root.children.length,0)
  }
})

test('real villager profession, biome hat metadata and earned level use the original distinct layers',{skip:!process.env.NATIVE_ENTITY_ASSET_DIR},async()=>{
  const directory=process.env.NATIVE_ENTITY_ASSET_DIR,manifest=JSON.parse(await fs.readFile(path.join(directory,'native-assets.json'),'utf8'))
  const reader=new NativeAssetReader(manifest,filename=>fs.readFile(path.join(directory,filename)))
  const decode=async bytes=>{const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);return new THREE.Texture({width:view.getUint32(16),height:view.getUint32(20)})}
  const registries={source:'server_builtin_registries',villagerTypes:[{id:7,name:'minecraft:plains'}],villagerProfessions:[{id:20,name:'minecraft:farmer'}]}
  const adult=entity('minecraft:villager',[{key:18,type:'villager_data',value:{villagerType:7,villagerProfession:20,level:3}}])
  const actor=await createNativeEntityActor(reader,adult,{registries,loadTexture:decode})
  assert.ok(actor.assetInfo.sourcePaths.includes('assets/minecraft/textures/entity/villager/profession/farmer.png'))
  assert.ok(actor.assetInfo.sourcePaths.includes('assets/minecraft/textures/entity/villager/profession/farmer.png.mcmeta'))
  assert.ok(actor.assetInfo.sourcePaths.includes('assets/minecraft/textures/entity/villager/profession_level/gold.png'))
  const orientations=actor.root.children[0].children[0].children
  assert.equal(orientations[1].getObjectByName('head').visible,false,'the farmer full hat hides the biome layer head as original VillagerProfessionLayer')
  assert.equal(orientations[0].getObjectByName('head').visible,true,'base skin remains visible')
  const baby={...adult,metadata:[...adult.metadata,{key:16,type:'boolean',value:true}]}
  assert.throws(()=>actor.update(baby,1000),/RENDER_VARIANT_CHANGED/)
  actor.dispose()
  const babyActor=await createNativeEntityActor(reader,baby,{registries,loadTexture:decode})
  assert.ok(!babyActor.assetInfo.sourcePaths.some(filename=>filename.includes('/profession/')&&!filename.endsWith('.mcmeta')))
  assert.ok(!babyActor.assetInfo.sourcePaths.some(filename=>filename.includes('/profession_level/')))
  babyActor.dispose()
})
