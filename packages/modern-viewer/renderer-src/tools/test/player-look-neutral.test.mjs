import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {AvatarRigRegistry} from '../../src/modern-viewer/avatar-rig-registry.js';

test('remote transient raised arms are not a permanent bind pose, including rebinding after use',()=>{
  const player=new THREE.Group();player.position.set(3,16,5);player.skin={};
  for(const name of ['head','body','leftArm','rightArm','leftLeg','rightLeg'])player.skin[name]=new THREE.Group();
  player.skin.leftArm.position.set(5,-2,0);player.skin.rightArm.position.set(-5,-2,0);
  const registry=new AvatarRigRegistry({animationOptions:{now:()=>1000}});
  for(const initial of [-Math.PI/5,-1.25]){
    player.skin.leftArm.rotation.set(initial,.7,.1);player.skin.rightArm.rotation.set(initial,-.7,-.1);
    const rig=registry.ensure('remote',player);
    rig.setMotion({position:{x:0,y:64,z:0},pitch:0,onGround:true,usingHeldItem:false,riding:false},1000);
    for(let i=0;i<200;i++)player.animation.update(player,.05);
    assert.equal(player.skin.leftArm.rotation.x,0);assert.equal(player.skin.rightArm.rotation.x,0);
    assert.equal(player.skin.leftArm.rotation.y,0);assert.equal(player.skin.rightArm.rotation.y,0);
    assert.deepEqual(player.position.toArray(),[3,16,5]);
    assert.deepEqual(player.skin.leftArm.position.toArray(),[5,-2,0]);
    rig.setMotion({usingHeldItem:true,onGround:true},1100);player.animation.update(player,.05);
    assert.notEqual(player.skin.rightArm.rotation.x,0,'real current use still animates');
    registry.remove('remote');
  }
});

test('a remote player first seen looking down has no permanent head offset after looking level',()=>{
  const player=new THREE.Group();player.skin={};
  for(const name of ['head','body','leftArm','rightArm','leftLeg','rightLeg'])player.skin[name]=new THREE.Group();
  player.skin.head.position.y=12;player.skin.head.rotation.set(1.2,.7,0);
  const registry=new AvatarRigRegistry({animationOptions:{now:()=>1000}}),rig=registry.ensure('remote',player);
  rig.setMotion({position:{x:0,y:64,z:0},pitch:0,yaw:0,headYaw:0,onGround:true},1000);
  player.animation.update(player,.1);
  assert.equal(player.skin.head.rotation.x,0);assert.equal(player.skin.head.rotation.y,0);
  assert.equal(player.skin.head.position.y,12);
  rig.setMotion({position:{x:0,y:64,z:0},pitch:.6,yaw:0,headYaw:0,onGround:true},1100);
  for(let i=0;i<30;i++)player.animation.update(player,.05);
  assert.ok(Math.abs(player.skin.head.rotation.x+.6)<1e-6);
  registry.remove('remote');
});

test('vanilla downed body lies still, discards queued swings and recovers only from explicit state',()=>{
 const player=new THREE.Group();player.position.y=1;player.skin={};for(const name of ['head','body','leftArm','rightArm','leftLeg','rightLeg'])player.skin[name]=new THREE.Group();
 const registry=new AvatarRigRegistry({animationOptions:{now:()=>1000}}),rig=registry.ensure('self',player);
 rig.setMotion({onGround:true,position:{x:0,y:64,z:0}},1000);rig.trigger('swing',{nonce:'before'});rig.trigger('swing',{nonce:'queued'});
 rig.setMotion({bodyState:{source:'server',pose:'downed',canAct:false},onGround:true},1100);
 player.animation.update(player,.1);assert.equal(player.rotation.x,Math.PI/2);assert.ok(Math.abs(player.position.y-.28)<1e-8);
 assert.equal(rig.trigger('swing',{nonce:'during'}),false);assert.equal(player.animation.upperQueue.length,0);
 rig.setMotion({onGround:true},9000);player.animation.update(player,.1);assert.equal(player.rotation.x,Math.PI/2);
 rig.setMotion({bodyState:{source:'server',pose:'standing',canAct:true},onGround:true},10000);player.animation.update(player,.1);
 assert.equal(player.rotation.x,0);assert.equal(player.position.y,1);assert.equal(player.animation.upperAction,null);registry.remove('self');
});
