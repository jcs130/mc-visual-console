import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { nativeBearingOrientation, nativeBearingContraption } from '../../src/native-viewer/native-windmill-bearing.js'
import { NativeAssetReader, NativeModelLoader } from '../../src/native-viewer/model-loader.js'
import { createKineticActor } from '../../src/native-viewer/create-kinetics.js'
const directions={east:[1,0,0],west:[-1,0,0],up:[0,1,0],down:[0,-1,0],south:[0,0,1],north:[0,0,-1]}
const state=facing=>({name:'create:windmill_bearing',stateId:42,properties:{facing},hasBlockEntity:true,renderShape:'MODEL'})
test('the original bearing top UP face follows all six native facing orientations',()=>{
  for(const[facing,vector]of Object.entries(directions)){
    const actual=new THREE.Vector3(0,1,0).applyQuaternion(nativeBearingOrientation(facing))
    assert.ok(actual.distanceTo(new THREE.Vector3(...vector))<1e-12,facing)
  }
  assert.throws(()=>nativeBearingOrientation('bad'),/FACING/)
})
test('bearing cannot take the angle of an unrelated or ambiguous rotating entity',()=>{
  assert.throws(()=>nativeBearingContraption(state('up'),{x:1,y:2,z:3},[]),/BINDING/)
  const entity={contraptionRenderState:{rotationAxis:'y',anchor:{x:1,y:3,z:3}}}
  assert.throws(()=>nativeBearingContraption(state('up'),{x:1,y:2,z:3},[entity,entity]),/BINDING/)
})
test('installed assets render the original bearing body, shaft half, wooden top and sail textures',{
  skip:!process.env.NATIVE_DEVICE_ASSET_DIR
},async()=>{
  const{readFile}=await import('node:fs/promises'),{join}=await import('node:path'),dir=process.env.NATIVE_DEVICE_ASSET_DIR
  const manifest=JSON.parse(await readFile(join(dir,'native-assets.json'),'utf8'))
  const reader=new NativeAssetReader(manifest,p=>readFile(join(dir,p))),textures=[]
  const loader=new NativeModelLoader(reader,async bytes=>{
    const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),texture=new THREE.Texture({width:data.getUint32(16),height:data.getUint32(20)})
    textures.push(texture);return texture
  })
  const s=state('south'),position={x:-395,y:66,z:415}
  const body=await loader.block(s,position),actor=await createKineticActor(loader,s,position)
  assert.equal(actor.staticBodyRenderedSeparately,true);assert.equal(actor.root.children.length,2)
  actor.setSpeed(1);actor.setNativeState({windmill:{source:'same_player_native_block_entity_packet',running:false,angleDegrees:25}})
  actor.frame(12,0);assert.equal(actor.root.children[1].visible,true)
  const before=body.quaternion.toArray();actor.frame(13,.5);assert.deepEqual(body.quaternion.toArray(),before)
  actor.setNativeState({windmill:{source:'same_player_native_block_entity_packet',running:true,angleDegrees:25}})
  actor.frame(14,0);assert.equal(actor.root.children[1].visible,false)
  assert.match(actor.root.userData.nativeBearing.reason,/BINDING/)
  const sail=await loader.block({name:'create:white_sail',properties:{facing:'south'},stateId:43},position)
  let faces=0
  for(const model of[body,actor.root,sail])model.traverse(part=>{if(part.isMesh){faces++;assert.ok(part.userData.originalTexture.startsWith('create:block/'))}})
  assert.ok(faces>20);assert.ok(textures.length>2)
  actor.dispose();loader.releaseModel(body);loader.releaseModel(sail);await loader.dispose()
})
