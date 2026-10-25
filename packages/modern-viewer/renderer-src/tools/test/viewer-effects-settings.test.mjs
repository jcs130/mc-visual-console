import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import * as Three from 'three';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {ViewerEffectSystem} from '../../src/modern-viewer/viewer-effects.js';

const event=(kind,extra={})=>({schemaVersion:1,kind,seq:1,observedAt:100,position:{x:1,y:2,z:3},
  name:'minecraft:smoke',count:12,offset:{x:1,y:1,z:1},speed:1,...extra});
function fixture(preferences) {
  const scene=new Group(),entity=new Group(),frames=new Map();let serial=0;
  entity.originalEntity={height:1.8};scene.add(entity);
  const system=new ViewerEffectSystem({getWorld:()=>({scene}),getEntity:()=>entity,now:()=>100,
    requestFrame:fn=>{frames.set(++serial,fn);return serial;},cancelFrame:id=>frames.delete(id),preferences});
  return {system,scene,entity,frames};
}
test('disabling effects frees active geometry/materials, detaches meshes and cancels its animation frame',()=>{
  const {system,scene,entity,frames}=fixture();
  for(const e of [event('particle'),event('burst',{style:'hurt'}),event('sound'),event('status',{entityId:2,effectId:1})])assert.equal(system.handle(e),true);
  const active=[...system.entries];let geometryDisposed=0,materialDisposed=0;
  for(const entry of active){entry.geometry.addEventListener('dispose',()=>geometryDisposed++);entry.material.addEventListener('dispose',()=>materialDisposed++);}
  assert.equal(frames.size,1);assert.ok(system.activeParticles>0);
  system.setPreferences({particles:false,effectCues:false});
  assert.equal(geometryDisposed,active.length);assert.equal(materialDisposed,active.length);
  assert.equal(scene.children.length,1);assert.equal(entity.children.length,0);
  assert.equal(system.statusEntries.size,0);assert.equal(system.getDiagnostics().activeEffects,0);
  assert.equal(system.getDiagnostics().activeParticles,0);assert.equal(frames.size,0);
  for(let n=0;n<200;n++)assert.equal(system.handle(event('particle',{seq:n})),false);
  assert.equal(system.getDiagnostics().suppressed,200);assert.equal(system.getDiagnostics().dropped,0);
  assert.equal(system.entries.length,0);assert.equal(frames.size,0);
  system.setPreferences({particles:true,effectCues:true});
  assert.equal(system.entries.length,0,'no replay of suppressed events');
  assert.equal(system.handle(event('particle',{seq:300})),true);assert.equal(frames.size,1);system.dispose();
});
test('particle and cue switches are independent, including suppressed chat history',()=>{
  const {system,frames}=fixture({effectCues:false});
  assert.equal(system.handle(event('particle')),true);
  assert.equal(system.handle(event('sound')),false);
  const hint={id:'fixture-hint',message:'Naruto 使用螺旋丸'};
  assert.equal(system.ingestChat([hint]),null);
  system.setPreferences({particles:false,effectCues:true});
  assert.equal(system.getDiagnostics().activeParticles,0);assert.equal(frames.size,0);
  assert.equal(system.ingestChat([hint]),null,'enabling cues does not replay old chat');
  assert.equal(system.handle(event('burst',{style:'hurt'})),false);
  assert.equal(system.handle(event('sound')),true);assert.equal(frames.size,1);system.dispose();
});

test('the bundled Mineflayer presentationEvent particle layer obeys the same switch without an idle render loop',()=>{
  const scene=new Group(),frames=new Map(),handlers=new Map();let serial=0,now=10;
  const context=vm.createContext({THREE:Three,world:{scene,sceneOrigin:{toSceneX:x=>x,toSceneY:y=>y,toSceneZ:z=>z}},
    sceneSettings:{particles:false},pendingAvatarState:null,latestPosition:null,
    performance:{now:()=>now},document:{documentElement:{}},window:{addEventListener(){}},
    getComputedStyle:()=>({getPropertyValue:()=>''}),socket:{on:(name,fn)=>handlers.set(name,fn)},
    requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:id=>frames.delete(id)});
  vm.runInContext(readFileSync(new URL('../minecraft-viewer-particles.js',import.meta.url),'utf8'),context);
  const particle=context.MinecraftViewerParticles,deliver=handlers.get('presentationEvent');
  const sample={kind:'particle',name:'flame',count:10,position:{x:0,y:65,z:0}};
  deliver(sample);assert.equal(particle.getDiagnostics().allocated,false);assert.equal(frames.size,0);
  particle.setEnabled(true);deliver(sample);
  assert.equal(particle.getDiagnostics().particles,10);assert.equal(frames.size,1);
  const cloud=scene.children[0];let disposed=0;
  cloud.geometry.addEventListener('dispose',()=>disposed++);cloud.material.addEventListener('dispose',()=>disposed++);
  particle.setEnabled(false);assert.equal(disposed,2);assert.equal(scene.children.length,0);assert.equal(frames.size,0);
  for(let n=0;n<100;n++)deliver({...sample,kind:'explosion'});
  assert.equal(particle.getDiagnostics().allocated,false);assert.equal(frames.size,0);
  particle.setEnabled(true);assert.equal(frames.size,0);deliver(sample);
  const pending=[...frames.values()][0];frames.clear();now=5000;pending(now);
  assert.equal(particle.getDiagnostics().allocated,false);assert.equal(frames.size,0,'expired events release their layer and stop scheduling');
});
