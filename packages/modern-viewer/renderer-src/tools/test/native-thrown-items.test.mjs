import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
import * as THREE from 'three'
import {NativeAssetReader} from '../../src/native-viewer/model-loader.js'
import {parseNativeItemStack} from '../../src/native-viewer/native-item-stack.js'
import {prepareNativeHeldItem,buildNativeHeldItemObject,disposeNativeHeldItemObject,nativeGeneratedItemElements} from '../../src/native-viewer/native-held-items.js'
import {loadOriginalItemColors,nativePotionColor,ORIGINAL_ITEM_COLORS_PATH} from '../../src/native-viewer/native-potion-items.js'
import {NATIVE_THROWN_ITEM_DEFINITIONS,NATIVE_THROWN_ITEM_TYPES,nativeThrownItemState} from '../../src/native-viewer/native-thrown-item-state.js'
import {createNativeThrownItemActor} from '../../src/native-viewer/native-thrown-items.js'
import {createNativeEntityMotion} from '../../src/native-viewer/native-entity-motion.js'
import {configureVanillaItemRegistries,vanillaItemStack} from '../../host/vanilla-item-stack.mjs'
import {pngRgba} from './fixtures/png-rgba.mjs'

const directory=new URL('../../../asset-packs/vanilla-1.21.1/',import.meta.url)
const manifest=JSON.parse(await fs.readFile(new URL('native-assets.json',directory),'utf8'))
const reader=new NativeAssetReader(manifest,p=>fs.readFile(new URL(p,directory)))
const colors=await loadOriginalItemColors(reader)
const require=createRequire(import.meta.url),registry=require('minecraft-data')('1.21.1')
const pixels=async bytes=>pngRgba(bytes)
const texture=async bytes=>{const p=pngRgba(bytes);return new THREE.Texture({width:p.width,height:p.height})}
const entity=name=>({name,entityId:7,uuid:'12345678-1234-5678-1234-567812345678',spawnedAt:1000,position:{x:1,y:64,z:3},yaw:45,pitch:20,metadata:[],equipment:[]})
configureVanillaItemRegistries(registry,colors)

test('all original potion and effect registrations reproduce original PotionContents colors',()=>{
  assert.equal(colors.effects.length,39);assert.equal(colors.potions.length,46);assert.equal(colors.items.length,1333)
  for(const potion of colors.potions)assert.equal(nativePotionColor({potion:potion.name},colors),potion.color>>>0,potion.name)
  assert.equal(nativePotionColor(undefined,colors),0xff385dc6)
  assert.equal(nativePotionColor({custom_color:0},colors),0xff000000)
  assert.equal(nativePotionColor({custom_color:-1},colors),0xffffffff)
  const red={name:'test:red',color:0xff0000},blue={name:'test:blue',color:0x0000ff}
  const data={...colors,effects:[red,blue]}
  assert.equal(nativePotionColor({custom_effects:[{id:'test:red',amplifier:2},{id:'test:blue',amplifier:0}]},data),0xffbf003f)
  assert.equal(nativePotionColor({custom_effects:[{id:'test:red',show_particles:0}]},data),0xff385dc6)
  assert.throws(()=>nativePotionColor({potion:'test:unknown'},colors),/REGISTRY_UNAVAILABLE/)
  assert.throws(()=>nativePotionColor({custom_effects:[{id:'test:unknown'}]},colors),/EFFECT_REGISTRY_UNAVAILABLE/)
})

test('wire potion codec preserves real registry IDs, signed colors and complete nested effect details',()=>{
  const effect=colors.effects[0],potion=colors.potions.find(row=>row.name==='minecraft:swiftness')
  const detail={amplifier:2,duration:-1,ambient:false,showParticles:false,showIcon:true,hiddenEffect:{amplifier:1,duration:40,ambient:true,showParticles:true,showIcon:false,hiddenEffect:null}}
  const value=vanillaItemStack({name:'lingering_potion',count:1,components:[{type:'potion_contents',data:{potionId:potion.id,customColor:-1,customEffects:[{id:effect.id,details:detail}]}}],removedComponents:[]},registry)
  assert.equal(value.reason,null)
  const stack=parseNativeItemStack(value.item),component=stack.components['minecraft:potion_contents']
  assert.equal(component.potion,'minecraft:swiftness');assert.equal(component.custom_color,-1)
  assert.equal(component.custom_effects[0].hidden_effect.duration,40)
  assert.equal(nativePotionColor(component,colors),0xffffffff)
  const Item=require('prismarine-item')(registry),decoded=Item.fromNotch({itemId:registry.itemsByName.lingering_potion.id,itemCount:1,
    components:[{type:'potion_contents',data:{potionId:potion.id,customColor:0,customEffects:[{id:effect.id,details:detail}]}}],removeComponents:[]})
  const actual=vanillaItemStack(decoded,registry)
  assert.equal(actual.reason,null);assert.equal(nativePotionColor(parseNativeItemStack(actual.item).components['minecraft:potion_contents'],colors),0xff000000)
  assert.throws(()=>configureVanillaItemRegistries({...registry,items:{}},colors),/REGISTRY_MISMATCH/)
})

test('all eight original thrown item types distinguish defaults, received replacements, empty and malformed Slots',()=>{
  assert.equal(NATIVE_THROWN_ITEM_TYPES.length,8)
  for(const name of NATIVE_THROWN_ITEM_TYPES){
    const e=entity(name),state=nativeThrownItemState(e)
    assert.equal(state.item.name,NATIVE_THROWN_ITEM_DEFINITIONS[name].item);assert.equal(state.source,'original_1.21.1_entity_constructor')
    e.metadata=[{key:8,type:'item_stack',value:{itemCount:0}}]
    assert.equal(nativeThrownItemState(e,()=>assert.fail('empty Slot must not resolve to a default')).empty,true)
    e.metadata=[{key:8,type:'string',value:'not a Slot'}]
    assert.equal(nativeThrownItemState(e).available,false)
  }
  const e=entity('minecraft:potion');e.metadata=[{key:8,type:7,value:{itemId:1161,itemCount:1,components:[],removeComponents:[]}}]
  const result=nativeThrownItemState(e,wire=>({available:true,source:'same_player_vanilla_item_registry',minecraftVersion:'1.21.1',item:{name:registry.items[wire.itemId].name}}))
  assert.equal(result.item.name,'lingering_potion')
})

test('all eight actors use original GROUND item geometry, original constructor scales and camera orientation',async()=>{
  for(const name of NATIVE_THROWN_ITEM_TYPES){
    const e=entity(name);e.itemState=nativeThrownItemState(e)
    const motion=createNativeEntityMotion(e);e.motion=motion.current()
    const actor=await createNativeThrownItemActor(reader,e,{loadTexture:texture,readPixels:pixels})
    assert.equal(actor.assetInfo.constructorScale,NATIVE_THROWN_ITEM_DEFINITIONS[name].scale)
    assert.equal(actor.assetInfo.fullBrightBlockLight,NATIVE_THROWN_ITEM_DEFINITIONS[name].fullBright)
    assert.equal(actor.root.visible,false,'first two ticks near the actual camera entity are hidden')
    actor.update(e,1000,{self:{position:{x:10,y:64,z:3}}});assert.equal(actor.root.visible,true)
    actor.update(e,1000,{self:{position:e.position}});assert.equal(actor.root.visible,false)
    e.motion=motion.tick(e,1050);e.motion=motion.tick(e,1100)
    actor.update(e,1100,{self:{position:e.position}});assert.equal(actor.root.visible,true)
    assert.equal(e.motion.walk,undefined,'thrown items use received projectile motion, not living walk interpolation')
    const camera=new THREE.PerspectiveCamera();camera.rotation.set(.2,-.5,.1)
    let mesh;actor.root.traverse(part=>{if(part.isMesh&&!mesh)mesh=part})
    assert(mesh);mesh.onBeforeRender(null,null,camera)
    assert(actor.root.children[0].quaternion.angleTo(camera.quaternion)<1e-7)
    const previous=actor.root.children[0].rotation.clone();e.yaw=130;actor.update(e,1100)
    assert.deepEqual(actor.root.children[0].rotation.toArray(),previous.toArray(),'received projectile yaw does not rotate its billboard')
    actor.dispose();assert.equal(actor.root.children.length,0)
  }
})

test('real potion layers retain separate tint indices and shaders without tinting the bottle',async()=>{
  const input={name:'minecraft:lingering_potion',count:1,snbt:'{id:"minecraft:lingering_potion",count:1,components:{"minecraft:potion_contents":{custom_color:16711680}}}'}
  const plan=await prepareNativeHeldItem(reader,input,'right',{readPixels:pixels})
  assert.equal(plan.textureLayers.size,2);assert.deepEqual([...new Set(plan.faces.map(f=>f.tintIndex))],[0,1])
  assert(plan.sourcePaths.includes(ORIGINAL_ITEM_COLORS_PATH))
  const textures=new Map();for(const [path,row]of plan.textureLayers)textures.set(path,await texture(row.bytes))
  const model=buildNativeHeldItemObject(plan,textures),tints=new Map()
  model.traverse(part=>{if(part.isMesh)tints.set(part.userData.nativeFace.tintIndex,part.material.uniforms.nativeTint.value.toArray())})
  assert.deepEqual(tints.get(0),[1,0,0]);assert.deepEqual(tints.get(1),[1,1,1])
  disposeNativeHeldItemObject(model);for(const tex of textures.values())tex.dispose()
  assert.throws(()=>nativeGeneratedItemElements({width:1,height:1,pixels:Uint8Array.of(255,255,255,255)},5),/LAYER_INVALID/)
})

test('all 46 original bases render in all four original potion-colored item models',async()=>{
  for(const name of ['potion','splash_potion','lingering_potion','tipped_arrow'])for(const potion of colors.potions){
    const input={name:'minecraft:'+name,count:1,snbt:`{id:"minecraft:${name}",count:1,components:{"minecraft:potion_contents":{potion:"${potion.name}"}}}`}
    const plan=await prepareNativeHeldItem(reader,input,'right',{readPixels:pixels})
    assert.equal(plan.tintColors[0],potion.color>>>0,name+':'+potion.name)
    assert.equal(plan.textureLayers.size,2)
  }
})

test('explicit empty thrown Slots allocate no textures and stay empty across received ticks',async()=>{
  for(const name of NATIVE_THROWN_ITEM_TYPES){
    const e=entity(name);e.metadata=[{key:8,type:7,value:{itemCount:0}}];e.itemState=nativeThrownItemState(e)
    const motion=createNativeEntityMotion(e);e.motion=motion.tick(e,1050);e.motion=motion.tick(e,1100)
    const actor=await createNativeThrownItemActor(reader,e,{loadTexture:()=>assert.fail('empty Slot has no texture')})
    actor.update(e,1100,{self:{position:{x:100,y:64,z:3}}});assert.equal(actor.root.visible,false)
    assert.equal(actor.root.children[0].children[0].children.length,0);actor.dispose()
  }
})
