import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import * as THREE from 'three'
import {NativeAssetReader} from '../../src/native-viewer/model-loader.js'
import {createNativeEntityActor,nativeEntityRenderState} from '../../src/native-viewer/native-entity-dispatch.js'
import {createNativeEntityMotion} from '../../src/native-viewer/native-entity-motion.js'
import {nativePhantomState} from '../../src/native-viewer/native-phantom.js'

const root=new URL('../../../asset-packs/vanilla-1.21.1/',import.meta.url)
const entity=(size=0)=>({name:'minecraft:phantom',entityId:42,uuid:'12345678-1234-5678-1234-567812345678',metadata:[{key:16,type:1,value:size}],equipment:[],position:{x:1,y:70,z:2},yaw:0,pitch:0,headYaw:0,spawnedAt:1000,cues:[]})
async function reader(){const manifest=JSON.parse(await fs.readFile(new URL('native-assets.json',root),'utf8'));return new NativeAssetReader(manifest,path=>fs.readFile(new URL(path,root)))}
const loadTexture=async bytes=>{const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);return new THREE.Texture({width:v.getUint32(16),height:v.getUint32(20)})}
test('phantom is a real observed actor with the original nine-part bake and both original texture passes',async()=>{
 const e=entity(),motion=createNativeEntityMotion(e);assert(motion);e.motion=motion.current()
 const r=await reader(),actor=await createNativeEntityActor(r,e,{loadTexture})
 assert.equal(nativeEntityRenderState(e).size,0);assert.equal(actor.assetInfo.type,'minecraft:phantom')
 for(const p of actor.assetInfo.sourcePaths)assert(r.manifest.assets[p],p)
 const definition=(await r.json('assets/minecraft/native/client-model-layers.json')).layers['minecraft:phantom#main']
 const expected=definition.parts.reduce((n,p)=>n+p.polygons.length*4,0);let vertices=0
 actor.root.traverse(node=>{if(node.isMesh)vertices+=node.geometry.attributes.position.count})
 assert.equal(vertices,expected*2);assert.equal(definition.parts.length,9)
 const wing=actor.root.getObjectByName('left_wing_base'),right=actor.root.getObjectByName('right_wing_base'),tail=actor.root.getObjectByName('tail_base')
 assert.equal(wing.rotation.z,-right.rotation.z);assert.equal(tail.rotation.x,actor.root.getObjectByName('tail_tip').rotation.x)
 const before=wing.rotation.z
 for(let n=1;n<=5;n++)e.motion=motion.tick(e,1000+n*50)
 actor.update(e,1250);assert.notEqual(wing.rotation.z,before)
 assert.equal(actor.assetInfo.completeEntityParityVerified,false)
 assert.throws(()=>actor.update({...e,uuid:'other'},1250),/IDENTITY_MISMATCH/)
 actor.dispose();actor.dispose();assert.equal(actor.root.children.length,0)
})
test('original phantom size, current pitch, invisible eye pass and received death counters remain separate',async()=>{
 const e=entity(4),motion=createNativeEntityMotion(e);e.motion=motion.current()
 const actor=await createNativeEntityActor(await reader(),e,{loadTexture}),death=actor.root.children[0],flight=death.children[0],flip=flight.children[0],content=flip.children[0]
 assert.equal(flip.scale.x,-Math.fround(1+Math.fround(Math.fround(.15)*4)))
 assert.equal(content.position.y,Math.fround(1.3125)-Math.fround(1.501));assert.equal(content.position.z,.1875)
 const next={...e,pitch:30,metadata:[...e.metadata,{key:0,type:0,value:32},{key:9,type:3,value:0}]};motion.observe(next,'entity_metadata');next.motion=motion.tick(next,1050);actor.update(next,1050)
 assert.equal(flight.rotation.x,next.motion.pitch*Math.fround(Math.PI/180));assert.equal(content.children[0].visible,false);assert.equal(content.children[1].visible,true)
 for(let n=2;n<=12;n++)next.motion=motion.tick(next,1000+n*50)
 actor.update(next,1600);assert(death.rotation.z>0);assert.equal(actor.root.userData.nativeLiving.deathTime,12)
 assert.throws(()=>actor.update({...next,motion:null}),/MOTION_UNAVAILABLE/);actor.dispose()
})
test('phantom metadata/source validation keeps malformed and unproven variants unavailable',async()=>{
 for(const size of [-1,65,1.5])assert.throws(()=>nativePhantomState(entity(size)),/SIZE_INVALID|METADATA_INVALID/)
 assert.throws(()=>nativePhantomState({...entity(),metadata:[{key:16,type:8,value:true}]}),/SERIALIZER/)
 const r=await reader();r.manifest.clientJarSha256='wrong';await assert.rejects(createNativeEntityActor(r,entity(),{loadTexture}),/CLIENT_SOURCE_UNSUPPORTED/)
})
