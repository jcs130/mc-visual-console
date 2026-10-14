import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as THREE from 'three'
import { NativeItemIcons, nativeItemIconEligible } from '../../src/native-viewer/native-item-icons.js'
import { STATIC_ITEM_SOURCES } from '../../src/native-viewer/native-static-item-providers.js'
import { BLOCK_ICON_SHADER_HASHES } from '../../src/native-viewer/native-block-item-icons.js'
import { NativeAssetReader } from '../../src/native-viewer/model-loader.js'
import { prepareNativeChestItemIcon, nativeChestItemTexture } from '../../src/native-viewer/native-chest-item-icons.js'

const names=['minecraft:chest','minecraft:trapped_chest','minecraft:ender_chest']
const item=name=>({name,count:1,snbt:`{id:"${name}",count:1}`})
const gui={rotation:[30,45,0],translation:[0,0,0],scale:[.625,.625,.625]}
function reader() {
  return {manifest:{minecraftVersion:'1.21.1',assetIntegrityVerified:true,clientJarSha256:STATIC_ITEM_SOURCES.minecraft.sha256,
    sources:[STATIC_ITEM_SOURCES.minecraft],assets:{...Object.fromEntries(Object.entries(BLOCK_ICON_SHADER_HASHES).map(([p,sha256])=>[p,{sha256,bytes:1}])),
      ...Object.fromEntries(['normal','trapped','ender','christmas'].map(n=>[`assets/minecraft/textures/entity/chest/${n}.png`,{bytes:100}]))}},
    json:async p=>p.endsWith('/item/chest.json')?{parent:'builtin/entity',display:{gui},textures:{particle:'block/oak_planks'}}:{parent:'item/chest'},
    bytes:async()=>new Uint8Array([1])}
}

test('closed single chest geometry keeps original part positions, UVs and GUI transform for all three item types',async()=>{
  for(const name of names) {
    assert.equal(nativeItemIconEligible(item(name)),true)
    const plan=await prepareNativeChestItemIcon(reader(),name,{date:new Date(2026,9,15)})
    assert.equal(plan.kind,'native-builtin-chest-gui');assert.equal(plan.faces.length,18)
    assert.deepEqual(plan.transform,{rotation:[30,45,0],translation:[0,0,0],scale:[.625,.625,.625]})
    assert.deepEqual(plan.textureDimensions,[64,64]);assert.equal(plan.texturePaths[0],nativeChestItemTexture(name,new Date(2026,9,15)))
    const positions=plan.faces.filter(f=>f.part==='lock').flatMap(f=>f.position)
    assert.equal(Math.min(...positions.filter((_,n)=>n%3===1)),-.0625)
    assert.equal(Math.max(...positions.filter((_,n)=>n%3===2)),.5)
    assert.ok(plan.faces.every(f=>f.uv.every(n=>n>=0&&n<=1)))
    assert.ok(plan.renderFaces.length>0&&plan.renderFaces.length<18)
  }
  for(const day of [24,25,26])assert.match(nativeChestItemTexture('minecraft:trapped_chest',new Date(2026,11,day)),/christmas/)
  assert.match(nativeChestItemTexture('minecraft:chest',new Date(2026,11,23)),/normal/)
  assert.match(nativeChestItemTexture('minecraft:ender_chest',new Date(2026,11,25)),/ender/)
})

test('missing sources, dynamic models and unobserved visual components cannot acquire a generic chest icon',async()=>{
  for(const modify of [r=>r.manifest.sources=[],r=>r.manifest.clientJarSha256='wrong',
    r=>r.json=async()=>({parent:'builtin/entity',loader:'unknown'}),r=>r.json=async()=>({parent:'block/cube_all'}),
    r=>r.manifest.assets['assets/minecraft/textures/entity/chest/normal.png.mcmeta']={bytes:1}]) {
    const r=reader();modify(r);await assert.rejects(prepareNativeChestItemIcon(r,'minecraft:chest',{date:new Date(2026,9,15)}))
  }
  assert.equal(nativeItemIconEligible({...item('minecraft:chest'),snbt:'{id:"minecraft:chest",count:1,components:{"minecraft:custom_model_data":1}}'}),false)
})

test('builtin chest provider uses original model rendering and releases its small context',async()=>{
  let renders=0,disposed=0;const source=reader()
  const icons=new NativeItemIcons(source,{createUrl:()=> 'blob:chest',revokeUrl:()=>{},chestRendererOptions:{
    loadTexture:async()=>new THREE.Texture({width:64,height:64}),
    createRenderer:()=>({clear(){},render(scene){renders++;assert.equal(scene.children[0].userData.nativeItem,'minecraft:chest')},dispose(){disposed++}}),
    encode:async()=>new Blob([new Uint8Array([1])],{type:'image/png'})}})
  icons.resolve(item('minecraft:chest'))
  while(icons.active)await new Promise(resolve=>setImmediate(resolve))
  const result=icons.resolve(item('minecraft:chest'));assert.equal(result.kind,'native-builtin-chest-gui');assert.equal(renders,1)
  icons.dispose();assert.equal(disposed,1)
})

test('actual exported client assets verify all three builtin chest models and all seasonal original textures',{skip:!process.env.NATIVE_GUIDE_ASSET_DIR},async()=>{
  const directory=process.env.NATIVE_GUIDE_ASSET_DIR,manifest=JSON.parse(await fs.readFile(path.join(directory,'native-assets.json'),'utf8'))
  const source=new NativeAssetReader(manifest,p=>fs.readFile(path.join(directory,p)))
  for(const name of names)for(const date of [new Date(2026,9,15),new Date(2026,11,25)]) {
    const plan=await prepareNativeChestItemIcon(source,name,{date})
    const png=await source.bytes(plan.texturePaths[0]);assert.deepEqual([...png.slice(0,4)],[137,80,78,71])
    assert.equal(new DataView(png.buffer,png.byteOffset,png.byteLength).getUint32(16),64)
  }
})
