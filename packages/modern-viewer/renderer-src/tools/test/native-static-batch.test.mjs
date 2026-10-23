import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { nativeStaticBatches, nativeInstanceTints } from '../../src/native-viewer/native-static-batch.js'

function triangles(geometry,matrix=new THREE.Matrix4()){
  const out=[],normal=new THREE.Matrix3().getNormalMatrix(matrix),index=geometry.index
  for(let i=0;i<(index?.count??geometry.attributes.position.count);i++){
    const at=index?index.getX(i):i,p=new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,at).applyMatrix4(matrix)
    const n=new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal,at).applyNormalMatrix(normal)
    out.push([...p,...n,geometry.attributes.uv.getX(at),geometry.attributes.uv.getY(at)])
  }
  if(matrix.determinant()<0)for(let i=0;i<out.length;i+=3)[out[i],out[i+2]]=[out[i+2],out[i]]
  return out
}
test('static material batches preserve authored transformed triangles, UVs, normals, tint and ownership',()=>{
  const model=new THREE.Group(),parent=new THREE.Group();model.add(parent);parent.rotation.y=.47;parent.position.set(.2,.3,.4)
  const material=new THREE.MeshBasicMaterial(),other=new THREE.MeshBasicMaterial(),original=[]
  for(let i=0;i<6;i++){
    const face=new THREE.Mesh(new THREE.PlaneGeometry(1,1),i===5?other:material)
    face.position.set(i*.1,.2,.3);face.rotation.x=.3;face.scale.set(i===1?-1:1,1.2,.8)
    face.userData={tintIndex:i===4?0:-1,shade:true,cullface:'north',originalTexture:'minecraft:block/stone'}
    parent.add(face);original.push(face)
  }
  model.updateMatrixWorld(true)
  const before=original.slice(0,4).flatMap(p=>triangles(p.geometry,p.matrixWorld)),batch=nativeStaticBatches(model)
  assert.equal(batch.batches.length,3);assert.equal(model.children[0].children.length,6)
  const combined=batch.batches[0];assert.equal(combined.material,material);assert.equal(combined.userData.nativeOriginalFaces.length,4)
  const after=triangles(combined.geometry)
  assert.equal(after.length,before.length)
  for(let i=0;i<after.length;i++)for(let j=0;j<8;j++)assert.ok(Math.abs(after[i][j]-before[i][j])<3e-7,`${i}:${j}`)
  assert.equal(batch.batches[1].userData.tintIndex,0);assert.equal(batch.batches[2].material,other)
  let owned=0,source=0,materials=0
  for(const part of batch.batches)part.geometry.addEventListener('dispose',()=>owned++)
  for(const part of original)part.geometry.addEventListener('dispose',()=>source++)
  material.addEventListener('dispose',()=>materials++)
  batch.dispose();batch.dispose();assert.equal(owned,3);assert.equal(source,0);assert.equal(materials,0)
})
test('static batching refuses dynamic meshes instead of silently flattening animation',()=>{
  const model=new THREE.Group();model.add(new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial(),1))
  assert.throws(()=>nativeStaticBatches(model),/DYNAMIC_MODEL/)
})
test('one unknown boundary biome cannot discard the whole grass/foliage instance group',async()=>{
  const warnings=[],positions=[0,1,2,3,4,5,6,7,8],parts=[{userData:{tintIndex:0}},{userData:{tintIndex:0}},{userData:{tintIndex:-1}}],calls=[]
  const result=await nativeInstanceTints({},positions,parts,{blockTint(_,p,n){calls.push([p.x,n]);if(p.x===3)throw Error('NATIVE_BIOME_NOT_RECEIVED');return 0x123456+p.x}},null,e=>warnings.push(e.message))
  assert.deepEqual(result.positions,[0,1,2,6,7,8]);assert.deepEqual(result.tints.get(0),[0x123456,0x12345c]);assert.equal(calls.length,3);assert.deepEqual(warnings,['NATIVE_BIOME_NOT_RECEIVED'])
  const untouched=await nativeInstanceTints({},positions,[{userData:{tintIndex:-1}}],null);assert.strictEqual(untouched.positions,positions)
})
