import {test} from 'node:test';
import assert from 'node:assert/strict';
import {organicProxyKind,organicProxyTransform} from '../../src/modern-viewer/voxel-proxy-organic.mjs';
test('artistic abstraction is restricted to named original classes, without mod substitution',()=>{
 assert.equal(organicProxyKind('minecraft:cherry_leaves'),'foliage');
 assert.equal(organicProxyKind('minecraft:redstone_block'),'crystal');
 for(const name of ['mod:cherry_leaves','minecraft:chest','minecraft:stone'])assert.equal(organicProxyKind(name),null);
});
test('bounded artistic transforms repeat exactly at negative coordinates',()=>{
 const a=organicProxyTransform(-541,70,-440,'foliage'),b=organicProxyTransform(-541,70,-440,'foliage');
 assert.deepEqual(a,b);assert(a.position.every((n,i)=>Math.abs(n-[-540.5,70.5,-439.5][i])<=.08));
 assert(a.scale.every(n=>n>=.9&&n<=1.22));
 assert.throws(()=>organicProxyTransform(0,NaN,0,'foliage'));
});
