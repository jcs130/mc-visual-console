import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Texture} from 'three';
import {PARTICLE_LIMITS,ServerParticles} from '../src/modern-viewer/server-particles.js';
const assets={particleDefinitions:{dust:['minecraft:generic_0'],dust_color_transition:['minecraft:generic_0']},particleSprites:{'minecraft:generic_0':{uv:[0,0,1,1]}}};
function setup() {
  let time=0;const world={scene:new Scene(),sceneOrigin:{toSceneX:x=>x-10,toSceneY:y=>y-64,toSceneZ:z=>z+5}};
  const particles=new ServerParticles({getWorld:()=>world,now:()=>time,random:()=>.5});particles.setAssets(assets,new Texture());
  return {particles,world,time:t=>time=t};
}
const event={name:'dust_color_transition',position:{x:11.25,y:65.5,z:-3.75},spread:{x:0,y:0,z:0},speed:0,count:1,size:1.5,color:[.25,.5,.75],colorEnd:[1,0,.125],exact:true};
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
  assert.equal(p.handleBatch({schemaVersion:1,events:Array(65).fill(event)}),false);
  for(let i=0;i<60;i++)p.handleBatch({schemaVersion:1,events:[{...event,count:48}]});p.tick();
  assert.equal(p.stats().active,PARTICLE_LIMITS.active);assert.ok(p.stats().dropped>0);p.dispose();
});
test('unknown particles are explicit unsupported and dimension scene changes clear old geometry',()=>{
  const s=setup(),p=s.particles;p.spawn({...event,name:'mod_missing'});assert.equal(p.stats().unsupported,1);
  p.spawn(event);p.tick();s.world.scene=new Scene();p.tick();assert.equal(p.stats().active,0);assert.equal(p.cloud.geometry.drawRange.count,0);p.dispose();
});
