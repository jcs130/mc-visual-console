import test from 'node:test';
import assert from 'node:assert/strict';
import {AvatarMotionGraph,normalizeMotionFrame,PoseDrivenPlayerAnimation} from '../../src/modern-viewer/avatar-motion.js';
import {PlayerObject} from 'skinview3d';
import * as THREE from 'three';
test('sleep overrides movement and water, a wake clears it, and downed still takes priority',()=>{
 const g=new AvatarMotionGraph();
 const asleep={seq:1,entity:{pos:{x:0,y:64,z:0},sleepState:{sleeping:true}},inWater:true,onGround:false};
 g.setMotion(asleep,1000);assert.equal(g.getState().state,'sleep');
 const awake={...asleep,seq:2,onGround:true,inWater:false,entity:{...asleep.entity,sleepState:{sleeping:false},metadata:{6:2}}};
 g.setMotion(awake,1100);assert.notEqual(g.getState().state,'sleep');
 g.setMotion({...asleep,seq:3,bodyState:{source:'server',pose:'downed',canAct:false}},1200);assert.equal(g.getState().state,'downed');
 const a=normalizeMotionFrame(asleep,null,1000),b=normalizeMotionFrame(awake,a,1100);assert.equal(b.sleeping,false);
});

test('the original skinview mesh sleeps face up with its head toward each bed heading',()=>{
 for(const [bedFacing,direction]of Object.entries({north:[0,0,-1],south:[0,0,1],west:[-1,0,0],east:[1,0,0]})){
  const player=new PlayerObject(),parent=new THREE.Group();parent.rotation.y=.7;parent.add(player);
  const animation=new PoseDrivenPlayerAnimation({now:()=>1000});
  animation.setMotion({seq:1,yaw:.7,onGround:true,entity:{pos:{x:0,y:64,z:0},sleepState:{sleeping:true,bedFacing}}},1000);
  animation.update(player,.1);parent.updateMatrixWorld(true);
  assert.ok(new THREE.Vector3(0,0,1).transformDirection(player.skin.head.matrixWorld).y>.999999);
  const up=new THREE.Vector3(0,1,0).transformDirection(player.matrixWorld);
  assert.ok(up.distanceTo(new THREE.Vector3(...direction))<1e-6);
  animation.setMotion({seq:2,onGround:true,entity:{pos:{x:0,y:64,z:0},sleepState:{sleeping:false}}},1100);
  animation.update(player,.1);assert.ok(Math.abs(player.rotation.x)<1e-8);
 }
});
