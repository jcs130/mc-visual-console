import {test} from 'node:test';
import assert from 'node:assert/strict';
import {proxyFacing,checkedProxyPose} from '../../src/modern-viewer/voxel-proxy-pose.mjs';
test('Mineflayer yaw zero faces negative Z, with explicit front/back camera views',()=>{
 assert.equal(proxyFacing(0,[0,2,-5]).view,'front');
 assert.equal(proxyFacing(0,[0,2,5]).view,'rear');
 assert.equal(proxyFacing(0,[5,2,0]).view,'right-profile');
 assert.equal(proxyFacing(Math.PI,[0,2,5]).view,'front');
});
test('actual sampled look-yaw yields a right rear quarter and does not certify body animation',()=>{
 const p=proxyFacing(-.46338491640441104,[3,3.1,4]);
 assert.equal(p.view,'right-rear-three-quarter');assert.equal(p.bodyOrientationObserved,false);
 assert(Math.abs(p.angleDegrees-116.58010235416076)<1e-10);
});
test('overhead and missing inputs do not invent an azimuth',()=>{
 assert.equal(proxyFacing(0,[0,4,0]).view,'overhead');
 assert.throws(()=>proxyFacing(NaN,[3,2,4]));assert.throws(()=>proxyFacing(0,[3,4]));
});

test('recorded pose updates preserve radians and copy mutable coordinate arrays',()=>{
 const pose={feet:[1,2,3],eye:[1,3.62,3],yaw:3.1,pitch:-.1,roll:0,fovDegrees:75,convention:'mineflayer-radians'};
 const accepted=checkedProxyPose(pose);pose.feet[0]=100;assert.equal(accepted.feet[0],1);
 assert.throws(()=>checkedProxyPose({...pose,yaw:NaN}));assert.throws(()=>checkedProxyPose({...pose,convention:'degrees'}));assert.throws(()=>checkedProxyPose({...pose,fovDegrees:0}));
});
