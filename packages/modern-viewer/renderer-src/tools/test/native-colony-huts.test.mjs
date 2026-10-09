import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { NATIVE_COLONY_HUT_SOURCE, NATIVE_COLONY_HUTS, nativeColonyHutEligible,
  verifyNativeColonyHutSource, prepareNativeColonyHutModel } from '../../src/native-viewer/native-colony-huts.js'
import { NativeAssetReader, NativeModelLoader } from '../../src/native-viewer/model-loader.js'

const CLIENT = { name:'minecraft-1.21.1-client.jar', sha256:'499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99' }
const state = { name:'minecolonies:blockhuttownhall', stateId:74672, renderShape:'MODEL', hasBlockEntity:true, properties:{facing:'north'} }
const proof = NATIVE_COLONY_HUTS.find(value=>value.id===state.name)
const modelId = state.name.replace(':',':block/')
const png = 'assets/minecolonies/textures/block/books/booktexture_yellow.png'
function fixture () {
  const manifest = { minecraftVersion:'1.21.1', assetIntegrityVerified:true, clientJarSha256:CLIENT.sha256,
    sources:[CLIENT,NATIVE_COLONY_HUT_SOURCE], assets:{
      [proof.blockstate.path]:{...proof.blockstate,source:NATIVE_COLONY_HUT_SOURCE.name},
      [proof.model.path]:{...proof.model,source:NATIVE_COLONY_HUT_SOURCE.name}, [png]:{source:NATIVE_COLONY_HUT_SOURCE.name}
    } }
  const blockstate={variants:Object.fromEntries(Object.entries(proof.rotations).map(([facing,rotation])=>[`facing=${facing}`,{model:modelId,...rotation}]))}
  const model={textures:{all:'minecolonies:block/books/booktexture_yellow'},elements:[{from:[0,0,0],to:[16,16,16],faces:{north:{uv:[2,3,12,13],texture:'#all'}}}]}
  const documents=new Map([[proof.blockstate.path,blockstate],[proof.model.path,model]]), reads=[]
  return {manifest,documents,reads,async bytes(path){reads.push(path);if(manifest.assets[path]?.variants?.length)throw Error(`NATIVE_RESOURCE_PRIORITY_UNRESOLVED:${path}`);return new Uint8Array(1)},async json(path){await this.bytes(path);return documents.get(path)}}
}

test('only source-proven concrete empty-renderer huts are eligible; specialized BE and invented namespace matches stay closed',()=>{
  assert.equal(NATIVE_COLONY_HUTS.length,48)
  for(const row of NATIVE_COLONY_HUTS){assert.equal(nativeColonyHutEligible({name:row.id}),true);assert.match(row.classSha256,/^[0-9a-f]{64}$/);assert.equal(Object.isFrozen(row),true)}
  assert.equal(NATIVE_COLONY_HUTS.filter(value=>value.weighted).length,1)
  for(const name of ['minecolonies:blockhutenchanter','minecolonies:blockhutwarehouse','minecolonies:blockhutunknown','minecolonies:blockstash','minecolonies:blockpostbox','create:millstone','minecraft:chest'])assert.equal(nativeColonyHutEligible({name}),false)
  assert.throws(()=>{proof.rotations.north.y=0},TypeError)
})

test('unique locked client/JAR sources and actual native state are required before any asset is read',async()=>{
  for(const alter of [r=>r.manifest.sources.push({...NATIVE_COLONY_HUT_SOURCE}),r=>r.manifest.sources[1]={...NATIVE_COLONY_HUT_SOURCE,explicitOverride:true},r=>r.manifest.sources[1]={...NATIVE_COLONY_HUT_SOURCE,sha256:'0'.repeat(64)},r=>r.manifest.sources=[],r=>r.manifest.clientJarSha256='0'.repeat(64)]){
    const reader=fixture();alter(reader);assert.throws(()=>verifyNativeColonyHutSource(reader),/UNVERIFIED/);assert.equal(reader.reads.length,0)
  }
  for(const wrong of [{...state,name:'minecolonies:blockhutenchanter'},{...state,hasBlockEntity:false},{...state,renderShape:'ENTITYBLOCK_ANIMATED'},{...state,stateId:-1},{...state,properties:{facing:'up'}},{...state,properties:{facing:'north',waterlogged:true}}]){
    const reader=fixture();await assert.rejects(prepareNativeColonyHutModel(reader,wrong),/STATE_UNSUPPORTED/);assert.equal(reader.reads.length,0)
  }
})

test('original townhall rotation/UV/source provenance are preserved; native position/state cannot choose a convenient replacement variant',async()=>{
  const reader=fixture(),plan=await prepareNativeColonyHutModel(reader,state)
  assert.deepEqual(plan.variants,[{model:modelId,y:270}]);assert.equal(plan.faces.length,1)
  assert.deepEqual(plan.faces[0].uv,[2/16,13/16,2/16,3/16,12/16,3/16,12/16,13/16])
  assert.ok(plan.sourcePaths.includes(png));assert.equal(plan.blockEntityRendererEmpty,true);assert.equal(plan.blueprintPreviewAvailable,false);assert.equal(plan.pixelParityVerified,false)
  const changed=fixture();changed.documents.get(proof.blockstate.path).variants['facing=north'].y=0
  await assert.rejects(prepareNativeColonyHutModel(changed,state),/VARIANTS_UNVERIFIED/)
  const home=fixture();await assert.rejects(prepareNativeColonyHutModel(home,{...state,name:'minecolonies:blockhutcitizen'}),/WEIGHTED_BLOCK_SEED_UNVERIFIED/);assert.equal(home.reads.length,0)
})

test('model fingerprints, unknown custom loaders/tint and unresolved texture priority never become a hut proxy',async()=>{
  const changed=fixture();changed.manifest.assets[proof.model.path].sha256='0'.repeat(64)
  await assert.rejects(prepareNativeColonyHutModel(changed,state),/ASSET_UNVERIFIED/)
  const loader=fixture();loader.documents.get(proof.model.path).loader='neoforge:obj'
  await assert.rejects(prepareNativeColonyHutModel(loader,state),/MODEL_LOADER_UNSUPPORTED/)
  const tinted=fixture();tinted.documents.get(proof.model.path).elements[0].faces.north.tintindex=0
  await assert.rejects(prepareNativeColonyHutModel(tinted,state),/TINT/)
  const priority=fixture();priority.manifest.assets[png].variants=[{sha256:'0'.repeat(64)}]
  await assert.rejects(prepareNativeColonyHutModel(priority,state),new RegExp(`NATIVE_RESOURCE_PRIORITY_UNRESOLVED:${png}`))
})

test('actual v5 class-bound model audit stays finite and preserves every genuine resource/loader/seed refusal',{
  skip:!process.env.NATIVE_COLONY_ASSET_DIR
},async()=>{
  const {readFile}=await import('node:fs/promises'),{join}=await import('node:path')
  const dir=process.env.NATIVE_COLONY_ASSET_DIR, manifest=JSON.parse(await readFile(join(dir,'native-assets.json'),'utf8'))
  const reader=new NativeAssetReader(manifest,path=>readFile(join(dir,path)))
  const states=(await readFile(join(dir,'registry/block-states.jsonl'),'utf8')).trim().split('\n').map(value=>JSON.parse(value))
  const ready=[],rejected=[]
  for(const row of NATIVE_COLONY_HUTS){
    const current=states.find(value=>value.name===row.id&&value.properties.facing==='north');assert.ok(current,row.id)
    try{const plan=await prepareNativeColonyHutModel(reader,current);ready.push({id:row.id,faces:plan.faces.length});assert.equal(plan.pixelParityVerified,false)}
    catch(error){rejected.push({id:row.id,reason:error.message})}
  }
  assert.deepEqual(ready.map(value=>value.id),['blockhutbaker','blockhutblacksmith','blockhutcrusher','blockhutmechanic','blockhutplantation','blockhutsifter','blockhutsmeltery','blockhutstable','blockhutstonemason','blockhuttavern'].map(leaf=>'minecolonies:'+leaf))
  assert.equal(rejected.filter(value=>value.reason.startsWith('NATIVE_RESOURCE_PRIORITY_UNRESOLVED')).length,18)
  assert.equal(rejected.filter(value=>value.reason.startsWith('NATIVE_MODEL_LOADER_UNSUPPORTED')).length,17)
  assert.equal(rejected.filter(value=>value.reason.startsWith('NATIVE_ASSET_MISSING')).length,2)
  assert.equal(rejected.filter(value=>value.reason==='NATIVE_WEIGHTED_BLOCK_SEED_UNVERIFIED').length,1)
  for(const id of ['minecolonies:blockhuttownhall','minecolonies:blockhutbuilder'])assert.equal(rejected.find(value=>value.id===id).reason,'NATIVE_RESOURCE_PRIORITY_UNRESOLVED:assets/minecraft/textures/block/oak_planks.png')
  assert.equal(ready.find(value=>value.id==='minecolonies:blockhutbaker').faces,107)
  // Original verified baker hut loads through the existing world loader and
  // releases geometry. No WebGL/context or live Minecraft connection is made.
  const baker=states.find(value=>value.name==='minecolonies:blockhutbaker'&&value.properties.facing==='north')
  const plan=await prepareNativeColonyHutModel(reader,baker),modelLoader=new NativeModelLoader(reader,async bytes=>{
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
    return new THREE.Texture({width:view.getUint32(16),height:view.getUint32(20)})
  })
  const root=await modelLoader.models(plan.variants);let count=0;root.traverse(mesh=>{if(mesh.isMesh){count++;assert.ok(mesh.userData.originalTexture)}})
  assert.equal(count,107);modelLoader.releaseModel(root);assert.equal(modelLoader.geometries.size,0);await modelLoader.dispose()
})
