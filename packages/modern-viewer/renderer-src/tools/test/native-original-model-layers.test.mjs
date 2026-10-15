import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import * as THREE from 'three'
import {NativeAssetReader,selectBlockVariants,resolveModel,resourcePath,textureId} from '../../src/native-viewer/model-loader.js'
import {loadOriginalModelLayers,createOriginalModelLayer,originalBlockModelContract,ORIGINAL_MODEL_LAYERS_PATH} from '../../src/native-viewer/native-original-model-layers.js'

const root=fileURLToPath(new URL('../../../asset-packs/vanilla-1.21.1/',import.meta.url))
const manifest=JSON.parse(await fs.readFile(path.join(root,'native-assets.json'),'utf8'))
const reader=new NativeAssetReader(manifest,p=>fs.readFile(path.join(root,p)))
const original=await loadOriginalModelLayers(reader)

test('every original layer bakes exact polygons, normals, UVs, pivots, scales and hierarchy',()=>{
  const material=new THREE.MeshBasicMaterial();let faces=0,disposed=0
  try{
    for(const [key,definition] of Object.entries(original.layers)){
      const model=createOriginalModelLayer(original,key,material)
      assert.equal(model.root.scale.x,1/16)
      for(const part of definition.parts){
        const bone=model.bones.get(part.path)
        assert.deepEqual(bone.position.toArray(),part.pivot);assert.deepEqual(bone.scale.toArray(),part.scale)
        assert.deepEqual([bone.rotation.x,bone.rotation.y,bone.rotation.z],part.rotationZYX);assert.equal(bone.rotation.order,'ZYX');assert.equal(bone.visible,part.visible)
        assert.equal(bone.parent,part.parent?model.bones.get(part.parent):model.root)
        const meshes=bone.children.filter(c=>c.isMesh)
        assert.equal(meshes.length,!part.skipDraw&&part.polygons.length?1:0)
        if(!meshes.length)continue
        const geometry=meshes[0].geometry;geometry.addEventListener('dispose',()=>disposed++)
        const expectedPos=part.polygons.flatMap(p=>p.positions),expectedUv=part.polygons.flatMap(p=>p.uv.map((v,i)=>i%2?1-v:v)),normals=part.polygons.flatMap(p=>Array(4).fill(p.normal).flat())
        assert.deepEqual([...geometry.getAttribute('position').array],expectedPos.map(Math.fround),key)
        assert.deepEqual([...geometry.getAttribute('uv').array],expectedUv.map(Math.fround),key)
        assert.deepEqual([...geometry.getAttribute('normal').array],normals.map(Math.fround),key)
        faces+=part.polygons.length
      }
      const owned=model.root.children.length;assert(owned>0);model.dispose();const count=disposed;model.dispose();assert.equal(disposed,count)
    }
    assert.equal(Object.keys(original.layers).length,213);assert.equal(faces,10552);assert(disposed>0)
  }finally{material.dispose()}
})

test('all 44 original device types are classified from real registrations, including every block variant',()=>{
  const rows=original.blockEntityRenderers
  assert.equal(rows.filter(r=>r.hasRenderer).length,24);assert.equal(rows.filter(r=>!r.hasRenderer).length,20)
  for(const row of rows)for(const name of row.blocks){
    const result=originalBlockModelContract({name,hasBlockEntity:true,renderShape:'MODEL'},original,{vanillaOnly:true})
    assert.equal(result.renderBase,true);assert.equal(result.additionalRenderer,row.hasRenderer);assert.equal(Boolean(result.issue),row.hasRenderer)
    assert(originalBlockModelContract({name,hasBlockEntity:true,renderShape:'MODEL'},original,{vanillaOnly:false}).issue)
  }
  for(const name of ['minecraft:bee_nest','minecraft:chain_command_block','minecraft:repeating_command_block'])assert.equal(originalBlockModelContract({name,hasBlockEntity:true,renderShape:'MODEL'},original,{vanillaOnly:true}).issue,null)
  assert.equal(originalBlockModelContract({name:'minecraft:chest',renderShape:'ENTITYBLOCK_ANIMATED',hasBlockEntity:true},original,{vanillaOnly:true}).renderBase,false)
})

test('every state of every original device without an extra renderer resolves its real JSON and textures',async()=>{
  const names=new Set(original.blockEntityRenderers.filter(r=>!r.hasRenderer).flatMap(r=>r.blocks))
  const states=(await fs.readFile(path.join(root,'registry/block-states.jsonl'),'utf8')).trim().split('\n').map(JSON.parse).filter(s=>names.has(s.name))
  assert.equal(names.size,23);assert(states.length>300)
  const checkedModels=new Set(),checkedTextures=new Set()
  for(const state of states){
    assert.equal(state.renderShape,'MODEL');assert.equal(state.hasBlockEntity,true)
    const bs=await reader.json(resourcePath(state.name,'blockstates','.json'))
    for(const variant of selectBlockVariants(bs,state,{x:0,y:64,z:0})){
      if(checkedModels.has(variant.model))continue
      checkedModels.add(variant.model)
      const model=await resolveModel(reader,variant.model);assert(model.elements.length>0,variant.model)
      for(const element of model.elements)for(const face of Object.values(element.faces)){
        const texture=resourcePath(textureId(model,face.texture),'textures','.png');if(checkedTextures.has(texture))continue
        const bytes=await reader.bytes(texture);assert.equal(Buffer.from(bytes.slice(0,8)).toString('hex'),'89504e470d0a1a0a');checkedTextures.add(texture)
      }
    }
  }
  assert(checkedModels.size>35);assert(checkedTextures.size>50)
})

test('unverified assets, malformed geometry and cycles stay unavailable without substitutes',async()=>{
  const bad=new NativeAssetReader({...manifest,assets:{...manifest.assets,[ORIGINAL_MODEL_LAYERS_PATH]:{sha256:'0'.repeat(64),bytes:1}}},()=>Buffer.from('{}'))
  await assert.rejects(loadOriginalModelLayers(bad),/UNVERIFIED/)
  const material=new THREE.MeshBasicMaterial()
  try{
    assert.throws(()=>createOriginalModelLayer(original,'minecraft:nonexistent#main',material),/UNAVAILABLE/)
    const data=structuredClone(original),layer=data.layers[Object.keys(data.layers)[0]];layer.parts[0].parent=layer.parts[0].path
    assert.throws(()=>createOriginalModelLayer(data,Object.keys(data.layers)[0],material),/CYCLE/)
  }finally{material.dispose()}
})
