import test from 'node:test';
import assert from 'node:assert/strict';
import {clearSight,visibleEntity,visibleSurface,hearingHint,TerrainMemory} from '../../src/modern-viewer/perception-view.js';
import {VisibleMotion,focusEntities} from '../../src/modern-viewer/perception-risk.js';
import {captureOverview} from '../../src/modern-viewer/overview-capture.js';
const air={name:'air',shapes:[]},stone={name:'stone',shapes:[[0,0,0,1,1,1]]};
const self={id:1,pos:{x:.5,y:64,z:.5},yaw:0,pitch:-.2};
const ground={top:()=>64,block:(_x,y)=>y<64?stone:air};
test('sight requires real clear geometry and observer-facing evidence, never unloaded or wall-hidden entities',()=>{
  const mob={pos:{x:.5,y:64,z:-5},height:1.8};
  assert.equal(visibleEntity(ground,self,mob),true);
  assert.equal(visibleEntity({...ground,block:(x,y,z)=>z===-2?stone:ground.block(x,y,z)},self,mob),false);
  assert.equal(visibleEntity({block:()=>null},self,mob),false);
  assert.equal(visibleEntity(ground,{...self,yaw:Math.PI},mob),false);
  assert.equal(clearSight({block:(x,y,z)=>x===0&&z===1?stone:air},{x:.5,y:.5,z:.5},{x:1.5,y:.5,z:1.5}),false);
});
function documentStub(){return {createElement(){const c={width:0,height:0,colour:null};c.getContext=()=>({
  drawImage(source){c.colour=source.colour;},fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}});return c;}};}
test('terrain history freezes unseen pixels, never accepts hidden updates, and explicitly resets',()=>{
  const memory=new TerrainMemory(documentStub()),spec={width:96,height:96,span:12,bounds:{minX:-6,maxX:6,minZ:-6,maxZ:6}};
  const frame={canvas:{width:96,height:96,colour:'before'},spec};
  assert.equal(visibleSurface(ground,self,0,-3),true);
  const first=memory.apply(frame,ground,self,1000);assert.ok(first.perception.current>0);
  const old=memory.cells.get('0,-3');assert.equal(old.canvas.colour,'before');
  const unseen=memory.apply({...frame,canvas:{...frame.canvas,colour:'hidden-change'}},{...ground,block:()=>null},self,2000);
  assert.equal(unseen.perception.current,0);assert.ok(unseen.perception.historical>0);
  assert.equal(memory.cells.get('0,-3'),old);assert.equal(old.seenAt,1000);
  memory.clear();assert.equal(memory.cells.size,0);
});
test('hearing uses packet direction and coarse distance but never leaks identity, coordinate or count',()=>{
  const event={name:'entity.zombie.ambient',category:'hostile',volume:1,entityId:99,position:{x:6,y:64,z:-5}};
  const hint=hearingHint(event,self,1000);
  assert.deepEqual(hint,{source:'hearing',kind:'怪物声',direction:'东北',distance:'中距离',heardAt:1000,expiresAt:5000});
  assert.equal(hearingHint({...event,position:{x:100,y:64,z:0}},self),null);
  assert.equal(hearingHint({...event,volume:0},self),null);
  assert.equal(hearingHint({...event,entityId:1},self),null);
});
test('attention modes rank urgent warnings and clear forecasts as soon as an entity disappears',()=>{
  const e=(id,x,kind)=>({id,pos:{x,y:64,z:-4},kind});
  const rows=[e(1,0,'npc'),e(2,0,'hostile'),e(3,0,'neutral')];
  const classify=e=>({kind:e.kind});
  assert.deepEqual(focusEntities(rows,'combat',self,classify).map(e=>e.id),[2]);
  assert.equal(focusEntities(rows,'peaceful',self,classify)[0].id,2);
  const motion=new VisibleMotion();assert.equal(motion.sample([rows[1]],1000)[0].forecast,null);
  const next=motion.sample([{...rows[1],pos:{x:1,y:64,z:-4}}],1500)[0];
  assert.equal(next.forecast.x,3);assert.equal(next.forecast.probability,null);
  motion.sample([],1600);assert.equal(motion.sample([rows[1]],1700)[0].forecast,null);
});
test('overview refuses an unmasked export even if a caller passes a complete renderer',()=>{
  assert.throws(()=>captureOverview({}, {}, {}),/visibility mask/);
});
