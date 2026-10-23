import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {gzipSync} from 'node:zlib'
import {nativeSurfaceVisibility} from '../native-surface-visibility.mjs'
import {nativeFaceVisibility} from '../../src/native-viewer/native-face-visibility.js'
import {nativeStaticBatches} from '../../src/native-viewer/native-static-batch.js'
import {decodedSpectatorChunk} from '../../host/spectator-relay.mjs'
const bounds={minX:0,maxX:10,minY:0,maxY:10,minZ:0,maxZ:10},stone={stateId:1,renderShape:'MODEL',canOcclude:true,solid:true,blocksMotion:true,dynamicShape:false,hasBlockEntity:false,fluid:{empty:true},occlusionBoxes:[[0,0,0,1,1,1]]},air={stateId:0},glass={stateId:2,canOcclude:false}
function mask({get,pose={x:1,y:7,z:1},...options}){
  const job=nativeSurfaceVisibility({bounds,dimension:{minY:0,height:16},pose,stateAt:get,worldStateAt:get,isOpaque:s=>s===stone,...options})
  let step;do{step=job.next()}while(!step.done);return step.value
}
test('surface mask hides disconnected caves while preserving sky, real cave entrances and an underground observer',()=>{
  let entrance=false,unknown=false
  const get=(x,y,z)=>unknown&&x===4&&y===2&&z===2?null:y>=6||x>=3&&x<=5&&y>=1&&y<=3&&z>=3&&z<=5||entrance&&x===4&&z===4&&y>=3?air:stone
  assert.equal(mask({get}).exposed(4,4,4),false)
  assert.equal(mask({get}).exposed(4,5,4),true)
  assert.equal(mask({get,pose:{x:4,y:2,z:4}}).exposed(4,4,4),true)
  entrance=true;assert.equal(mask({get}).exposed(4,4,4),true)
  entrance=false;unknown=true;assert.equal(mask({get}).exposed(4,2,3),true)
})
test('cropped underground ceilings are not sky; incomplete sky or an exhausted probe budget never manufactures visibility',()=>{
  const get=(x,y,z)=>y>=4&&y<=10?air:stone
  assert.equal(mask({get,pose:null}).visibleAirCells,0)
  assert.equal(mask({get:(x,y,z)=>y>10?null:get(x,y,z),pose:null}).visibleAirCells,0)
  assert.equal(mask({get:()=>air,maxSkyProbes:1}),null)
  assert.ok(mask({get:(x,y,z)=>y>=6?glass:stone}).visibleAirCells>0)
})
test('authored cullface follows variant rotation, keeps undecorated/diagonal faces and exact original UVs',()=>{
  const model=new THREE.Group(),material=new THREE.MeshBasicMaterial()
  const face=(cullface,angle=0)=>{const group=new THREE.Group(),mesh=new THREE.Mesh(new THREE.PlaneGeometry(),material);mesh.userData={cullface};group.rotation.y=angle;group.add(mesh);model.add(group);return mesh}
  const north=face('north'),east=face('north',-Math.PI/2),diagonal=face('north',Math.PI/4),undeclared=face(null)
  const batch=nativeStaticBatches(model,{faceMask:63&~(1<<4)})
  assert.equal(batch.batches[0].userData.nativeOriginalFaces.length,3)
  assert.equal(north.geometry.attributes.uv.count,4);assert.equal(model.children.length,4)
  const eastOnly=nativeStaticBatches(model,{faceMask:1<<1})
  assert.equal(eastOnly.batches[0].userData.nativeOriginalFaces.length,3)
  batch.dispose();eastOnly.dispose();for(const m of [north,east,diagonal,undeclared])m.geometry.dispose();material.dispose()
})
test('hidden native solids suppress internal faces; partial and unknown neighbors remain visible',()=>{
  const snap={bounds,states:[stone,glass],groups:[{stateId:1,positions:[4,4,4]},{stateId:2,positions:[5,4,4]}],occludedSolidRuns:[[4,4,3,3,1]]}
  const visibility=nativeFaceVisibility(snap)
  assert.equal(visibility(4,4,4)&1,0);assert.ok(visibility(4,4,4)&2);assert.equal(visibility(0,0,0),63)
})
test('gzip chunks are independently bounded; corrupted data, empty output and decompression bombs are rejected; legacy identity remains exact',()=>{
  const head=Buffer.alloc(8);head.writeUInt32BE(1)
  const wire=raw=>Buffer.concat([head,gzipSync(raw)])
  assert.equal(decodedSpectatorChunk(wire(Buffer.alloc(65536,7)),'gzip-chunks-v1').bytes.length,65536)
  for(const b of [wire(Buffer.alloc(65537)),wire(Buffer.alloc(0)),Buffer.concat([head,Buffer.from('bad')])])assert.throws(()=>decodedSpectatorChunk(b,'gzip-chunks-v1'))
  assert.deepEqual(decodedSpectatorChunk(Buffer.concat([head,Buffer.from('old')])).bytes,Buffer.from('old'))
})
