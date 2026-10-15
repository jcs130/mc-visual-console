// Offline captured-scene replay. No WebGL, network, game or model calls.
import {readFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {NativeAssetReader,NativeModelLoader,selectBlockVariants} from '../src/native-viewer/model-loader.js'
import {nativeStaticBatches} from '../src/native-viewer/native-static-batch.js'
import {modelOffset} from '../src/native-viewer/native-environment.js'
import {NativeWorldState} from './native-world-host.mjs'
import {encodeNativeWorldEvent} from './native-world-preview-host.mjs'
const [captureFile,assets,baselineFile]=process.argv.slice(2), bytes=await readFile(captureFile),capture=JSON.parse(bytes),snapshot=capture.snapshot
const manifest=JSON.parse(await readFile(join(assets,'native-assets.json')))
const reader=new NativeAssetReader(manifest,p=>readFile(join(assets,p))),loader=new NativeModelLoader(reader,async bytes=>{
 const texture=new THREE.Texture();texture.image={width:Buffer.from(bytes).readUInt32BE(16),height:Buffer.from(bytes).readUInt32BE(20)};return texture
})
const definitions=new Map(snapshot.states.map(s=>[s.stateId,s])),models=new Map(),layouts=new Map([0,16,32].map(size=>[size,[]])),unsupported=[]
for(const group of snapshot.groups){
 const state=definitions.get(group.stateId);if(state.renderShape!=='MODEL'){unsupported.push({name:state.name,instances:group.positions.length/3,reason:'non-static model, unchanged in all layouts'});continue}
 try{
  const blockstate=await loader.blockstate(state.name),variants=new Map()
  for(let i=0;i<group.positions.length;i+=3){const p={x:group.positions[i],y:group.positions[i+1],z:group.positions[i+2]},selected=selectBlockVariants(blockstate,state,p),key=JSON.stringify(selected);if(!variants.has(key))variants.set(key,{selected,positions:[]});variants.get(key).positions.push(p)}
  for(const {selected,positions} of variants.values()){
   const key=JSON.stringify([state.stateId,selected]);if(!models.has(key))models.set(key,nativeStaticBatches(await loader.models(selected,{allowTint:true})))
   for(const size of layouts.keys()){
    const buckets=new Map()
    for(const p of positions){const key=size?Math.floor(p.x/size)+','+Math.floor(p.z/size):'all';if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(p)}
    for(const bucket of buckets.values())for(const part of models.get(key).batches){
     const mesh=new THREE.InstancedMesh(part.geometry,part.material,bucket.length),matrix=new THREE.Matrix4()
     bucket.forEach((p,i)=>{const offset=modelOffset(state,p);matrix.makeTranslation(p.x+.5+offset[0],p.y+.5+offset[1],p.z+.5+offset[2]).multiply(part.matrixWorld);mesh.setMatrixAt(i,matrix)})
     mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.updateMatrixWorld();layouts.get(size).push(mesh)
    }
   }
  }
 }catch(error){unsupported.push({name:state.name,reason:error.message})}
}
const trace=capture.trace.filter(row=>row.motion?.pose??row.pose??row.value?.pose),poses=trace.map(row=>row.motion?.pose??row.pose??row.value.pose)
if(!poses.length)poses.push(snapshot.pose)
const camera=new THREE.PerspectiveCamera(60,16/9,.1,256),frustum=new THREE.Frustum(),matrix=new THREE.Matrix4(),results=[]
for(const [size,meshes]of layouts){
 const samples=[];let calls=0,triangles=0
 for(let repeat=0;repeat<7;repeat++){
  let localCalls=0,localTriangles=0;const start=performance.now()
  for(const pose of poses){camera.position.set(pose.x+12,pose.y+12,pose.z+12);camera.lookAt(pose.x,pose.y,pose.z);camera.updateMatrixWorld();matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix)
   for(const mesh of meshes)if(frustum.intersectsObject(mesh)){localCalls++;localTriangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3*mesh.count}
  }
  samples.push(performance.now()-start);calls=localCalls/poses.length;triangles=localTriangles/poses.length
 }
 results.push({xzBucketSize:size,retainedMeshes:meshes.length,retainedInstances:meshes.reduce((n,m)=>n+m.count,0),meanCalls:calls,meanTriangles:triangles,cullingCpuMsPerFrame:samples.sort((a,b)=>a-b)[3]/poses.length})
}
// Reconstruct only received captured cells. Outside captured bounds is unknown;
// exact neighbor stencil and biome samples are retained, never guessed as air.
const cells=new Map(),key=(x,y,z)=>x+','+y+','+z
for(const g of snapshot.groups)for(let i=0;i<g.positions.length;i+=3)cells.set(key(...g.positions.slice(i,i+3)),g.stateId)
for(const [y,z,x0,x1,id]of snapshot.occludedSolidRuns??[])for(let x=x0;x<=x1;x++)cells.set(key(x,y,z),id)
for(let i=0;i<snapshot.neighbors.length;i+=4)cells.set(key(...snapshot.neighbors.slice(i,i+3)),snapshot.neighbors[i+3])
const registryBytes=await readFile(join(assets,'registry/block-states.jsonl'))
assert.equal(createHash('sha256').update(registryBytes).digest('hex'),snapshot.registrySha256)
const nativeAir=registryBytes.toString().trim().split('\n').map(row=>JSON.parse(row)).find(s=>s.name==='minecraft:air')
definitions.set(nativeAir.stateId,nativeAir)
const air=nativeAir.stateId
assert.notEqual(air,undefined,'captured native air required')
const makeWorld=Class=>{
 const world=new Class({states:definitions,registrySha256:snapshot.registrySha256});Object.assign(world,{dimension:snapshot.dimension,pose:snapshot.pose,biomeSeed:snapshot.biomeSeed,biomes:new Map(snapshot.biomes.map(b=>[b.id,b])),epoch:snapshot.epoch,revision:snapshot.revision,lastSequence:snapshot.packetSequence,time:snapshot.time,particleCollisions:snapshot.particleCollisions})
 const b=snapshot.bounds,g=snapshot.biomeGrid
 for(const col of snapshot.viewCoverage.receivedColumns){const [cx,cz]=col.split(',').map(Number);world.columns.set(col,{getBlockStateId:p=>{const x=cx*16+p.x,z=cz*16+p.z;return cells.get(key(x,p.y,z))??(x>=b.minX&&x<=b.maxX&&p.y>=b.minY&&p.y<=b.maxY&&z>=b.minZ&&z<=b.maxZ?air:null)},getBiome:p=>{const x=Math.floor((cx*16+p.x)/4)-g.x,y=Math.floor(p.y/4)-g.y,z=Math.floor((cz*16+p.z)/4)-g.z;return x>=0&&x<g.width&&y>=0&&y<g.height&&z>=0&&z<g.depth?g.ids[(y*g.depth+z)*g.width+x]:null}})}
 return world
}
const Baseline=baselineFile?(await import(pathToFileURL(resolve(baselineFile)))).NativeWorldState:NativeWorldState,before=makeWorld(Baseline),after=makeWorld(NativeWorldState),scan=[]
for(let i=0;i<7;i++){let t=performance.now();const a=before.snapshot();const syncMs=performance.now()-t;t=performance.now();const b=await after.snapshotAsync();assert.deepEqual(b,a);scan.push({syncMs,asyncWallMs:performance.now()-t,...after.snapshotTiming,byteBudgetEncodeMs:after.snapshotEncodeMs})}
const wire=[];for(let i=0;i<7;i++){let t=performance.now();for(let c=0;c<4;c++){const body=JSON.stringify(snapshot);Buffer.byteLength(body)}const beforeMs=performance.now()-t;t=performance.now();encodeNativeWorldEvent(snapshot);wire.push({beforeMs,afterMs:performance.now()-t})}
console.log(JSON.stringify({captureSha256:createHash('sha256').update(bytes).digest('hex'),cameraFrames:poses.length,staticLayouts:results,unsupported,scan,wire,limitations:['CPU is real Three frustum traversal, not WebGL driver/GPU time','camera follows captured positions with the same fixed overhead offset in all layouts','scanner replays captured bounded cells and stencil, not original uncaptured chunk bodies']},null,2))
for(const meshes of layouts.values())for(const mesh of meshes)mesh.dispose();for(const batch of models.values())batch.dispose();loader.dispose()
