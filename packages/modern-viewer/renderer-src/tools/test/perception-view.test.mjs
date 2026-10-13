import test from 'node:test';
import assert from 'node:assert/strict';
import {SightGrid,clearSight,visibleEntity,visibleSurface,hearingHint,TerrainMemory} from '../../src/modern-viewer/perception-view.js';
import {VisibleMotion,focusEntities} from '../../src/modern-viewer/perception-risk.js';
import {captureOverview} from '../../src/modern-viewer/overview-capture.js';
const air={name:'air',shapes:[]},stone={name:'stone',shapes:[[0,0,0,1,1,1]]};
const self={id:1,pos:{x:.5,y:64,z:.5},yaw:0,pitch:-.2};
const ground={top:()=>64,block:(_x,y)=>y<64?stone:air};

test('sight collision cache avoids repeated decoding and invalidates on update, removal and reset',()=>{
  const grid=new SightGrid('1.20.6');let reads=0,current=stone;
  grid.columns.set('0,0',{getBlock:()=>{reads++;return current;},setBlockStateId:()=>{current=air;}});
  assert.equal(grid.block(1,64,1),stone);assert.equal(grid.block(1,64,1),stone);assert.equal(reads,1);
  grid.update({x:1,y:64,z:1},0);assert.equal(grid.block(1,64,1),air);assert.equal(reads,2);
  grid.remove(0,0);assert.equal(grid.block(1,64,1),null);assert.equal(grid.blocks.size,0);
  grid.clear();assert.equal(grid.columns.size,0);
});

test('a budgeted map sees geometry from its captured instant even when live blocks or columns change',()=>{
  const grid=new SightGrid('1.20.6');let block=stone,stateId=1;
  grid.columns.set('0,0',{getBlock:()=>block,getBlockStateId:()=>stateId,setBlockStateId:n=>{block=air;stateId=0;}});
  const snap=grid.snapshot();grid.update({x:1,y:64,z:1},0);
  assert.equal(snap.block(1,64,1),stone);assert.equal(snap.columns.get('0,0').getBlockStateId({x:1,y:64,z:1}),1);
  assert.equal(grid.block(1,64,1),air);grid.remove(0,0);assert.equal(snap.block(1,64,1),stone);
  assert.equal(grid.readers.size,1);snap.release();assert.equal(grid.readers.size,0);
});
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

test('budgeted visibility yields, publishes only completed masks, and cancels reset or changed geometry',async()=>{
  const memory=new TerrainMemory(documentStub()),spec={width:96,height:96,span:12,bounds:{minX:-6,maxX:6,minZ:-6,maxZ:6}},frame={canvas:{width:96,height:96,colour:'known'},spec};
  let ticks=0,yields=0;const clock=()=>++ticks;
  const result=await memory.applyBudgeted(frame,ground,self,{clock,yieldFrame:async()=>{yields++;assert.equal(memory.cells.size,0,'partial work is private');}});
  assert.ok(yields>1);assert.ok(result.perception.current>0);
  assert.deepEqual([...result.visibleCells],[...new TerrainMemory(documentStub()).apply(frame,ground,self).visibleCells]);
  for(const cause of ['reset','geometry']){
    const m=new TerrainMemory(documentStub()),grid={...ground,revision:0};
    const canceled=await m.applyBudgeted(frame,grid,self,{clock,yieldFrame:async()=>{if(cause==='reset')m.clear();else grid.revision++;}});
    assert.equal(canceled,null);assert.equal(m.cells.size,0);
  }
});
test('terrain history freezes unseen pixels, never accepts hidden updates, and explicitly resets',()=>{
  const memory=new TerrainMemory(documentStub()),spec={width:96,height:96,span:12,bounds:{minX:-6,maxX:6,minZ:-6,maxZ:6}};
  const frame={canvas:{width:96,height:96,colour:'before'},spec};
  assert.equal(visibleSurface(ground,self,0,-3),true);
  const first=memory.apply(frame,ground,self,1000);assert.ok(first.perception.current>0);
  let old=memory.cells.get('0,-3');assert.equal(old.canvas.colour,'before');
  memory.apply(frame,ground,self,1000);assert.equal(memory.cells.get('0,-3').canvas,old.canvas,'reuse visible tile allocation');old=memory.cells.get('0,-3');
  const unseen=memory.apply({...frame,canvas:{...frame.canvas,colour:'hidden-change'}},{...ground,block:()=>null},self,2000);
  assert.equal(unseen.perception.current,0);assert.ok(unseen.perception.historical>0);
  assert.equal(memory.cells.get('0,-3'),old);assert.equal(old.seenAt,1000);
  memory.clear();assert.equal(memory.cells.size,0);
});

test('local height sampling keeps ceilings, walls and other levels out of underground map evidence',()=>{
  const grid=new SightGrid('1.20.6'),layer={kind:'slice',minY:-39,maxY:-29.75};
  grid.columns.set('0,0',{getBlockStateId:p=>p.y===65||p.y<=-32?1:0,getBlock:()=>stone});
  assert.equal(grid.top(0,0),66);
  assert.equal(grid.top(0,0,layer),-31);
  grid.columns.set('0,0',{getBlockStateId:()=>1,getBlock:()=>stone});grid.tops.clear();
  assert.equal(grid.top(0,0,layer),null,'a solid intersected by the clip plane is unknown');
  const underground={...self,pos:{x:.5,y:-31,z:.5}};
  const tunnel={top:(_x,_z,l)=>l?-31:66,block:(_x,y)=>y<-31||y>=-28?stone:air};
  assert.equal(visibleSurface(tunnel,underground,0,-3),false);
  assert.equal(visibleSurface(tunnel,underground,0,-3,layer),true);
  assert.equal(visibleSurface({...tunnel,block:(x,y,z)=>z===-2?stone:tunnel.block(x,y,z)},underground,0,-3,layer),false);
  const memory=new TerrainMemory(documentStub()),spec={width:96,height:96,span:12,bounds:{minX:-6,maxX:6,minZ:-6,maxZ:6},layer};
  const frame={canvas:{width:96,height:96,colour:'known-floor'},spec};
  assert.ok(memory.apply(frame,tunnel,underground,1000).perception.current>0);
  assert.equal(memory.apply({...frame,spec:{...spec,layer:null}},{...tunnel,block:()=>null},underground,2000).perception.historical,0);
  assert.equal(memory.apply({...frame,spec:{...spec,layer:{kind:'slice',minY:50,maxY:59}}},{...tunnel,block:()=>null},underground,2000).perception.historical,0);
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
