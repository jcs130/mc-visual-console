import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { nativeCameraTarget,nativeCameraCollisionDistance } from '../../src/native-viewer/native-camera.js'

test('native following binds the actual displayed root and body epoch, not the raw target or animated head',()=>{
  const state={epoch:3,selfPlayer:{uuid:'player-uuid',entityId:7},pose:{x:8,y:64,z:8,yaw:1}}
  const root=new THREE.Group();root.position.set(7.5,64.1,8)
  const target=nativeCameraTarget(state,{root})
  assert.deepEqual(target.position,{x:7.5,y:64.1,z:8});assert.equal(target.key,'player-uuid:7:3')
  assert.equal(nativeCameraTarget({...state,selfPlayer:null},{root}),null)
  assert.notEqual(nativeCameraTarget({...state,epoch:4},{root}).key,target.key)
})

test('native near-plane sweep uses seven rendered-mesh rays and stops at unreceived volume',()=>{
  const options={bounds:{minX:0,maxX:31,minY:0,maxY:127,minZ:0,maxZ:31},receivedColumns:['0,0','1,0','0,1','1,1']}
  let rays=0
  assert.equal(nativeCameraCollisionDistance({x:8,y:65,z:8},{x:0,y:0,z:1},4,{...options,raycast:()=>{rays++;return []}}),4)
  assert.equal(rays,7)
  const wall=nativeCameraCollisionDistance({x:8,y:65,z:8},{x:0,y:0,z:1},4,{...options,raycast:()=>[{distance:1}]})
  assert.equal(wall,.88)
  const boundary=nativeCameraCollisionDistance({x:8,y:65,z:15},{x:0,y:0,z:1},8,{...options,receivedColumns:['0,0'],raycast:()=>[]})
  assert.ok(boundary<1.2&&boundary>0)
  assert.equal(nativeCameraCollisionDistance({x:8,y:65,z:8},{x:0,y:0,z:1},4,{}),.05)
})
