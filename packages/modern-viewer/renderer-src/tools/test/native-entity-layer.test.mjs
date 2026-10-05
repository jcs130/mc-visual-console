import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {NativeEntityLayer} from '../../src/native-viewer/native-entity-layer.js'

const entity=(id=2)=>({entityId:id,uuid:`entity-${id}`,name:'minecraft:pig',metadata:[],equipment:[],motion:{tick:1}})
const state=entities=>({available:true,entities})
const finish=async layer=>{while(layer.running)await new Promise(resolve=>setImmediate(resolve))}

test('same-account self is excluded; entity frames reuse actors, deletion disposes them',async()=>{
  const created=[],updates=[],disposed=[]
  const layer=new NativeEntityLayer(null,{createActor:async(reader,e)=>{created.push(e.entityId);return{root:new THREE.Group(),update(e,now){updates.push([e.entityId,e.motion.tick,now])},dispose(){this.root.removeFromParent();disposed.push(e.entityId)}}}})
  layer.stage(state([entity(1),entity(2)]),{selfEntityId:1});await finish(layer)
  assert.deepEqual(created,[2]);assert.equal(layer.diagnostics().received,1)
  layer.stage(state([{...entity(),motion:{tick:7}}]),{selfEntityId:1});await finish(layer);layer.frame(500)
  assert.deepEqual(updates,[[2,7,500]]);assert.deepEqual(created,[2])
  layer.stage(state([]));await finish(layer);assert.deepEqual(disposed,[2]);assert.equal(layer.root.children.length,0)
})
test('async actors cannot resurrect after disconnect or epoch reset',async()=>{
  let resolve,disposed=0
  const layer=new NativeEntityLayer(null,{createActor:()=>new Promise(r=>{resolve=r})})
  layer.stage(state([entity()]));assert.equal(layer.running,true)
  layer.stage({available:false,reason:'disconnected'})
  resolve({root:new THREE.Group(),update(){},dispose(){disposed++}});await finish(layer)
  assert.equal(disposed,1);assert.equal(layer.actors.size,0);assert.equal(layer.root.children.length,0)
  assert.deepEqual(layer.diagnostics().issues,['disconnected']);layer.dispose()
})
test('foreign registries never bind; unsupported failures stay explicit without retry storms',async()=>{
  const registry={playerUuid:'other',source:'server_builtin_registries',villagerTypes:[]},seen=[]
  const layer=new NativeEntityLayer(null,{createActor:async(reader,e,options)=>{seen.push(options.registries);throw Error('original renderer missing')}})
  layer.stage({...state([entity()]),renderRegistries:registry},{playerUuid:'self'});await finish(layer)
  layer.stage({...state([entity()]),renderRegistries:registry},{playerUuid:'self'});await finish(layer)
  assert.deepEqual(seen,[null]);assert.deepEqual(layer.diagnostics().issues,['minecraft:pig：original renderer missing'])
  layer.stage(state([{...entity(),metadata:[{key:0,value:32}]}]));await finish(layer);assert.equal(seen.length,2)
  layer.dispose();assert.equal(layer.failures.size,0)
})
