import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as THREE from 'three'
import { unzipSync } from 'fflate'
import { NativeAssetReader } from '../../src/native-viewer/model-loader.js'
import { createNativeEntityMotion } from '../../src/native-viewer/native-entity-motion.js'
import { createNativeModelPart } from '../../src/native-viewer/native-entity-model.js'
import { createNativeBedrockModel } from '../../src/native-viewer/native-entity-model-bedrock.js'
import { createNativeEntityActor } from '../../src/native-viewer/native-entity-dispatch.js'
import { WANDSCAPE_NPC, nativeWandscapeRenderState, wandscapeModelDefinition } from '../../src/native-viewer/native-entity-dispatch-wandscape.js'
function entity(metadata=[]) {const e={entityId:205,uuid:'78b6f5b0-1478-45d8-8f66-34748ae6d934',name:WANDSCAPE_NPC,position:{x:4,y:180,z:4},yaw:0,pitch:0,headYaw:0,spawnedAt:Date.now(),metadata,equipment:[],cues:[]};e.motion=createNativeEntityMotion(e).current();return e}
test('Wandscape native typed fields are distinct from TLM and reject incompatible state',()=>{
  const e=entity([{key:16,type:1,value:2},{key:17,type:1,value:-16711936},{key:18,type:8,value:true},{key:21,type:4,value:'wandscape:beam'}])
  assert.equal(nativeWandscapeRenderState(e).skin,2);assert.equal(nativeWandscapeRenderState(e).casting,true)
  assert.throws(()=>nativeWandscapeRenderState(entity([{key:16,type:4,value:'2'}])),/METADATA_INVALID/)
  assert.throws(()=>nativeWandscapeRenderState({...e,equipment:[{slot:0,item:{itemCount:1,itemId:1}}]}),/HELD_ITEM_LAYER_UNSUPPORTED/)
  assert.throws(()=>nativeWandscapeRenderState(entity([{key:6,type:21,value:2}])),/POSE_OR_FIRE_UNSUPPORTED/)
})
test('actual exported wizard PNGs and native metadata drive the actor',{skip:!process.env.NATIVE_WANDSCAPE_ASSET_DIR},async()=>{
  const dir=process.env.NATIVE_WANDSCAPE_ASSET_DIR,manifest=JSON.parse(await fs.readFile(path.join(dir,'native-assets.json'),'utf8'))
  const reader=new NativeAssetReader(manifest,key=>fs.readFile(path.join(dir,key))),decode=async bytes=>{const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);return new THREE.Texture({width:v.getUint32(16),height:v.getUint32(20)})}
  const e=entity([{key:16,type:'int',value:2},{key:17,type:'int',value:-16711936}]),actor=await createNativeEntityActor(reader,e,{loadTexture:decode})
  assert.equal(actor.assetInfo.sourcePaths[0],Object.keys(manifest.assets).filter(k=>/^assets\/wandscape\/textures\/entity\/wizard\/[^/]+\.png$/.test(k)).sort()[2])
  assert.equal(actor.root.children[0].children[0].children.length,3)
  actor.update(e,e.motion.sampledAt);assert.deepEqual(actor.root.position.toArray(),[4,180,4])
  assert.throws(()=>actor.update({...e,uuid:'wrong'}),/IDENTITY_MISMATCH/)
  assert.throws(()=>actor.update({...e,motion:{...e.motion,bodyYaw:NaN}}),/MOTION_UNAVAILABLE/)
  actor.dispose();assert.equal(actor.root.children.length,0)
})
function vertices(root) {
  root.updateMatrixWorld(true);const rows=[]
  root.traverse(object=>{if(!object.isMesh)return;const a=object.geometry.attributes.position,uv=object.geometry.attributes.uv;for(let i=0;i<a.count;i++){const v=new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(object.matrixWorld);rows.push([...v.toArray(),uv.getX(i),uv.getY(i)])}})
  return rows
}
test('delivered Bedrock wizard geometry and UVs equal original Java ModelPart layers',{skip:!process.env.NATIVE_WANDSCAPE_BEDROCK_PACK},async()=>{
  const pack=unzipSync(await fs.readFile(process.env.NATIVE_WANDSCAPE_BEDROCK_PACK)),material=new THREE.MeshBasicMaterial()
  for(const layer of ['body','edge','tint']){
    const definition=JSON.parse(new TextDecoder().decode(pack[`models/entity/maw/wandscape_${layer}.geo.json`]))
    const java=createNativeModelPart(wandscapeModelDefinition(layer),material,[64,64]),bedrock=createNativeBedrockModel(definition,material)
    // Shared Bedrock loader already applies the original 24-pixel Y origin.
    const actual=vertices(bedrock.root),expected=vertices(java.root);assert.equal(actual.length,expected.length)
    // Both original ports use Float32 buffers, with a different order of
    // multiply/add operations. Do not round half-way values to a decimal grid.
    for(const vertex of expected){const index=actual.findIndex(row=>row.every((n,i)=>Math.abs(n-vertex[i])<=2e-7));assert.ok(index>=0,`${layer}: missing original position/UV ${vertex}`);actual.splice(index,1)}
    java.dispose();bedrock.dispose()
  }
  material.dispose()
})
