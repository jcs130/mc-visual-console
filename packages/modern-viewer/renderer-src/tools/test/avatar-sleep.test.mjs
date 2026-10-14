import test from 'node:test';
import assert from 'node:assert/strict';
import {AvatarMotionGraph,normalizeMotionFrame} from '../../src/modern-viewer/avatar-motion.js';
test('sleep overrides movement and water, a wake clears it, and downed still takes priority',()=>{
 const g=new AvatarMotionGraph();
 const asleep={seq:1,entity:{pos:{x:0,y:64,z:0},sleepState:{sleeping:true}},inWater:true,onGround:false};
 g.setMotion(asleep,1000);assert.equal(g.getState().state,'sleep');
 const awake={...asleep,seq:2,onGround:true,inWater:false,entity:{...asleep.entity,sleepState:{sleeping:false},metadata:{6:2}}};
 g.setMotion(awake,1100);assert.notEqual(g.getState().state,'sleep');
 g.setMotion({...asleep,seq:3,bodyState:{source:'server',pose:'downed',canAct:false}},1200);assert.equal(g.getState().state,'downed');
 const a=normalizeMotionFrame(asleep,null,1000),b=normalizeMotionFrame(awake,a,1100);assert.equal(b.sleeping,false);
});
