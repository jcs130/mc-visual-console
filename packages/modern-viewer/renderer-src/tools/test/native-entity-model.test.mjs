import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {nativeCubeFaces,createNativeModelPart} from '../../src/native-viewer/native-entity-model.js'

test('ModelPart.Cube original polygon order, top reversed-V and mirror are retained',()=>{
  const cube={origin:[-4,16,-4],size:[8,8,8],uv:[0,0]}
  const faces=nativeCubeFaces(cube,[64,32])
  assert.deepEqual(faces.find(f=>f.direction==='north').position,[4,16,-4,-4,16,-4,-4,24,-4,4,24,-4])
  assert.deepEqual(faces.find(f=>f.direction==='up').uv,[24/64,.75,16/64,.75,16/64,1,24/64,1])
  const mirror=nativeCubeFaces({...cube,mirror:true},[64,32]).find(f=>f.direction==='east')
  assert.deepEqual(mirror.normal,[-1,0,0])
  assert.deepEqual(mirror.position,[-4,24,4,-4,24,-4,-4,16,-4,-4,16,4])
})

test('original cube dilation moves geometry while keeping uninflated UV extents',()=>{
  const plain=nativeCubeFaces({origin:[-3,-4,-4],size:[6,6,6],uv:[0,0]},[64,32])
  const fur=nativeCubeFaces({origin:[-3,-4,-4],size:[6,6,6],uv:[0,0],dilation:.6},[64,32])
  assert.deepEqual(fur[0].uv,plain[0].uv)
  assert.equal(Math.min(...fur.flatMap(f=>f.position.filter((_,i)=>i%3===0))),-3.6)
})

test('original part pivots and ZYX hierarchy remain live; disposal owns geometry only',()=>{
  const material=new THREE.MeshBasicMaterial(),model=createNativeModelPart({parts:[{name:'head',pivot:[0,4,-8],cubes:[{origin:[-4,-4,-6],size:[8,8,6],uv:[0,0]}]},{name:'nose',parent:'head',pivot:[0,-2,0],rotation:[.1,.2,.3],cubes:[]}]},material,[64,32])
  assert.equal(model.bones.get('nose').parent,model.bones.get('head'))
  assert.equal(model.bones.get('nose').rotation.order,'ZYX')
  assert.deepEqual(model.bones.get('head').position.toArray(),[0,4,-8])
  assert.equal(model.root.scale.x,1/16)
  let disposed=0;model.bones.get('head').children.filter(c=>c.isMesh).forEach(mesh=>mesh.geometry.addEventListener('dispose',()=>disposed++))
  model.dispose();model.dispose();assert.equal(disposed,6)
  material.dispose()
})

test('unknown cube and cyclic hierarchy fail rather than drawing proxy geometry',()=>{
  assert.throws(()=>nativeCubeFaces({origin:[0,0,0],size:[1,1,1],uv:[0,0],dilation:NaN},[64,32]),/INVALID/)
  const material=new THREE.MeshBasicMaterial()
  assert.throws(()=>createNativeModelPart({parts:[{name:'a',parent:'b',pivot:[0,0,0],cubes:[]},{name:'b',parent:'a',pivot:[0,0,0],cubes:[]}]},material,[64,32]),/CYCLE/)
  material.dispose()
})
