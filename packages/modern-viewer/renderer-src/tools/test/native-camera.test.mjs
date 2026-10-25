import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { NativeOrbitCameraAnchor,nativeCameraTarget,nativeCameraCollisionDistance,nativeCachedCameraLimits,constrainNativeFreeCamera } from '../../src/native-viewer/native-camera.js'

test('free camera pans only over received columns, without following a moving player or requesting chunks',()=>{
 const limits=nativeCachedCameraLimits({minX:0,maxX:47,minY:50,maxY:80,minZ:0,maxZ:31},['0,0','2,1','invalid'])
 assert.deepEqual(limits.project({x:8,y:70,z:9}),{x:8,y:70,z:9})
 const hole=limits.project({x:24,y:70,z:9});assert.ok(hole.x<16||hole.x>=32)
 assert.equal(limits.project({x:8,y:-100,z:9}).y,50.05)
 assert.equal(limits.project({x:8,y:1000,z:9}).y,112)
 const camera=new THREE.PerspectiveCamera(),controls={target:new THREE.Vector3(100,70,100)}
 camera.position.set(100,80,90)
 assert.equal(constrainNativeFreeCamera(camera,controls,limits),true)
 for(const p of [camera.position,controls.target])assert.deepEqual({...limits.project(p)},{x:p.x,y:p.y,z:p.z})
 const before=camera.position.clone(),anchor=new NativeOrbitCameraAnchor();anchor.rebase({x:8,y:64,z:8})
 assert.equal(anchor.follow({pose:{x:12,y:64,z:8},mode:'region',camera,controls}),false)
 assert.ok(camera.position.equals(before),'free view is independent from the source player')
 assert.equal(nativeCachedCameraLimits(null,[]),null)
 assert.equal(nativeCachedCameraLimits({minX:0,maxX:1,minY:50,maxY:80,minZ:0,maxZ:1},['9,9']),null)
 assert.equal(constrainNativeFreeCamera(camera,controls,null),false)
})

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

test('manual third-person orbit follows the displayed root while retaining drag, pan and zoom',()=>{
 const anchor=new NativeOrbitCameraAnchor(),camera=new THREE.PerspectiveCamera(),controls={target:new THREE.Vector3(),update(){}}
 const pose={x:-512,y:63,z:-378,yaw:1,pitch:0}
 anchor.initialize({pose,mode:'third',camera,controls})
 camera.position.add(new THREE.Vector3(3,2,-1));controls.target.add(new THREE.Vector3(.5,.2,0))
 const offset=camera.position.clone().sub(controls.target),oldTarget=controls.target.clone()
 for(let i=1;i<=120;i++)anchor.follow({pose:{...pose,x:pose.x+i*.05,y:pose.y+i*.01},mode:'third',camera,controls})
 assert.ok(camera.position.clone().sub(controls.target).distanceTo(offset)<1e-9)
 assert.ok(controls.target.distanceTo(oldTarget.clone().add(new THREE.Vector3(6,1.2,0)))<1e-9)
 const still=camera.position.clone()
 assert.equal(anchor.follow({pose:{...pose,x:100},mode:'region',camera,controls}),false);assert.ok(camera.position.equals(still))
})

test('taking over a director shot rebases the orbit without resetting its camera position',()=>{
 const anchor=new NativeOrbitCameraAnchor(),camera=new THREE.PerspectiveCamera(),controls={target:new THREE.Vector3(),update(){}}
 camera.position.set(10,70,12);controls.target.set(8,65,8)
 assert.equal(anchor.rebase({x:8,y:64,z:8}),true)
 anchor.follow({pose:{x:9,y:64,z:8},mode:'third',camera,controls})
 assert.deepEqual(camera.position.toArray(),[11,70,12]);assert.deepEqual(controls.target.toArray(),[9,65,8])
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
