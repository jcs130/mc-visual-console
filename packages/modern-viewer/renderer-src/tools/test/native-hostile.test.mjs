import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as THREE from 'three'
import { NativeAssetReader } from '../../src/native-viewer/model-loader.js'
import { NATIVE_HOSTILE_TYPES,nativeHostileState } from '../../src/native-viewer/native-living-state.js'
import { nativeHostileModelDefinition } from '../../src/native-viewer/native-hostile-models.js'
import { createNativeEntityActor } from '../../src/native-viewer/native-entity-dispatch.js'
import { createNativeEntityMotion } from '../../src/native-viewer/native-entity-motion.js'
import { nativeCubeFaces } from '../../src/native-viewer/native-entity-model.js'

const entity=(name,metadata=[])=>({name,metadata,entityId:42,uuid:'12345678-1234-5678-1234-567812345678',
  position:{x:1,y:64,z:2},yaw:0,pitch:0,headYaw:0,spawnedAt:1000,onGround:true,equipment:[],cues:[]})
test('native mob metadata is class-specific; skeleton conversion, spider climbing and creeper direction are not baby flags',()=>{
  assert.equal(nativeHostileState(entity('minecraft:skeleton',[{key:16,type:'boolean',value:true}])).baby,false)
  assert.equal(nativeHostileState(entity('minecraft:spider',[{key:16,type:'byte',value:1}])).baby,false)
  assert.equal(nativeHostileState(entity('minecraft:creeper',[{key:16,type:'int',value:1}])).swellDirection,1)
  assert.equal(nativeHostileState(entity('minecraft:zombie',[{key:16,type:'boolean',value:true}])).baby,true)
  assert.throws(()=>nativeHostileState(entity('minecraft:zombie',[{key:16,type:'int',value:1}])),/SERIALIZER/)
  assert.equal(nativeHostileState(entity('minecraft:enderman',[{key:16,type:'optional_block_state',value:0}])).carriedBlock,null)
  assert.equal(nativeHostileState(entity('minecraft:enderman',[{key:16,type:'optional_block_state',value:42}])).carriedBlock,41)
})
test('hurt, death, swing and fuse counters consume actual cues once and never a browser timer or obsolete status2',()=>{
  const e=entity('minecraft:zombie'),motion=createNativeEntityMotion(e)
  const cue={...e,cues:[{sequence:1,kind:'entity_status',code:2},{sequence:2,kind:'hurt_animation',yaw:0},{sequence:3,kind:'animation',code:0}]}
  motion.observe(cue,'hurt_animation');assert.equal(motion.current().living.hurtTime,10)
  const first=motion.tick(cue,1050);assert.equal(first.living.hurtTime,9);assert.equal(first.living.attackAnim,0)
  assert.equal(motion.tick(cue,1100).living.attackAnim,Math.fround(1/6))
  assert.equal(motion.current().tick,2,'repeated renders do not create ticks')
  const dead={...cue,metadata:[{key:9,type:'float',value:0}]};motion.observe(dead,'entity_metadata')
  assert.equal(motion.tick(dead,1150).living.deathTime,1)
  assert.equal(motion.tick(dead,1200).living.deathTime,2)
  const creeper=entity('minecraft:creeper',[{key:16,type:'int',value:1}]),fuse=createNativeEntityMotion(creeper)
  for(let n=1;n<=35;n++)fuse.tick(creeper,1000+n*50)
  assert.equal(fuse.current().living.swell,30)
  const cool={...creeper,metadata:[{key:16,type:'int',value:-1}]};assert.equal(fuse.tick(cool,2800).living.swell,29)
})
test('original skinny skeleton, full-width overlay, witch inherited children and zero-depth bogged planes are retained',()=>{
  const def=(name,layer)=>nativeHostileModelDefinition(`minecraft:${name}`,layer)
  assert.deepEqual(def('skeleton').parts.find(p=>p.name==='right_arm').cubes[0].size,[2,12,2])
  assert.deepEqual(def('stray','outer').parts.find(p=>p.name==='right_arm').cubes[0].size,[4,12,4])
  assert.equal(def('stray','outer').parts.find(p=>p.name==='hat').cubes[0].dilation,.75)
  assert.equal(def('witch').parts.find(p=>p.name==='hat_rim').parent,'hat')
  const plane=def('bogged').parts.find(p=>p.name==='red_mushroom_1').cubes[0]
  assert.deepEqual(plane.size,[6,4,0]);const faces=nativeCubeFaces(plane,[64,32])
  assert.equal(faces.length,6);assert.deepEqual(faces.find(f=>f.direction==='north').uv,[56/64,1-16/32,50/64,1-16/32,50/64,1-20/32,56/64,1-20/32])
})
test('all fourteen original mob actors build from the verified original asset pack; walk/hurt/death remain visible until removal',
  {skip:!process.env.NATIVE_ENTITY_ASSET_DIR},async()=>{
    const dir=process.env.NATIVE_ENTITY_ASSET_DIR,manifest=JSON.parse(await fs.readFile(path.join(dir,'native-assets.json'),'utf8')),
      reader=new NativeAssetReader(manifest,name=>fs.readFile(path.join(dir,name)))
    const decode=async bytes=>{const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);return new THREE.Texture({width:v.getUint32(16),height:v.getUint32(20)})}
    for(const name of NATIVE_HOSTILE_TYPES){
      const e=entity(name),motion=createNativeEntityMotion(e);e.motion=motion.current()
      const actor=await createNativeEntityActor(reader,e,{loadTexture:decode});assert.equal(actor.assetInfo.type,name)
      assert.ok(actor.assetInfo.sourcePaths.every(name=>manifest.assets[name]));assert.equal(actor.root.visible,true)
      const next={...e,position:{x:2,y:64,z:2},yaw:90};motion.observe(next,'entity_move_look');next.motion=motion.tick(next,1050)
      actor.update(next,1100);assert.ok(actor.root.position.x>1)
      const hurt={...next,cues:[{sequence:9,kind:'hurt_animation',yaw:0}]};motion.observe(hurt,'hurt_animation');hurt.motion=motion.current();actor.update(hurt,1050)
      assert.equal(actor.root.userData.nativeLiving.hurtTime,10)
      const dead={...hurt,metadata:[{key:9,type:'float',value:0}]};dead.motion=motion.tick(dead,1100);actor.update(dead,1150)
      assert.equal(actor.root.visible,true,'received death animation remains until actual entity_destroy')
      assert.ok(actor.root.children[0].rotation.z>0)
      assert.throws(()=>actor.update({...dead,motion:{...dead.motion,tickMs:100}},1150),/MOTION_UNAVAILABLE/)
      actor.dispose();actor.dispose();assert.equal(actor.root.children.length,0)
    }
  })
