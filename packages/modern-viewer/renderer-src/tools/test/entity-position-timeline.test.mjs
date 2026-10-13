import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EntityPositionTimeline} from '../../src/modern-viewer/entity-position-timeline.js';
import {patchRendererMovement} from '../minecraft-viewer-movement-patch.mjs';
test('20Hz movement renders constant speed at 60Hz despite interleaved repeated snapshots',()=>{
  const c=new EntityPositionTimeline(),values=[];
  for(let t=0;t<=1000;t+=10) {
    if(t%50===0)c.push({x:t/250,y:64,z:0},t);
    for(const offset of [0,5])if(t+offset>=150)values.push(c.sample(t+offset).x);
  }
  for(let i=1;i<values.length;i++)assert.ok(Math.abs(values[i]-values[i-1]-.02)<1e-9);
  c.push({x:4,y:64,z:0},1100);c.push({x:4,y:64,z:0},1200);
  assert.equal(c.sample(1300).x,4,'stop at the last received position; never extrapolate');
});
test('jittered arrivals stay inside received segments; teleport, long pause and vehicle instant never glide',()=>{
  const c=new EntityPositionTimeline();c.push({x:0,y:64,z:0},0);c.push({x:1,y:64,z:0},90);c.push({x:2,y:64,z:0},110);
  for(let t=110;t<210;t++)assert.ok(c.sample(t).x>=0 && c.sample(t).x<=2);
  c.push({x:50,y:70,z:5},250);assert.equal(c.sample(250).x,50);
  c.push({x:51,y:70,z:5},1000);assert.equal(c.sample(1000).x,51);
  c.push({x:52,y:70,z:5},1050,{instant:true});assert.equal(c.sample(1050).x,52);
  for(let t=1100;t<10000;t+=10)c.push({x:52,y:70,z:5},t);assert.ok(c.samples.length<=32);
});
test('the pinned renderer uses the buffer and retains passenger/deletion tween cancellation',()=>{
  const original=readFileSync(new URL('../../node_modules/minecraft-renderer/dist/minecraft-renderer.js',import.meta.url),'utf8');
  const patched=patchRendererMovement(original);assert.match(patched,/timeline\.sample/);
  assert.ok(patched.includes('if(e.delete){if(!i)return;i.userData._posTween?.stop()'));
  assert.throws(()=>patchRendererMovement(patched),/锚点/);
});
