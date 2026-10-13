import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAgentViews,agentViewCaption} from '../../src/modern-viewer/agent-view-gallery.js';
const row={id:'abcdefff-1234-1234-1234-123456789012',url:'/agent-views/abcdefff-1234-1234-1234-123456789012.png',
  capturedAt:'2026-10-13T12:41:36.430Z',position:{x:-660.5,y:74,z:-693.5},mode:'third',delivery:'host-event'};
test('gallery only uses matching same-origin capture routes and finite recorded positions',()=>{
  const payload={schema:'mc-agent-views/v1',images:[row,{...row,url:'https://example.com/x.png'},
    {...row,url:'file:///private.png'},{...row,position:{x:NaN,y:74,z:0}},{...row,capturedAt:'yesterday'}]};
  assert.equal(normalizeAgentViews(payload).length,1);
  assert.deepEqual(normalizeAgentViews({...payload,schema:'unknown'}),[]);
});
test('image capture and host delivery are not labelled as model receipt',()=>{
  assert.match(agentViewCaption(row),/已交给宿主.*模型接收未核验/);
  assert.match(agentViewCaption({...row,delivery:'captured'}),/拍摄完成.*模型接收未核验/);
  assert.match(agentViewCaption({...row,delivery:'failed'}),/失败/);
});
