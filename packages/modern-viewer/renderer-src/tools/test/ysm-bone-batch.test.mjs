import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createNativeBedrockModel} from '../../src/native-viewer/native-entity-model-bedrock.js';
import {batchYsmBones} from '../../src/modern-viewer/ysm-bone-batch.js';

function samples(model) {
  model.root.updateMatrixWorld(true);
  const rows=[];let meshes=0;
  model.root.traverse(o=>{
    if(!o.isMesh)return;meshes++;
    const g=o.geometry,p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv');
    const nm=new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
    for(let i=0;i<(g.index?.count??p.count);i++) {
      const j=g.index?g.index.getX(i):i;
      rows.push([...new THREE.Vector3().fromBufferAttribute(p,j).applyMatrix4(o.matrixWorld).toArray(),
        ...new THREE.Vector3().fromBufferAttribute(n,j).applyNormalMatrix(nm).toArray(),uv.getX(j),uv.getY(j)]);
    }
  });
  // Traversal order can change when a parent's batch follows its animated child.
  return {meshes,rows:rows.map(row=>row.map(n=>n.toFixed(5)).join(',')).sort()};
}
test('batching preserves world triangles, normals and UVs through animated parents and rotated signed cubes',()=>{
  const cube={origin:[-2,2,1],size:[2,3,1],uv:[0,0]};
  const definition={format_version:'1.12.0','minecraft:geometry':[{description:{texture_width:64,texture_height:64},bones:[
    {name:'Root',pivot:[0,0,0],cubes:[cube,{...cube,origin:[2,4,3],pivot:[1,3,0],rotation:[20,45,-15]},
      {...cube,size:[-2,3,1],mirror:true},{...cube,origin:[-3,5,2],size:[0,2,3]}]},
    {name:'Arm',parent:'Root',pivot:[-4,20,0],cubes:[cube,{...cube,rotation:[-30,0,10],pivot:[-4,20,0]}]}
  ]}]};
  const material=new THREE.MeshBasicMaterial(),a=createNativeBedrockModel(definition,material,{allowNegativeSizes:true}),b=createNativeBedrockModel(definition,material,{allowNegativeSizes:true});
  const before=samples(b),batch=batchYsmBones(b,material);
  assert.ok(samples(b).meshes<before.meshes);assert.equal(b.bones.get('Arm').parent,b.bones.get('Root'));
  for(const angle of [0,.6,-1.2]) {
    for(const m of [a,b]){m.bones.get('Root').rotation.y=angle;m.bones.get('Arm').rotation.x=-angle;m.root.position.set(10,64,-20);}
    assert.deepEqual(samples(b).rows,samples(a).rows);
  }
  batch.dispose();a.dispose();b.dispose();material.dispose();
});
