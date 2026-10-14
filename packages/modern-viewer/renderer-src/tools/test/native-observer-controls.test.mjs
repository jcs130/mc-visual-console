import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createNativeTerrainRaycast } from '../../src/native-viewer/native-terrain-raycast.js'
import { nativeReceivedRoomCache,createNativeRoomVisibility } from '../../src/native-viewer/native-room-visibility.js'
import { RoomFloorMask } from '../../src/modern-viewer/room-floor-mask.js'

test('native observer uses actual short-mob clearance; unreceived support cannot become a floor',()=>{
  const cache={revision:1,known:(x,y,z)=>x>=0&&x<=2&&z>=0&&z<=2&&y>=9&&y<=12,isSolidBlock:(x,y,z)=>y===9||y===11}
  const p={x:1,y:10,z:1}
  assert.equal(new RoomFloorMask(cache).update(p,2).openCells,0,'a player cannot fit this low cave')
  assert.ok(new RoomFloorMask(cache,{clearance:1}).update(p,2).openCells>0,'the original .9-high spider can be observed')
  const clipped={...cache,known:(x,y,z)=>cache.known(x,y,z)&&y>=10}
  assert.equal(new RoomFloorMask(clipped,{clearance:1}).update(p,2).openCells,0,'an unknown floor cannot support the mask')
})

test('native terrain broad phase matches exact original triangle intersections for translated instances and thin geometry',()=>{
  const root=new THREE.Group(),geometry=new THREE.BoxGeometry(.125,1,1),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),mesh=new THREE.InstancedMesh(geometry,material,3)
  const positions=[0,0,0,5,0,0,100,0,0];mesh.userData.nativeBlockPositions=positions
  for(let i=0;i<3;i++)mesh.setMatrixAt(i,new THREE.Matrix4().makeTranslation(positions[i*3]+.5,.5,.5))
  root.add(mesh);root.updateMatrixWorld(true)
  const exact=createNativeTerrainRaycast(root),ray=new THREE.Raycaster(new THREE.Vector3(-1,.5,.5),new THREE.Vector3(1,0,0),0,8)
  const expected=ray.intersectObject(root,true),actual=exact(ray)
  assert.deepEqual(actual.map(hit=>[hit.distance,hit.instanceId]),expected.map(hit=>[hit.distance,hit.instanceId]))
  const miss=new THREE.Raycaster(new THREE.Vector3(-1,1.01,.5),new THREE.Vector3(1,0,0),0,8)
  assert.equal(exact(miss).length,0,'thin authored model is not expanded to a collision cube')
  geometry.dispose();material.dispose();mesh.dispose()
})
test('room masks use only received native solid/air state and unknown volume never invents an open room',()=>{
  const floor=[];for(let x=0;x<8;x++)for(let z=0;z<8;z++)floor.push(x,63,z)
  const s={revision:1,bounds:{minX:0,maxX:7,minY:63,maxY:68,minZ:0,maxZ:7},states:[{stateId:1,solid:true,blocksMotion:true}],
    groups:[{stateId:1,positions:floor}],viewCoverage:{receivedColumns:['0,0']}}
  const cache=nativeReceivedRoomCache(s)
  assert.equal(cache.isSolidBlock(1,63,1),true);assert.equal(cache.isSolidBlock(1,64,1),false)
  assert.equal(cache.known(9,64,1),false);assert.equal(cache.isSolidBlock(9,64,1),true)
  assert.equal(cache.hasCeiling({x:1,y:64,z:1}),false,'missing vertical volume is not a received roof')
  s.groups[0].positions.push(1,67,1,2,67,1,0,67,1)
  const visibility=createNativeRoomVisibility(),camera=new THREE.PerspectiveCamera(48,1,.05,100)
  camera.position.set(5,74,5);camera.lookAt(1,65,1);camera.updateMatrixWorld(true)
  visibility.stage(s)
  const status=visibility.update({camera,pose:{x:1,y:64,z:1},mode:'dungeon',raycast:()=>[],now:100})
  assert.equal(status.covered,true);assert.equal(status.active,true);assert.ok(status.openCells>0)
  visibility.update({camera,pose:{x:1,y:64,z:1},mode:'first',raycast:()=>[],now:200})
  assert.equal(visibility.uniforms.u_lanternCutawayEnabled.value,0);visibility.dispose()
})
