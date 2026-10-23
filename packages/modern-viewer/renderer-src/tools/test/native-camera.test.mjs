import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { NativeOrbitCameraAnchor,nativeCameraTarget,nativeCameraCollisionDistance } from '../../src/native-viewer/native-camera.js'

test('manual orbit waits for the first actual pose and points at the new terrain without an avatar',()=>{
  const anchor=new NativeOrbitCameraAnchor(),camera=new THREE.PerspectiveCamera(70,1,.05,150)
  const controls={target:new THREE.Vector3(),update(){camera.lookAt(this.target);camera.updateMatrixWorld(true)}}
  assert.equal(anchor.initialize({pose:null,mode:'third',camera,controls}),false)
  const pose={x:-648,y:62,z:-487,yaw:1,pitch:0}
  assert.equal(anchor.initialize({pose,mode:'third',camera,controls}),true)
  assert.deepEqual(controls.target.toArray(),[-648,63,-487])
  const target=new THREE.Vector3(...controls.target.toArray()).project(camera)
  assert.ok(Math.abs(target.x)<1e-9&&Math.abs(target.y)<1e-9&&target.z>-1&&target.z<1)
  // Later pose packets must preserve a viewer's drag/zoom in manual mode.
  camera.position.add(new THREE.Vector3(1,2,3));const dragged=camera.position.clone()
  assert.equal(anchor.initialize({pose:{...pose,x:pose.x+2},mode:'third',camera,controls}),false)
  assert.ok(camera.position.equals(dragged))
})

test('identity/epoch reset reanchors a delayed manual scene to the next body',()=>{
  for(const mode of ['third','region']){
    const anchor=new NativeOrbitCameraAnchor(),camera=new THREE.PerspectiveCamera(),controls={target:new THREE.Vector3(),update(){}}
    const options={mode,camera,controls,pose:{x:8,y:64,z:8,yaw:0,pitch:0}}
    anchor.initialize(options);anchor.reset()
    assert.equal(anchor.initialize({...options,pose:undefined}),false)
    assert.equal(anchor.initialize({...options,pose:{...options.pose,x:-650,z:-488}}),true)
    assert.deepEqual(controls.target.toArray(),[-650,65,-488])
    assert.ok(camera.position.distanceTo(controls.target)>1&&camera.position.distanceTo(controls.target)<15)
  }
})

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
