import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
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
