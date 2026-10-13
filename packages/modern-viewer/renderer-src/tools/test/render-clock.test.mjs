import test from 'node:test';
import assert from 'node:assert/strict';
import {nextRenderClock} from '../../src/modern-viewer/render-clock.js';
test('59.94/60 Hz quantized RAF does not lose frames to the 60 FPS limit',()=>{
  for(const hz of [59.94,60]) {
    let clock=0,frames=0;
    for(let n=1;n<=600;n++){const now=Math.round(n*1000/hz*10)/10,next=nextRenderClock(now,clock,60);if(next!==null){clock=next;frames++;}}
    assert.equal(frames,600);
  }
});
test('high refresh displays still respect the cap and a stall does not cause catch-up bursts',()=>{
  for(const hz of [120,144,240]) {
    let clock=0,frames=0;
    for(let n=1;n<=hz*10;n++){const next=nextRenderClock(n*1000/hz,clock,60);if(next!==null){clock=next;frames++;}}
    assert.ok(frames>=599&&frames<=601,`${hz}: ${frames}`);
    const after=nextRenderClock(11000,clock,60);assert.ok(after>=10990);assert.equal(nextRenderClock(11001,after,60),null);
  }
});
