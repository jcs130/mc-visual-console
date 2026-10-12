import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAgentPointer, visibleInventorySlot, createAgentPointerMotion} from '../../src/modern-viewer/agent-pointer.js';
import {Document} from './fixtures/native-console-dom.mjs';
const viewport={width:1000,height:600}, frame=operations=>({subject:{playerName:'A'},input:{operations}});
test('pointer follows real targets, first-person crosshair and explicit coordinates; unknown targets remain unknown',()=>{
  const op={kind:'attack',button:'left',target:{x:2,y:64,z:5}};
  const project=p=>({x:p.x*20,y:p.z*20});
  assert.deepEqual(resolveAgentPointer(frame([op]),{...viewport,project}),{x:40,y:100,source:'world',click:true,button:'left',label:'左键 · 攻击'});
  assert.equal(resolveAgentPointer(frame([{...op,target:null}]),{...viewport,project}),null);
  assert.equal(resolveAgentPointer(frame([op]),{...viewport,project:()=>({x:-1,y:40})}),null);
  assert.equal(resolveAgentPointer({...frame([op]),subject:null},{...viewport,project}),null);
  assert.equal(resolveAgentPointer(frame([op]),{...viewport,firstPerson:true}).x,500);
  assert.equal(resolveAgentPointer({subject:{},input:{pointer:{x:.8,y:.4},operations:[]}},{...viewport}).x,800);
});
test('inventory pointer uses only visible actual slots and a matching window, never offer previews',()=>{
  const document=new Document(),menu=document.createElement('section');menu.id='corti-menu';menu.dataset.windowId='7';
  menu.getBoundingClientRect=()=>({width:300});document.body.append(menu);
  const slot=document.createElement('div');slot.dataset.viewerSlot='12';slot.getBoundingClientRect=()=>({left:80,top:100,width:36,height:36});menu.append(slot);
  const options={...viewport,slotPosition:(n,id)=>visibleInventorySlot(document,n,id)};
  assert.equal(resolveAgentPointer(frame([{kind:'inventory',button:'right',detail:'槽位 12 · 右键'}]),options).x,98);
  assert.equal(resolveAgentPointer(frame([{kind:'inventory',slot:12,windowId:8}]),options),null);
  assert.equal(resolveAgentPointer(frame([{kind:'inventory',detail:'其他文本 12'}]),options),null);
  assert.equal(visibleInventorySlot(document,99,7),null);
  menu.hidden=true;assert.equal(visibleInventorySlot(document,12,7),null);
});
test('animated pointer moves continuously, settles, clamps resize and resets; reduced-motion has no interpolation',()=>{
  const motion=createAgentPointerMotion(),target={x:100,y:200};
  const initial=motion.step(target,0,viewport);assert.ok(initial.x>100&&initial.x<500);
  const next=motion.step(target,32,viewport);assert.ok(next.x<initial.x&&next.x>100);
  let settled;for(let t=64;t<1000;t+=32)settled=motion.step(target,t,viewport);
  assert.deepEqual(settled,target);
  const turn=motion.step({x:900,y:500},1000,viewport);assert.ok(turn.x>100&&turn.x<900);
  assert.equal(motion.step(null,1040,viewport),null);
  motion.reset();assert.deepEqual(motion.step(target,0,{...viewport,reducedMotion:true}),target);
  assert.equal(motion.step({x:1000,y:1000},32,{width:100,height:100}).x,100);
});
