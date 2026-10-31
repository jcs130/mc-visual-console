import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import * as THREE from 'three'
import {NativeAssetReader} from '../../src/native-viewer/model-loader.js'
import {loadOriginalModelLayers,createOriginalModelLayer} from '../../src/native-viewer/native-original-model-layers.js'
import {animateNativeFlying,nativeFlyingState} from '../../src/native-viewer/native-flying-state.js'
import {createNativeFlyingActor} from '../../src/native-viewer/native-flying.js'
import {createNativeEntityMotion} from '../../src/native-viewer/native-entity-motion.js'
import {nativeEntityRenderState,createNativeEntityActor} from '../../src/native-viewer/native-entity-dispatch.js'
import {nativeVisibleName} from '../../src/native-viewer/native-name-tag.js'
const assets=new URL('../../../asset-packs/vanilla-1.21.1/',import.meta.url)
const manifest=JSON.parse(await fs.readFile(new URL('native-assets.json',assets),'utf8'))
const reader=new NativeAssetReader(manifest,p=>fs.readFile(new URL(p,assets)))
const original=await loadOriginalModelLayers(reader)
const reference=JSON.parse(await fs.readFile(new URL('../fixtures/native-flying-1.21.1.json',import.meta.url),'utf8'))
const uuid='00000000-0000-4000-8000-000000000001'
const entity=(name='minecraft:allay')=>({entityId:7,uuid,name,position:{x:1,y:64,z:2},yaw:0,pitch:0,headYaw:0,metadata:[],equipment:[],spawnedAt:1000})
const loadTexture=async bytes=>new THREE.Texture({width:Buffer.from(bytes).readUInt32BE(16),height:Buffer.from(bytes).readUInt32BE(20)})

test('48 original Java CPU animation samples match every original flying part',()=>{
 assert.equal(reference.clientSha256,manifest.clientJarSha256);assert.equal(reference.rows.length,48)
 const material=new THREE.MeshBasicMaterial()
 try{for(const row of reference.rows){
  const model=createOriginalModelLayer(original,row.name+'#main',material)
  try{
   animateNativeFlying(model,row,row)
   for(const [path,expected]of Object.entries(row.parts)){
    const part=model.bones.get(path);assert(part,path)
    for(const [kind,actual]of [['position',part.position.toArray()],['rotation',[part.rotation.x,part.rotation.y,part.rotation.z]]])
     // Gson emits shortest round-tripping Java Float decimals. Reconstitute
     // that exact float before comparing with the JS float/LUT port.
     actual.forEach((v,i)=>assert(Math.abs(v-Math.fround(expected[kind][i]))<5e-7,`${row.name} age=${row.age} speed=${row.speed} ${path}.${kind}[${i}]: ${v} != ${Math.fround(expected[kind][i])}`))
   }
  }finally{model.dispose()}
 }}finally{material.dispose()}
})
test('both original flying actors render from received ticks and original resources without a mod rig',async()=>{
 for(const name of ['minecraft:allay','minecraft:vex']){
  const e=entity(name),motion=createNativeEntityMotion(e);assert(motion);e.motion=motion.current()
  assert.equal(nativeEntityRenderState(e).name,name)
  const actor=await createNativeEntityActor(reader,e,{loadTexture})
  try{
   assert.equal(actor.assetInfo.geometrySource,'original_LayerDefinition_bakeRoot');assert.equal(actor.assetInfo.completeEntityParityVerified,false)
   const old=actor.root.children[0].children[0].children[0].getObjectByName('left_wing').rotation.y
   for(let i=1;i<=3;i++)e.motion=motion.tick(e,1000+i*50)
   actor.update(e,1150);assert.notEqual(actor.root.children[0].children[0].children[0].getObjectByName('left_wing').rotation.y,old)
   const before=e.motion.tick;actor.update(e,1200);assert.equal(e.motion.tick,before,'a browser frame never creates source ticks')
   assert.throws(()=>actor.update({...e,uuid:'00000000-0000-4000-8000-000000000002'},1200),/IDENTITY_MISMATCH/)
  }finally{actor.dispose()}
 }
})
test('holding counters follow actual item slots; missing metadata defaults and unsupported effects remain explicit',async()=>{
 const e=entity();const m=createNativeEntityMotion(e)
 e.equipment=[{slot:0,item:{itemCount:1}}]
 for(let i=1;i<=5;i++)e.motion=m.tick(e,1000+i*50)
 assert.equal(e.motion.flying.holding,5)
 const actor=await createNativeFlyingActor(reader,e,{loadTexture})
 try{
  assert(actor.root.userData.nativeLiving.issues.includes('NATIVE_FLYING_HELD_ITEM_LAYER_UNAVAILABLE'))
  e.equipment=[];e.motion=m.tick(e,1300);assert.equal(e.motion.flying.holding,4)
  actor.update(e,1300);assert(!actor.root.userData.nativeLiving.issues.includes('NATIVE_FLYING_HELD_ITEM_LAYER_UNAVAILABLE'))
 }finally{actor.dispose()}
 assert.throws(()=>nativeFlyingState({...e,metadata:[{key:16,type:'byte',value:1}]}),/SERIALIZER_UNSUPPORTED/)
 assert.equal(nativeFlyingState(entity('minecraft:vex')).charging,false)
 const internal=entity();internal.equipment=new Map([[0,{slot:0,item:{itemCount:1}}]]);const motion=createNativeEntityMotion(internal)
 assert.equal(motion.tick(internal,1050).flying.holding,1,'host equipment Map is the real stream shape before snapshots')
})
test('actual typed NBT visible names stay Chinese and noninteractive; absent and hidden names remain absent',()=>{
 const e=entity();e.metadata=[{key:2,type:'optional_component',value:{type:'compound',value:{text:{type:'string',value:'[女仆] 兼容联测女仆'},color:{type:'string',value:'aqua'}}}},{key:3,type:'boolean',value:true}]
 assert.deepEqual(nativeVisibleName(e),{text:'[女仆] 兼容联测女仆',color:'#55ffff',source:'received_visible_custom_name',fontSource:'browser_system_font'})
 e.metadata[1].value=false;assert.equal(nativeVisibleName(e),null)
 e.metadata[1].value=true;e.metadata[0].value={text:'<script>alert(1)</script>',clickEvent:{action:'open_url',value:'https://example.invalid/'}}
 assert.equal(nativeVisibleName(e).text,'<script>alert(1)</script>')
})
