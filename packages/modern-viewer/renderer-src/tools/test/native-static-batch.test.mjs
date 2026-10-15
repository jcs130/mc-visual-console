import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { nativeStaticBatches } from '../../src/native-viewer/native-static-batch.js'

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
