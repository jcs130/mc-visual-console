import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Texture} from 'three';
import {PARTICLE_LIMITS,ServerParticles} from '../src/modern-viewer/server-particles.js';
import {EventEmitter} from 'node:events';
import minecraftData from 'minecraft-data';
import {createViewerContentBridge} from '../host/viewer-content.mjs';
const assets={particleDefinitions:{dust:['minecraft:generic_0'],dust_color_transition:['minecraft:generic_0']},particleSprites:{'minecraft:generic_0':{uv:[0,0,1,1]}}};
function setup() {
  let time=0;const world={scene:new Scene(),sceneOrigin:{toSceneX:x=>x-10,toSceneY:y=>y-64,toSceneZ:z=>z+5}};
  const particles=new ServerParticles({getWorld:()=>world,now:()=>time,random:()=>.5});particles.setAssets(assets,new Texture());
  return {particles,world,time:t=>time=t};
}
const event={name:'dust_color_transition',position:{x:11.25,y:65.5,z:-3.75},spread:{x:0,y:0,z:0},speed:0,count:1,size:1.5,color:[.25,.5,.75],colorEnd:[1,0,.125],exact:true};
test('disabled particleBatch rendering does not queue or allocate GPU buffers and disposes existing buffers on toggle',()=>{
  const world={scene:new Scene(),sceneOrigin:{toSceneX:x=>x,toSceneY:y=>y,toSceneZ:z=>z}};
  const p=new ServerParticles({enabled:false,getWorld:()=>world,now:()=>0});
  const batch={schemaVersion:1,events:[event]};
  p.handleBatch(batch);assert.equal(p.pending.length,0);
  p.setAssets(assets,new Texture());assert.equal(p.cloud,null);p.tick();assert.equal(world.scene.children.length,0);
  p.setEnabled(true);assert.equal(p.stats().active,0);p.handleBatch(batch);p.tick();assert.equal(p.stats().active,1);
  const cloud=p.cloud;let disposed=0;cloud.geometry.addEventListener('dispose',()=>disposed++);cloud.material.addEventListener('dispose',()=>disposed++);
  p.setEnabled(false);assert.equal(disposed,2);assert.equal(p.cloud,null);assert.equal(world.scene.children.length,0);
  p.handleBatch(batch);p.tick();assert.equal(p.pending.length,0);assert.equal(p.cloud,null);
  p.setEnabled(true);assert.equal(p.stats().active,0);assert.equal(p.stats().suppressed,2);p.dispose();
});
test('actual GPU buffers preserve zero-speed positions, dust size and interpolated end color',()=>{
  const s=setup(),p=s.particles;p.handleBatch({schemaVersion:1,events:[event]});p.tick(0);
  const g=p.cloud.geometry;assert.deepEqual([...g.attributes.position.array.slice(0,3)],[1.25,1.5,1.25]);assert.equal(g.attributes.size.array[0],1.5);
  s.time(500);p.tick(500);assert.deepEqual([...g.attributes.position.array.slice(0,3)],[1.25,1.5,1.25]);assert.deepEqual([...g.attributes.color.array.slice(0,3)],[.625,.25,.4375]);
  p.tick(1001);assert.equal(g.drawRange.count,0);p.dispose();assert.equal(s.world.scene.children.length,0);
});
test('a 32-point native star remains 32 distinct points; per-frame and total budgets are bounded',()=>{
  const s=setup(),p=s.particles;
  p.handleBatch({schemaVersion:1,events:Array.from({length:32},(_,i)=>({...event,position:{x:11+i*.005,y:65,z:-3}}))});p.tick();
  assert.equal(p.cloud.geometry.drawRange.count,32);assert.equal(new Set([...p.cloud.geometry.attributes.position.array.slice(0,96)].filter((_,i)=>i%3===0)).size,32);
  assert.equal(p.handleBatch({schemaVersion:1,events:Array(PARTICLE_LIMITS.batch+1).fill(event)}),false);
  for(let i=0;i<60;i++)p.handleBatch({schemaVersion:1,events:[{...event,count:48}]});p.tick();
  assert.equal(p.stats().active,PARTICLE_LIMITS.active);assert.ok(p.stats().dropped>0);p.dispose();
});
test('unknown particles are explicit unsupported and dimension scene changes clear old geometry',()=>{
  const s=setup(),p=s.particles;p.spawn({...event,name:'mod_missing'});assert.equal(p.stats().unsupported,1);
  p.spawn(event);p.tick();s.world.scene=new Scene();p.tick();assert.equal(p.stats().active,0);assert.equal(p.cloud.geometry.drawRange.count,0);p.dispose();
});

test('cosmetics plus two full guide lines retain both target endpoints in GPU geometry',()=>{
  const s=setup(),p=s.particles;
  const lines=Array.from({length:128},(_,i)=>({...event,position:{x:11+(i%64)*.5,y:65,z:i<64?-3:3}}));
  const cosmetics=Array.from({length:32},()=>event);
  assert.equal(p.handleBatch({schemaVersion:1,events:[...cosmetics,...lines]}),true);p.tick();
  const buffer=p.cloud.geometry.attributes.position.array;
  assert.equal(p.cloud.geometry.drawRange.count,160);
  for(const index of [32,95,96,159])assert.deepEqual([...buffer.slice(index*3,index*3+3)],
    [lines[index-32].position.x-10,1,lines[index-32].position.z+5]);
  assert.equal(p.stats().dropped,0);p.dispose();
});

test('a 500-block forced native guide survives the host bridge into exact GPU endpoints',()=>{
  const s=setup(),protocol=new EventEmitter();let flush;
  const bot=Object.assign(new EventEmitter(),{version:'1.20.6',registry:minecraftData('1.20.6'),_client:protocol,entities:{},entity:{position:{x:0,y:64,z:0}}});
  const bridge=createViewerContentBridge(bot,{schedule:fn=>{flush=fn;return 1;},unschedule(){}});
  bridge.subscribe((name,value)=>{if(name==='particleBatch')s.particles.handleBatch(value);});
  for(let i=0;i<64;i++)protocol.emit('world_particles',{
    x:i*500/63,y:64,z:0,longDistance:true,amount:1,offsetX:0,offsetY:0,offsetZ:0,velocityOffset:0,
    particle:{type:'dust',data:{red:1,green:1,blue:1,scale:1}}
  });
  flush();s.particles.tick();const g=s.particles.cloud.geometry;
  assert.equal(g.drawRange.count,64);assert.deepEqual([...g.attributes.position.array.slice(0,3)],[-10,0,5]);
  assert.deepEqual([...g.attributes.position.array.slice(63*3,64*3)],[490,0,5]);
  assert.equal(bridge.stats().droppedParticles,0);assert.equal(s.particles.stats().dropped,0);bridge.dispose();s.particles.dispose();
});
