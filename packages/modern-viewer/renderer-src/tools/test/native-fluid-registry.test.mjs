import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import * as THREE from 'three'
import {nativeFluidFamily,nativeFluidGeometry} from '../../src/native-viewer/native-fluid.js'
import {NativeAssetReader,NativeModelLoader,resourcePath} from '../../src/native-viewer/model-loader.js'

const root=fileURLToPath(new URL('../../../asset-packs/vanilla-1.21.1/',import.meta.url))
const manifest=JSON.parse(await fs.readFile(path.join(root,'native-assets.json'),'utf8'))
const reader=new NativeAssetReader(manifest,p=>fs.readFile(path.join(root,p)))
const states=(await fs.readFile(path.join(root,'registry/block-states.jsonl'),'utf8')).trim().split('\n').map(JSON.parse)
const air=states.find(s=>s.name==='minecraft:air'),p={x:0,y:64,z:0},key=p=>`${p.x},${p.y},${p.z}`
const water=states.find(s=>s.name==='minecraft:water'&&s.properties.level==='0'),lava=states.find(s=>s.name==='minecraft:lava'&&s.properties.level==='0')
const fixture=(entries)=>{const map=new Map(entries);return pos=>map.get(key(pos))??air}

test('all 9246 original nonempty fluid states, including all 344 waterlogged block IDs, use actual state metadata',async()=>{
  const fluids=states.filter(s=>!s.fluid.empty),textures=new Set(),names=new Set()
  assert.equal(fluids.length,9246)
  for(const state of fluids){
    assert(['water','lava'].includes(nativeFluidFamily(state)),state.name)
    const result=nativeFluidGeometry(p,fixture([['0,64,0',state]]));names.add(state.name)
    for(const quad of result.quads){assert(quad.vertices.every(Number.isFinite));assert(quad.uv.every(Number.isFinite));textures.add(quad.texture)}
    assert.equal(result.family,nativeFluidFamily(state));assert.equal(result.lightmapParityVerified,false)
  }
  assert.equal(names.size,344)
  for(const id of textures){const bytes=await reader.bytes(resourcePath(id,'textures','.png'));assert.equal(Buffer.from(bytes.slice(0,8)).toString('hex'),'89504e470d0a1a0a')}
})

test('water and lava do not hide each other; actual source/flow names within one family do',()=>{
  assert.equal(nativeFluidFamily(water),'water');assert.equal(nativeFluidFamily(lava),'lava')
  const mixed=nativeFluidGeometry(p,fixture([['0,64,0',lava],['1,64,0',water]]))
  assert(mixed.quads.some(q=>q.face==='east'));assert.equal(mixed.tint,'original_white')
  const flowing=states.find(s=>s.name==='minecraft:lava'&&s.fluid.name==='minecraft:flowing_lava')
  assert(!nativeFluidGeometry(p,fixture([['0,64,0',lava],['1,64,0',flowing]])).quads.some(q=>q.face==='east'))
})

test('only water selects original glass/leaves overlay, while lava retains its original flow sprite',()=>{
  const glass=states.find(s=>s.name==='minecraft:glass')
  const w=nativeFluidGeometry(p,fixture([['0,64,0',water],['1,64,0',glass]])),l=nativeFluidGeometry(p,fixture([['0,64,0',lava],['1,64,0',glass]]))
  assert.equal(w.quads.find(q=>q.face==='east').texture,'minecraft:block/water_overlay')
  assert.equal(l.quads.find(q=>q.face==='east').texture,'minecraft:block/lava_flow')
  assert.equal(w.quads.find(q=>q.face==='east').backwards,false);assert.equal(l.quads.find(q=>q.face==='east').backwards,true)
})

test('original lava sprites use the solid material layer; original water remains translucent',async()=>{
  const loader=new NativeModelLoader(reader),original=[]
  loader.material=async()=>{const m=new THREE.MeshLambertMaterial();original.push(m);return m}
  try{
    for(const id of ['lava_still','lava_flow','water_still','water_flow','water_overlay']){
      const material=await loader.fluidMaterial(`minecraft:block/${id}`)
      assert.equal(material.transparent,id.startsWith('water_'));assert.equal(material.vertexColors,true)
    }
  }finally{loader.dispose();original.forEach(m=>m.dispose())}
})
