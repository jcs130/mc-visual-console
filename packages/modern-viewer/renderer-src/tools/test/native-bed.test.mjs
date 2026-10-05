import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import * as THREE from 'three'
import {NativeAssetReader} from '../../src/native-viewer/model-loader.js'
import {ENTITY_MODEL_CLIENT_SHA256} from '../../src/native-viewer/native-entity-model.js'
import {nativeBedState,nativeBedLayer,nativeBedPieceMatrix,createNativeBedTemplate} from '../../src/native-viewer/native-bed.js'

const state=(part='head',facing='south')=>({name:'minecraft:red_bed',hasBlockEntity:true,renderShape:'ENTITYBLOCK_ANIMATED',properties:{part,facing,occupied:'false'}})
const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(13,8);png.write('IHDR',12);png.writeUInt32BE(64,16);png.writeUInt32BE(64,20)
const path='assets/minecraft/textures/entity/bed/red.png'
const manifest=()=>({minecraftVersion:'1.21.1',assetIntegrityVerified:true,clientJarSha256:ENTITY_MODEL_CLIENT_SHA256,assets:{[path]:{bytes:png.length,sha256:createHash('sha256').update(png).digest('hex')}}})
const reader=m=>new NativeAssetReader(m??manifest(),async()=>png)
const loadTexture=async()=>new THREE.Texture({width:64,height:64})

test('bed uses original head/foot layer UVs and floating-point rotations',()=>{
  assert.deepEqual(nativeBedState(state()),{color:'red',part:'head',facing:'south'})
  const head=nativeBedLayer('head'),foot=nativeBedLayer('foot')
  assert.deepEqual(head.parts[0].cubes[0].uv,[0,0]);assert.deepEqual(foot.parts[0].cubes[0].uv,[0,22])
  assert.deepEqual(head.parts[2].cubes[0].uv,[50,18]);assert.deepEqual(foot.parts[2].cubes[0].uv,[50,12])
  assert.equal(foot.parts[2].rotation[2],Math.fround(4.712389))
  for(const patch of [{name:'mod:red_bed'},{renderShape:'MODEL'},{hasBlockEntity:false},{properties:{part:'both',facing:'south',occupied:'false'}}])assert.throws(()=>nativeBedState({...state(),...patch}),/STATE_UNSUPPORTED/)
})
test('original facing matrices keep each bed half within its received block coordinates',async()=>{
  for(const facing of ['south','west','north','east'])for(const part of ['head','foot']){
    const bed=await createNativeBedTemplate(reader(),state(part,facing),{loadTexture})
    const world=new THREE.Group();world.position.set(12.5,64.5,-7.5);world.add(bed.root);world.updateMatrixWorld(true)
    const box=new THREE.Box3().setFromObject(bed.root)
    for(const [got,want] of [[box.min.x,12],[box.max.x,13],[box.min.z,-8],[box.max.z,-7],[box.min.y,64],[box.max.y,64.5625]])assert.ok(Math.abs(got-want)<0.000002,`${part} ${facing}: ${got} vs ${want}`)
    assert.equal(bed.assetInfo.pixelParityVerified,false);assert.equal(bed.assetInfo.worldLightingParityVerified,false)
    bed.root.traverse(part=>{if(part.isMesh){assert.equal(part.material.side,THREE.FrontSide);assert.equal(part.material.transparent,false)}})
    bed.dispose();assert.equal(bed.root.children.length,0)
  }
  const origin=new THREE.Vector3(0,0,0).applyMatrix4(nativeBedPieceMatrix('south'))
  assert.ok(origin.distanceTo(new THREE.Vector3(1,0.5625,1))<1e-12)
})
test('bed assets still reject unresolved resource priority, corrupt source and decoder dimensions',async()=>{
  const conflict=manifest();conflict.assets[path].variants=[{sha256:'a'.repeat(64)}]
  await assert.rejects(createNativeBedTemplate(reader(conflict),state(),{loadTexture}),/PRIORITY_UNRESOLVED/)
  const wrong=manifest();wrong.clientJarSha256='b'.repeat(64)
  await assert.rejects(createNativeBedTemplate(reader(wrong),state(),{loadTexture}),/SOURCE_UNSUPPORTED/)
  await assert.rejects(createNativeBedTemplate(reader(),state(),{loadTexture:async()=>new THREE.Texture({width:16,height:16})}),/DECODE_INVALID/)
})
