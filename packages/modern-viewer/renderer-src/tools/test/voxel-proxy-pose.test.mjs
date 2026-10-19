import {test} from 'node:test';
import assert from 'node:assert/strict';
import {proxyFacing} from '../../src/modern-viewer/voxel-proxy-pose.mjs';
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
