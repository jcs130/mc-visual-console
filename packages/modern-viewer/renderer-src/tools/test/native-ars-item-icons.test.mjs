import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { BLOCK_ICON_CLIENT_SHA256 } from '../../src/native-viewer/native-block-item-icons.js'
import { parseNativeItemStack } from '../../src/native-viewer/native-item-stack.js'
import { ARS_ITEM_SOURCE_HASHES, ARS_ITEM_ASSET_HASHES, ARS_BOOK_TEXTURE_HASHES, ARS_GUI_LIGHT_DIRECTIONS,
  nativeArsItemEligible, nativeArsItemState, bakeNativeArsGeoFaces, prepareNativeArsItemIcon,
  buildNativeArsItemObject, disposeNativeArsItemObject, NativeArsItemIconRenderer
} from '../../src/native-viewer/native-ars-item-icons.js'

// Compact transcription of the locked Ars 5.13.2 closed model's fifteen bones.
// Production verifies the full original JSON/PNG bytes, not these test fixtures.
const directions = ['north','east','south','west','up','down']
const cube = (origin,size,rects) => ({origin,size,uv:Object.fromEntries(rects.map((r,i)=>[directions[i],{uv:r.slice(0,2),uv_size:r.slice(2)}]))})
const groups = [
  {tier:3,suffix:'',uv:[
    [[36,52,6,15],[6,58,3,15],[42,52,6,15],[9,58,3,15],[62,55,6,3],[62,61,6,-3]],
    [[21,58,2,13],[40,0,9,13],[23,58,2,13],[40,13,9,13],[58,43,2,9],[62,37,2,-9]],
    [[35,58,1,15],[0,0,10,15],[66,27,1,15],[10,0,10,15],[66,42,1,10],[43,77,1,-10]],
    [[25,58,2,13],[40,26,9,13],[27,58,2,13],[40,39,9,13],[62,37,2,9],[62,55,2,-9]],
    [[66,64,1,15],[0,15,10,15],[67,18,1,15],[10,15,10,15],[44,67,1,10],[45,77,1,-10]]]},
  {tier:2,suffix:'2',uv:[
    [[48,52,6,15],[12,58,3,15],[54,52,6,15],[15,58,3,15],[62,61,6,3],[63,18,6,-3]],
    [[29,58,2,13],[0,45,9,13],[58,30,2,13],[9,45,9,13],[63,18,2,9],[64,9,2,-9]],
    [[67,33,1,15],[20,0,10,15],[36,67,1,15],[20,15,10,15],[46,67,1,10],[47,77,1,-10]],
    [[31,58,2,13],[18,45,9,13],[33,58,2,13],[27,45,9,13],[64,27,2,9],[64,45,2,-9]],
    [[37,67,1,15],[0,30,10,15],[38,67,1,15],[30,0,10,15],[48,67,1,10],[49,77,1,-10]]]},
  {tier:1,suffix:'3',uv:[
    [[0,58,6,15],[58,15,3,15],[58,0,6,15],[18,58,3,15],[64,9,6,3],[64,15,6,-3]],
    [[60,30,2,13],[49,0,9,13],[60,43,2,13],[49,13,9,13],[64,45,2,9],[62,73,2,-9]],
    [[39,67,1,15],[10,30,10,15],[40,67,1,15],[30,15,10,15],[50,67,1,10],[51,77,1,-10]],
    [[60,56,2,13],[49,26,9,13],[61,15,2,13],[49,39,9,13],[64,64,2,9],[65,27,2,-9]],
    [[40,67,-1,15],[40,15,-10,15],[41,67,-1,15],[20,30,-10,15],[51,67,-1,10],[52,77,-1,-10]]]}
]
const geo = {format_version:'1.12.0','minecraft:geometry':[{description:{texture_width:128,texture_height:128},bones:groups.flatMap(({tier,suffix:s,uv})=>[
  {name:`tier${tier}`,pivot:[0,0,0],cubes:[cube([-3,-.05,4],[6,15.1,3],uv[0])]},
  {name:`left_side${s}`,parent:`tier${tier}`,pivot:[0,1,4],cubes:[cube([-2,1,-5],[2,13,9],uv[1])]},
  {name:`left_cover${s}`,parent:`left_side${s}`,pivot:[0,0,0],cubes:[cube([-3,0,-6],[1,15,10],uv[2])]},
  {name:`right_side${s}`,parent:`tier${tier}`,pivot:[0,0,4],cubes:[cube([0,1,-5],[2,13,9],uv[3])]},
  {name:`right_cover${s}`,parent:`right_side${s}`,pivot:[0,0,4],cubes:[cube([2,0,-6],[1,15,10],uv[4])]}
])}]}
const leaves=['worn_notebook','novice_spell_book','apprentice_spell_book','archmage_spell_book']
const bookGui={rotation:[-159,-62,-135],translation:[-1.25,-4.75,0],scale:[.68,.68,.68]}
const tomeGui={rotation:[0,-129,21],translation:[-1,-4.75,0],scale:[.67,.67,.67]}
const itemPath=leaf=>`assets/ars_nouveau/models/item/${leaf}.json`
const raw=(leaf='novice_spell_book',components='')=>({name:`ars_nouveau:${leaf}`,count:1,snbt:`{id:"ars_nouveau:${leaf}",count:1${components?`,components:{${components}}`:''}}`})
function reader() {
  const assets={...Object.fromEntries(Object.entries(ARS_ITEM_ASSET_HASHES).map(([path,sha256])=>[path,{sha256,bytes:1}])),
    ...Object.fromEntries(leaves.slice(1).map(leaf=>[itemPath(leaf),{sha256:'3a2c58c551cb5b7bd7bd4b8278f2ea3d5a2be71e5166676977bfbc5cc9335bd5',bytes:1}])),
    ...Object.fromEntries(Object.entries(ARS_BOOK_TEXTURE_HASHES).map(([color,sha256])=>[`assets/ars_nouveau/textures/item/spellbook_${color}.png`,{sha256,bytes:1}])),
    'assets/ars_nouveau/textures/item/tattered_tome.png':{sha256:'c04de9e156e65848f88f305a0d4171391f39a3f14002bae6ce6fd8db913a7f2f',bytes:1}}
  return {manifest:{clientJarSha256:BLOCK_ICON_CLIENT_SHA256,sources:Object.entries(ARS_ITEM_SOURCE_HASHES).map(([name,sha256])=>({name,sha256})),assets},
    bytes:async()=>new Uint8Array([1]),json:async path=>structuredClone(path.includes('/geo/')?geo:{parent:'builtin/entity',display:{gui:path===itemPath('worn_notebook')?tomeGui:bookGui}})}
}
const settled=()=>new Promise(resolve=>setImmediate(resolve))
const png=()=>new Blob([new Uint8Array([1])],{type:'image/png'})
function options(observe=()=>{}) {
  return {loadTexture:async()=>new THREE.Texture({width:128,height:128}),
    createRenderer:()=>({clear(){},render:observe,dispose(){},forceContextLoss(){}}),encode:async()=>png()}
}

test('four actual Ars item renderers select native closed meshes, original GUI transform and correct dedicated textures',async()=>{
  for(const [index,leaf] of leaves.entries()){
    assert.equal(nativeArsItemEligible(raw(leaf).name),true)
    const plan=await prepareNativeArsItemIcon(reader(),raw(leaf))
    assert.equal(plan.faces.length,30);assert.equal(plan.tier,[1,1,2,3][index]);assert.equal(plan.animationControllerCount,0)
    assert.equal(plan.geometry,'ars_nouveau:spellbook_closed');assert.equal(plan.originalMaterial,'entityTranslucent')
    assert.deepEqual(plan.guiTransform,{...(index===0?tomeGui:bookGui),translation:(index===0?tomeGui:bookGui).translation.map(n=>n/16)})
    assert.equal(plan.texturePath,`assets/ars_nouveau/textures/item/${index===0?'tattered_tome':'spellbook_purple'}.png`)
    assert.deepEqual(plan.sourcePaths.filter(path=>path.includes('/models/item/')),[itemPath(leaf)])
    assert.ok(!plan.sourcePaths.some(path=>path.endsWith('/worn_notebook.png')||path.endsWith('spellbook.geo.json')))
  }
  for(const name of ['minecraft:book','ars_nouveau:guide_book','ars_nouveau:novice_spell_book/fake',null])assert.equal(nativeArsItemEligible(name),false)
})

test('all native dye component names choose original color PNGs and complete spell_caster state is retained',async()=>{
  const caster='"ars_nouveau:spell_caster":{slot:0,spells:[{name:"Heal",recipe:["ars_nouveau:touch","ars_nouveau:heal"]}],color:{type:"constant",red:0.2f,green:0.4f,blue:0.8f}}'
  for(const color of Object.keys(ARS_BOOK_TEXTURE_HASHES)){
    const parsed=parseNativeItemStack(raw('archmage_spell_book',`"minecraft:base_color":"${color}",${caster}`))
    const plan=await prepareNativeArsItemIcon(reader(),parsed)
    assert.strictEqual(plan.stack,parsed);assert.strictEqual(plan.stack.components['ars_nouveau:spell_caster'],parsed.components['ars_nouveau:spell_caster'])
    assert.equal(plan.texturePath,`assets/ars_nouveau/textures/item/spellbook_${color}.png`)
  }
  const removed=nativeArsItemState(raw('novice_spell_book','"!minecraft:base_color":{}'))
  assert.equal(removed.color,'purple')
  assert.equal(nativeArsItemState(raw('worn_notebook','"minecraft:base_color":"red"')).texturePath,'assets/ars_nouveau/textures/item/tattered_tome.png')
})

test('original Gecko signed face UV and mirror-X vertex order survive each five-bone tier subtree',()=>{
  for(const tier of [1,2,3]){
    const faces=bakeNativeArsGeoFaces(geo,tier)
    assert.equal(faces.length,30);assert.equal(new Set(faces.map(face=>face.bone)).size,5)
    assert.ok(faces.some(face=>face.bone===`tier${tier}`));assert.ok(!faces.some(face=>/^tier/.test(face.bone)&&face.bone!==`tier${tier}`))
  }
  const faces=bakeNativeArsGeoFaces(geo,1),face=faces.find(face=>face.bone==='right_cover3'&&face.direction==='down')
  assert.deepEqual(face.uv,[51/128,1-77/128,52/128,1-77/128,52/128,1-67/128,51/128,1-67/128])
  assert.deepEqual(face.normal,[0,-1,0]);assert.deepEqual(face.indices,[0,1,2,0,2,3])
  assert.deepEqual(face.position,[-3/16,0,-6/16,-2/16,0,-6/16,-2/16,0,4/16,-3/16,0,4/16])
  const root=faces.find(face=>face.bone==='tier1'&&face.direction==='west')
  assert.equal(root.position[0],-3/16);assert.equal(root.position[2],7/16)
})

test('malformed, excessive, cyclic and unported geometry fails before unbounded allocations',()=>{
  const mutate=(change,pattern)=>{const bad=structuredClone(geo);change(bad['minecraft:geometry'][0]);assert.throws(()=>bakeNativeArsGeoFaces(bad,1),pattern)}
  mutate(g=>g.bones=Array(65).fill(g.bones[0]),/GEO_LIMIT/)
  mutate(g=>g.bones[0].cubes=Array(129).fill(g.bones[0].cubes[0]),/BONE_UNSUPPORTED/)
  mutate(g=>g.bones[10].parent='left_side3',/PARENT_INVALID/)
  mutate(g=>g.bones[10].parent='missing',/PARENT_INVALID/)
  mutate(g=>g.bones[10].cubes[0].origin=[Infinity,0,0],/CUBE_UNSUPPORTED/)
  mutate(g=>g.bones[10].cubes[0].mirror=true,/CUBE_UNSUPPORTED/)
  mutate(g=>g.bones[10].cubes[0].uv.up.uv_size=[1e100,1],/UV_UNSUPPORTED/)
  assert.throws(()=>bakeNativeArsGeoFaces(geo,4),/GEO_UNSUPPORTED/)
})

test('unknown/foil/dynamic/ambiguous component states reject without stripping real item identity',()=>{
  const cases=[['"minecraft:custom_model_data":1',/COMPONENT_UNSUPPORTED/],['"foreign:state":{}',/COMPONENT_UNSUPPORTED/],
    ['"minecraft:base_color":"red","!minecraft:base_color":{}',/PATCH_INVALID/],['"!minecraft:base_color":1',/PATCH_INVALID/],
    ['"minecraft:base_color":4',/COLOR_UNSUPPORTED/],['"minecraft:enchantment_glint_override":1b',/GLINT_UNSUPPORTED/],
    ['"minecraft:enchantment_glint_override":{type:"byte",value:0}',/GLINT_STATE_INVALID/],
    ['"minecraft:enchantments":{levels:{"minecraft:unbreaking":1}}',/GLINT_UNSUPPORTED/],
    ['"minecraft:stored_enchantments":{levels:{"minecraft:mending":1}}',/GLINT_UNSUPPORTED/]]
  for(const [components,error] of cases)assert.throws(()=>nativeArsItemState(raw('novice_spell_book',components)),error)
  assert.equal(nativeArsItemState(raw('novice_spell_book','"minecraft:enchantment_glint_override":false,"minecraft:enchantments":{levels:{"minecraft:unbreaking":1}}')).leaf,'novice_spell_book')
  for(const bad of [{name:raw().name,count:1},{...raw(),snbt:'{id:"minecraft:book",count:1}'},{...raw(),snbt:`{id:"${raw().name}",count:1,unknown:1}`}])assert.throws(()=>nativeArsItemState(bad),/NATIVE_ITEM_STACK/)
})

test('locked client/mod/source/asset guards require unique non-override evidence and retain priority errors',async()=>{
  const check=async(change,error)=>{const r=reader();change(r);await assert.rejects(prepareNativeArsItemIcon(r,raw()),error)}
  await check(r=>r.manifest.clientJarSha256='other',/CLIENT_UNVERIFIED/)
  await check(r=>r.manifest.sources[0].sha256='other',/SOURCE_UNVERIFIED/)
  await check(r=>r.manifest.sources.push({...r.manifest.sources[0],sha256:'old'}),/SOURCE_UNVERIFIED/)
  await check(r=>r.manifest.sources[0].explicitOverride=true,/SOURCE_UNVERIFIED/)
  await check(r=>r.manifest.assets[itemPath('novice_spell_book')].sha256='other',/ASSET_UNSUPPORTED/)
  await check(r=>r.manifest.assets['assets/ars_nouveau/textures/item/spellbook_purple.png.mcmeta']={},/ANIMATION_UNSUPPORTED/)
  await check(r=>r.bytes=async()=>{throw Error('NATIVE_RESOURCE_PRIORITY_UNRESOLVED')},/PRIORITY_UNRESOLVED/)
  await check(r=>r.json=async()=>({parent:'builtin/entity',overrides:[{}]}),/MODEL_UNSUPPORTED/)
})

test('closed GUI mesh retains original transform and float translation, flat diffuse lights and translucent material',async()=>{
  const plan=await prepareNativeArsItemIcon(reader(),raw()),texture=new THREE.Texture(),object=buildNativeArsItemObject(plan,texture)
  const content=object.children[0];assert.equal(content.children.length,30)
  assert.equal(content.position.y,Math.fround(.51)-.5);assert.equal(object.rotation.order,'XYZ')
  assert.deepEqual(object.position.toArray(),[-1.25/16,-4.75/16,0]);assert.deepEqual(object.scale.toArray(),[.68,.68,.68])
  const mesh=content.children[0],material=mesh.material
  assert.equal(material.side,THREE.DoubleSide);assert.equal(material.transparent,true);assert.equal(material.depthWrite,true);assert.equal(material.forceSinglePass,true)
  assert.match(material.vertexShader,/n\.y=-n\.y/);assert.match(material.fragmentShader,/c\.a<0\.1/)
  assert.match(material.vertexShader,/0\.6\+0\.4/)
  const matrix=new THREE.Matrix4().makeRotationY(-.3926991).multiply(new THREE.Matrix4().makeRotationX(2.3561945))
  assert.deepEqual(ARS_GUI_LIGHT_DIRECTIONS[0],new THREE.Vector3(.2,1,-.7).normalize().transformDirection(matrix).toArray())
  assert.equal(new Set(content.children.map(mesh=>mesh.renderOrder)).size,30)
  const z=content.children.map(mesh=>({order:mesh.renderOrder,z:new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,0)
    .add(new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,2)).multiplyScalar(.5).applyMatrix4(mesh.matrixWorld).z})).sort((a,b)=>a.order-b.order)
  assert.ok(z.every((p,i)=>i===0||p.z>=z[i-1].z-1e-7))
  let disposed=0;material.addEventListener('dispose',()=>disposed++);disposeNativeArsItemObject(object);assert.equal(disposed,1);texture.dispose()
})

test('lazy single renderer serializes native meshes and preserves provenance without claiming pixel parity',async()=>{
  let created=0,rendered=0,encoded=0,freed=0
  const opts=options((scene,camera)=>{rendered++;assert.equal(scene.children[0].children[0].children.length,30)
    assert.deepEqual([camera.left,camera.right,camera.top,camera.bottom],[-.5,.5,.5,-.5]);assert.equal(camera.position.z,10)})
  const factory=opts.createRenderer;opts.createRenderer=()=>{created++;const r=factory();r.dispose=()=>freed++;return r}
  opts.encode=async()=>{encoded++;await settled();return png()}
  const renderer=new NativeArsItemIconRenderer(reader(),opts);assert.equal(created,0)
  const result=await Promise.all(leaves.map(leaf=>renderer.render(raw(leaf))))
  assert.equal(created,1);assert.equal(rendered,4);assert.equal(encoded,4)
  for(const [index,icon] of result.entries()){assert.equal(icon.kind,'native-ars-gui');assert.equal(icon.pixelParityVerified,false);assert.ok(icon.sourcePaths.includes(itemPath(leaves[index])));assert.equal(icon.blob.type,'image/png')}
  renderer.dispose();renderer.dispose();assert.equal(freed,1);await assert.rejects(renderer.render(raw()),/DISPOSED/)
})

test('dispose during post-prepare bytes never starts texture decoding or creates WebGL',async()=>{
  const r=reader(),original=r.bytes;let pngReads=0,finish,decodes=0,created=0
  r.bytes=path=>path.endsWith('.png')&&++pngReads===2?new Promise(resolve=>finish=resolve):original(path)
  const renderer=new NativeArsItemIconRenderer(r,{...options(),loadTexture:async()=>{decodes++;return new THREE.Texture({width:128,height:128})},createRenderer:()=>{created++;return {}}})
  const pending=renderer.render(raw());await settled();assert.equal(typeof finish,'function');renderer.dispose();finish(new Uint8Array([1]))
  await assert.rejects(pending,/DISPOSED/);assert.equal(decodes,0);assert.equal(created,0)
})

test('dispose during texture decode releases late texture and prevents a scene render',async()=>{
  let finish,freed=0,rendered=0
  const texture=new THREE.Texture({width:128,height:128});texture.addEventListener('dispose',()=>freed++)
  const renderer=new NativeArsItemIconRenderer(reader(),{...options(()=>rendered++),loadTexture:()=>new Promise(resolve=>finish=resolve)})
  const pending=renderer.render(raw());await settled();renderer.dispose();finish(texture)
  await assert.rejects(pending,/DISPOSED/);assert.equal(freed,1);assert.equal(rendered,0)
})

test('dispose during PNG encode suppresses late result and frees every mesh, material and texture',async()=>{
  let finish,geometryFreed=0,materialFreed=0,textureFreed=0
  const opts=options(scene=>scene.traverse(node=>{if(node.isMesh){node.geometry.addEventListener('dispose',()=>geometryFreed++)}}))
  opts.loadTexture=async()=>{const t=new THREE.Texture({width:128,height:128});t.addEventListener('dispose',()=>textureFreed++);return t}
  const render=opts.createRenderer;opts.createRenderer=()=>{const r=render(),original=r.render;r.render=(scene,camera)=>{scene.children[0].children[0].children[0].material.addEventListener('dispose',()=>materialFreed++);original(scene,camera)};return r}
  opts.encode=()=>new Promise(resolve=>finish=resolve)
  const renderer=new NativeArsItemIconRenderer(reader(),opts),pending=renderer.render(raw());await settled();renderer.dispose();finish(png())
  await assert.rejects(pending,/DISPOSED/);assert.equal(geometryFreed,30);assert.equal(materialFreed,1);assert.equal(textureFreed,1)
})

test('wrong texture dimensions or failed source never become a guessed book icon',async()=>{
  let created=0,disposed=0
  const texture=new THREE.Texture({width:16,height:16});texture.addEventListener('dispose',()=>disposed++)
  const renderer=new NativeArsItemIconRenderer(reader(),{...options(),loadTexture:async()=>texture,createRenderer:()=>{created++;return {}}})
  await assert.rejects(renderer.render(raw()),/TEXTURE_SIZE_INVALID/);assert.equal(disposed,1);assert.equal(created,0);renderer.dispose()
  const bad=reader();bad.bytes=async()=>{throw Error('NATIVE_ASSET_HASH_MISMATCH')}
  const failed=new NativeArsItemIconRenderer(bad,{...options(),createRenderer:()=>{created++;return {}}})
  await assert.rejects(failed.render(raw()),/HASH_MISMATCH/);assert.equal(created,0);failed.dispose()
})
