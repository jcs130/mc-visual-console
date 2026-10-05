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

test('maid required bridge and original dynamic availability changes retry once and recover after NONE or hurt countdown',async()=>{
  let attempts=0,disposed=0
  const row=(patch={},maidRenderState={backItem:null})=>({...entity(),name:'touhou_little_maid:maid',maidRenderState,
    motion:{tick:1,maid:{hurtTime:0,hurtPending:false,swingPending:false,animationId:0,swimAmount:0,swimAmountOld:0,...patch}}})
  const layer=new NativeEntityLayer(null,{createActor:async(reader,e)=>{
    attempts++
    if(!e.maidRenderState)throw Error('NATIVE_TLM_TRACKED_RENDER_STATE_UNAVAILABLE')
    if(e.motion.maid.animationId!==0)throw Error('NATIVE_TLM_SPECIAL_ANIMATION_UNSUPPORTED')
    if(e.motion.maid.hurtTime>0)throw Error('NATIVE_TLM_HURT_OVERLAY_UNSUPPORTED')
    return{root:new THREE.Group(),update(){},dispose(){this.root.removeFromParent();disposed++}}
  }})
  layer.stage(state([row({},null)]));await finish(layer);assert.equal(attempts,1)
  layer.stage(state([row({},null)]));await finish(layer);assert.equal(attempts,1)
  layer.stage(state([row()]));await finish(layer);assert.equal(attempts,2);assert.equal(layer.actors.size,1)
  layer.stage(state([{...row(),motion:{...row().motion,tick:50}}]));await finish(layer);assert.equal(attempts,2,'ordinary native ticks reuse the geometry')
  layer.stage(state([row({animationId:4})]));await finish(layer);assert.equal(disposed,1);assert.equal(layer.actors.size,0)
  layer.stage(state([row({animationId:4})]));await finish(layer);assert.equal(attempts,3)
  layer.stage(state([row()]));await finish(layer);assert.equal(attempts,4);assert.equal(layer.actors.size,1)
  layer.stage(state([row({hurtTime:10})]));await finish(layer);assert.equal(attempts,5);assert.equal(layer.actors.size,0)
  layer.stage(state([row({hurtTime:9})]));await finish(layer);assert.equal(attempts,5,'unsupported countdown does not reload every tick')
  layer.stage(state([row()]));await finish(layer);assert.equal(attempts,6);assert.equal(layer.actors.size,1)
  layer.dispose();assert.equal(disposed,3)
})
