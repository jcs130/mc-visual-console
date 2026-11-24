import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as THREE from 'three'
import { createHash } from 'node:crypto'
import { createMaidAppearanceSource } from '../../host/maid-appearance-source.mjs'
import { originalMaidGeometry, readMaidBundle, createPaperMaidActor, animatePaperMaid, batchMaidGeometry } from '../../src/native-viewer/native-paper-maid.js'
import { createNativeBedrockModel } from '../../src/native-viewer/native-entity-model-bedrock.js'
import { NativeEntityPresentation } from '../../src/native-viewer/native-entity-presentation.js'
import { nativeEntityCoverage } from '../../src/native-viewer/native-entity-coverage.js'

const directory=process.env.TLM_MAID_ASSETS
const sha=b=>createHash('sha256').update(b).digest('hex')
test('legacy Bedrock envelope preserves every source bone and fractional coordinate',()=>{
  const bones=[{name:'head',pivot:[0,18,0],cubes:[{origin:[-.2,1,2],size:[.2,3,0],uv:[0,0]}]}]
  const converted=originalMaidGeometry({format_version:'1.10.0','geometry.model':{texturewidth:128,textureheight:128,bones}})
  assert.equal(converted['minecraft:geometry'][0].bones,bones)
  assert.throws(()=>originalMaidGeometry({format_version:'1.10.0','geometry.one':{},'geometry.two':{}}),/UNSUPPORTED/)
})
test('unregistered original model remains unavailable', {skip:!directory},async()=>{
  const catalog=await fs.readFile(path.join(directory,'catalog.json')),source=await createMaidAppearanceSource({directory,catalogSha256:sha(catalog)})
  assert.equal(source.binding({available:true,modelId:'random:maid'}).reason,'TLM_MODEL_NOT_REGISTERED')
  assert.equal(source.binding({available:true,ysm:true,modelId:'authors_and_credits:clocklalier'}).reason,'TLM_YSM_SOURCE_REQUIRED')
  await assert.rejects(createMaidAppearanceSource({directory,catalogSha256:'a'.repeat(64)}),/HASH_MISMATCH/)
})
for(const modelId of ['authors_and_credits:clocklalier','authors_and_credits:wine_fox_maid','touhou_little_maid:hakurei_reimu']){
  test('original '+modelId+' resources, animated rig and bounded draw calls',{skip:!directory},async()=>{
    const catalog=await fs.readFile(path.join(directory,'catalog.json')),source=await createMaidAppearanceSource({directory,catalogSha256:sha(catalog)})
    const row={available:true,modelId};await Promise.all([source.prepare([row]),source.prepare([row])]);const ref=source.binding(row)
    assert.equal(ref.available,true)
    let requests=0
    const resource=await readMaidBundle(ref,{resolveUrl:u=>u,fetcher:async()=>{requests++;return new Response(source.read(ref.bundleSha256))}})
    await readMaidBundle(ref,{fetcher:()=>assert.fail('original immutable model fetched twice')});assert.equal(requests,1)
    const geometry=resource.geometry['minecraft:geometry'][0]
    const texture=new THREE.DataTexture(new Uint8Array(geometry.description.texture_width*geometry.description.texture_height*4),geometry.description.texture_width,geometry.description.texture_height)
    const uuid='12345678-1234-5678-1234-567812345678',state={modelId,ageTicks:0,bodyYaw:0,headYaw:0,pitch:0,health:20,backpack:'touhou_little_maid:empty',task:'touhou_little_maid:idle'}
    const entity={entityId:11,uuid,name:'touhou_little_maid:maid',position:{x:4,y:60,z:8},metadata:[],equipment:[],paperMaid:{source:'paper_tracked_maids',uuid,entityId:11,state,asset:ref}}
    const actor=await createPaperMaidActor(null,entity,{readBundle:async()=>resource,loadMaidTexture:async()=>texture})
    actor.update(entity,1000);assert.equal(actor.root.position.y,60);assert.equal(actor.assetInfo.modelId,modelId)
    assert.equal(actor.assetInfo.originalTexture,true);assert.equal(actor.assetInfo.completeEntityParityVerified,false)
    assert.ok(actor.assetInfo.drawCalls<100,JSON.stringify(actor.assetInfo));assert.ok(actor.assetInfo.cubeCount>25)
    assert.deepEqual(actor.assetInfo.issues,[])
    actor.update({...entity,paperMaid:{...entity.paperMaid,state:{...state,sitting:true}}},1050)
    assert.equal(actor.model.bones.get('legLeft').rotation.x,Math.fround(-1.134))
    actor.update({...entity,paperMaid:{...entity.paperMaid,state:{...state,ageTicks:20}},motion:{sampledAt:1100,position:entity.position,walk:{speedOld:1,speed:1,position:2}}},1100)
    assert.notEqual(actor.model.bones.get('legLeft').rotation.x,0)
    assert.throws(()=>actor.update({...entity,uuid:'22345678-1234-5678-1234-567812345678'}),/IDENTITY/)
    actor.dispose();actor.dispose();assert.equal(actor.root.children.length,0)
  })
}
test('static face batching preserves triangle positions while retaining bone animation',()=>{
  const geometry={format_version:'1.12.0','minecraft:geometry':[{description:{texture_width:16,texture_height:16},bones:[{name:'body',pivot:[0,0,0],cubes:[{origin:[0,0,0],size:[1,2,3],uv:[0,0],rotation:[20,10,0],pivot:[1,1,1]}]}]}]}
  const material=new THREE.MeshBasicMaterial(),model=createNativeBedrockModel(geometry,material)
  const before=[];model.root.updateMatrixWorld(true)
  model.root.traverse(o=>{if(o.isMesh)for(let i=0;i<o.geometry.attributes.position.count;i++)before.push(new THREE.Vector3().fromBufferAttribute(o.geometry.attributes.position,i).applyMatrix4(o.matrixWorld))})
  const batch=batchMaidGeometry(model,material),after=[];model.root.updateMatrixWorld(true)
  model.root.traverse(o=>{if(o.isMesh)for(let i=0;i<o.geometry.attributes.position.count;i++)after.push(new THREE.Vector3().fromBufferAttribute(o.geometry.attributes.position,i).applyMatrix4(o.matrixWorld))})
  assert.equal(after.length,before.length);for(let i=0;i<before.length;i++)assert.ok(before[i].distanceTo(after[i])<1e-7)
  assert.equal(batch.drawCalls,1);batch.dispose();model.dispose();material.dispose()
})

test('maid facing follows the same received jitter buffer across the yaw boundary',()=>{
  const buffer=new NativeEntityPresentation(200),uuid='12345678-1234-5678-1234-567812345678'
  const frame=(x,yaw,age)=>({uuid,entityId:1,position:{x,y:0,z:0},motion:{position:{x,y:0,z:0},previous:{position:{x:x-1,y:0,z:0}},bodyYaw:yaw,headYaw:yaw,pitch:0,walk:{position:age,speed:1}},
    paperMaid:{uuid,asset:{bundleSha256:'a'.repeat(64)},state:{bodyYaw:yaw,headYaw:yaw,pitch:0,ageTicks:age}}})
  const a=frame(0,170,10),b=frame(2,-170,14);buffer.push(a,1000);buffer.push(b,1200)
  const value=buffer.sample(b,1300);assert.equal(value.position.x,1);assert.equal(value.paperMaid.state.bodyYaw,180);assert.equal(value.paperMaid.state.ageTicks,12);assert.equal(b.paperMaid.state.bodyYaw,-170)
  assert.equal(buffer.sample(b,2000).paperMaid.state.ageTicks,14,'no future pose prediction')
})
test('maid diagnostics require a rendered original actor before claiming geometry support',()=>{
 assert.equal(nativeEntityCoverage('touhou_little_maid:maid').geometry,'unavailable')
 const value=nativeEntityCoverage('touhou_little_maid:maid',{source:'tlm-original',originalGeometry:true,originalTexture:true,modelId:'authors_and_credits:clocklalier',issues:[]})
 assert.equal(value.geometry,'original_TLM_geometry_integrated');assert.equal(value.scene,'unverified')
})
