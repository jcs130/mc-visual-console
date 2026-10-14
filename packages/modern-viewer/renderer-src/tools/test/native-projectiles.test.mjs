import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import * as THREE from 'three'
import {NativeAssetReader} from '../../src/native-viewer/model-loader.js'
import {createNativeEntityMotion} from '../../src/native-viewer/native-entity-motion.js'
import {NativeEntityLayer} from '../../src/native-viewer/native-entity-layer.js'
import {nativeArrowGeometry,nativeTridentModel,nativeExperienceSprite,nativeProjectileFrame,createNativeProjectileActor,NATIVE_PROJECTILE_TYPES} from '../../src/native-viewer/native-projectiles.js'
import {pngRgba} from './fixtures/png-rgba.mjs'

const entity=name=>({name,entityId:7,uuid:name.endsWith('experience_orb')?null:'12345678-1234-5678-1234-567812345678',
  spawnedAt:1000,position:{x:1,y:64,z:3},yaw:179,pitch:0,metadata:[],equipment:[],objectData:1,experienceValue:17})
const finish=async layer=>{while(layer.running)await new Promise(resolve=>setImmediate(resolve))}

test('arrow has the original six textured quads and trident the original five model parts',()=>{
  const faces=nativeArrowGeometry();assert.equal(faces.length,6)
  assert.deepEqual([...faces[0].getAttribute('position').array],[-7,-2,-2,-7,-2,2,-7,2,2,-7,2,-2])
  assert.deepEqual([...faces[0].getAttribute('uv').array],[0,.84375,.15625,.84375,.15625,.6875,0,.6875])
  for(const g of faces){assert.equal(g.getAttribute('position').count,4);assert.equal(g.index.count,6);g.dispose()}
  const parts=nativeTridentModel().parts;assert.equal(parts.length,5);assert.deepEqual(parts[0].cubes[0].size,[1,25,1]);assert.equal(parts[4].cubes[0].mirror,true)
  assert.deepEqual([1,2,3,7,17,37,73,149,307,617,1237,2477].map(nativeExperienceSprite),[0,0,1,2,3,4,5,6,7,8,9,10])
})

test('projectiles interpolate only received motion and actual connection ticks, without predicting impacts',()=>{
  const e=entity('minecraft:arrow'),m=createNativeEntityMotion(e)
  e.motion=m.current();assert.deepEqual(nativeProjectileFrame(e,1000).position,[1,64,3])
  const n={...e,position:{x:3,y:65,z:4},yaw:-179};n.motion=m.tick(n,1050)
  const frame=nativeProjectileFrame(n,1075);assert.deepEqual(frame.position,[2,64.5,3.5]);assert.equal(frame.yaw,180)
  assert.equal(n.motion.flightPrediction,false);assert.equal(n.motion.ageSource,'viewer_client_lifetime_not_server_age')
  assert.deepEqual(nativeProjectileFrame(n,9999),nativeProjectileFrame(n,1100))
})

test('five projectile actors use verified original assets, exact dimensions and no proxy cone/orb geometry',{skip:!process.env.NATIVE_GUIDE_ASSET_DIR},async()=>{
  const dir=process.env.NATIVE_GUIDE_ASSET_DIR,manifest=JSON.parse(await fs.readFile(path.join(dir,'native-assets.json'),'utf8'))
  const reader=new NativeAssetReader(manifest,p=>fs.readFile(path.join(dir,p)))
  const hashes={arrow:'630483313e847f86c5af6f73b572a03fc0b943e99c780505cbfb14c8ec299553',spectral_arrow:'deff2b4f82393efac5d344b8aa0e420f82d0f854cfc525e8672d973982137f55',
    trident:'cee14236960dae0960c0d0d14e4f61cf2cade3c160887b532d5d8a9e9e6ef530',fishing_bobber:'f4c642d2f12aa8ee7e7c9acbc1b197cf8209a91d9e69acdff1bba4b3193cd785',experience_orb:'9a708e3fdb4e74a540e2e7df41111edf591aab9965c4e2e8ff8c943b7e0fb1f3'}
  for(const name of NATIVE_PROJECTILE_TYPES){
    const e=entity(name);e.motion=createNativeEntityMotion(e).current()
    const actor=await createNativeProjectileActor(reader,e,{loadTexture:async bytes=>{const p=pngRgba(bytes);return new THREE.Texture({width:p.width,height:p.height})}})
    assert.equal(createHash('sha256').update(await reader.bytes(actor.assetInfo.sourcePaths[0])).digest('hex'),hashes[name.split(':')[1]])
    actor.update(e,1000,{self:{entityId:1}});assert.equal(actor.root.visible,true)
    let triangles=0;actor.root.traverse(o=>{if(o.isMesh)triangles+=o.geometry.index.count/3});assert.equal(triangles,name.endsWith('trident')?60:name.includes('arrow')?12:2)
    assert.throws(()=>actor.update({...e,spawnedAt:2000}),/BINDING_MISMATCH/)
    actor.dispose();assert.equal(actor.root.children.length,0)
  }
})

test('XP pickup preserves the actual value, has no invented UUID, and ID reuse starts a new actor',async()=>{
  let created=0
  const layer=new NativeEntityLayer(null,{createActor:async()=>{created++;return{root:new THREE.Group(),update(){},dispose(){this.root.removeFromParent()}}}})
  const e=entity('minecraft:experience_orb');layer.stage({available:true,entities:[e]});await finish(layer)
  const v={source:'received_native_collect_packet',epoch:1,sequence:1,tick:10,collectedEntityId:7,collectorEntityId:1,count:0,entity:e,target:{x:4,y:64,z:3}}
  await layer.collect(v);assert.equal(created,2);assert.equal(layer.pickups.size,1)
  layer.frame(1050,{tick:11,sampledAt:1050});assert.equal(layer.actors.get(7).actor.root.visible,false)
  assert.equal([...layer.pickups.values()][0].entity.experienceValue,17)
  layer.frame(1150,{tick:13,sampledAt:1150});assert.equal(layer.pickups.size,0)
  layer.stage({available:true,entities:[{...e,spawnedAt:2000}]});await finish(layer);layer.frame(1200)
  assert.equal(created,3);assert.equal(layer.actors.get(7).actor.root.visible,true);layer.dispose()
})
