import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import * as THREE from 'three'
import { NativeAssetReader } from '../../src/native-viewer/model-loader.js'
import { createNativeDroppedItemMotion } from '../../src/native-viewer/native-entity-motion.js'
import { nativeDroppedItemCopies,nativeDroppedItemOffsets,nativeDroppedItemFrame,createNativeDroppedItemActor } from '../../src/native-viewer/native-dropped-items.js'
import { pngRgba } from './fixtures/png-rgba.mjs'

const item=()=>({name:'minecraft:item',entityId:10,uuid:'12345678-1234-5678-1234-567812345678',position:{x:2,y:64,z:4},spawnedAt:1000})
test('original item bundle thresholds and seeded offsets remain bounded and deterministic',()=>{
  assert.deepEqual([1,2,16,17,32,33,48,49,64].map(nativeDroppedItemCopies),[1,2,2,3,3,4,4,5,5])
  const a=nativeDroppedItemOffsets(33,0,true),b=nativeDroppedItemOffsets(33,0,true)
  assert.deepEqual(a,b);assert.deepEqual(a[0],[0,0,0]);assert.equal(a.length,4)
  assert.ok(Math.abs(a[1][0]-.06929033249616623)<1e-8)
  const flat=nativeDroppedItemOffsets(2,0,false,.5)
  assert.equal(flat[0][2],-.0234375);assert.equal(flat[1][2],.0234375)
})

test('drop bob and spin use observed-connection client ticks, with explicit unavailable server despawn age',()=>{
  const entity=item(),motion=createNativeDroppedItemMotion(entity,{random:()=>0})
  const first=nativeDroppedItemFrame({...entity,motion:motion.current()},1000,.5)
  assert.deepEqual(first.position,[2,64,4]);assert.ok(Math.abs(first.y-.225)<1e-7);assert.equal(first.yaw,0)
  const next={...entity,position:{x:3,y:64,z:4}},tick=motion.tick(next,1050)
  const moving=nativeDroppedItemFrame({...next,motion:tick},1075,.5)
  assert.deepEqual(moving.position,[2.5,64,4]);assert.equal(moving.ageSource,'viewer_client_lifetime_not_server_despawn_age')
  const frozen=nativeDroppedItemFrame({...next,motion:tick},2000,.5)
  assert.equal(frozen.yaw,nativeDroppedItemFrame({...next,motion:tick},1100,.5).yaw,'render time cannot invent further physics ticks')
  assert.throws(()=>nativeDroppedItemFrame({...entity,motion:null},1000,.5),/MOTION_UNAVAILABLE/)
})

test('actual exported generated/block/chest models render drop copies from full real stacks and clean resources',{skip:!process.env.NATIVE_GUIDE_ASSET_DIR},async()=>{
  const require=createRequire(import.meta.url),registry=require('minecraft-data')('1.21.1')
  const directory=process.env.NATIVE_GUIDE_ASSET_DIR,manifest=JSON.parse(await fs.readFile(path.join(directory,'native-assets.json'),'utf8'))
  const reader=new NativeAssetReader(manifest,p=>fs.readFile(path.join(directory,p)))
  for(const leaf of ['stick','dirt','oak_sapling','chest']) {
    const entity=item(),name='minecraft:'+leaf
    entity.itemState={available:true,source:'same_player_vanilla_item_registry',minecraftVersion:'1.21.1',registryId:registry.itemsByName[leaf].id,
      item:{name,count:33,snbt:`{id:"${name}",count:33}`}}
    entity.motion=createNativeDroppedItemMotion(entity,{random:()=>0}).current()
    const actor=await createNativeDroppedItemActor(reader,entity,{readPixels:async bytes=>pngRgba(bytes),
      loadTexture:async bytes=>{const png=pngRgba(bytes);return new THREE.Texture({width:png.width,height:png.height})}})
    assert.equal(actor.assetInfo.copies,4);assert.equal(actor.root.userData.nativeDroppedItem.item,name)
    assert.ok(actor.assetInfo.sourcePaths.every(p=>manifest.assets[p]));assert.equal(actor.root.children[0].children.length,4)
    assert.throws(()=>actor.update({...entity,uuid:'other'},1000),/BINDING_MISMATCH/)
    actor.dispose();assert.equal(actor.root.children.length,0)
  }
})
