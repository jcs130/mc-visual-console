import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { stageNativeKineticActors, NATIVE_KINETIC_ACTOR_LIMIT } from '../../src/native-viewer/native-kinetic-layer.js'

const definitions=new Map([[1,{stateId:1,name:'create:millstone'}],[2,{stateId:2,name:'create:shaft'}]])
const node=(x,speed=32,stateId=1)=>({position:{x,y:66,z:-3},stateId,speed})
function fixture(){
  const actors=new Map(),scene=new THREE.Group(),created=[],removed=[];let current=true
  const createActor=async(state,position)=>{
    const root=new THREE.Group();root.position.set(position.x+.5,position.y+.5,position.z+.5)
    const actor={state,position,root,speed:null,disposed:false,setSpeed(value){this.speed=value},dispose(){this.disposed=true;root.removeFromParent()}}
    created.push(actor);return actor
  }
  const options={definitions,actors,createActor,attach:actor=>scene.add(actor.root),remove:actor=>{removed.push(actor);actor.dispose()},isCurrent:()=>current}
  return{actors,scene,created,removed,options,stage:nodes=>stageNativeKineticActors({...options,nodes}),retire:()=>{current=false}}
}

test('actual signed/zero RPM updates reuse the bound actor; null RPM removes stale rotation instead of pretending to stop',async()=>{
  const h=fixture();assert.equal((await h.stage([node(8,32)])).current,true)
  const first=h.actors.get('8,66,-3');assert.equal(first.speed,32);assert.equal(h.scene.children.length,1)
  await h.stage([node(8,0)]);assert.strictEqual(h.actors.get('8,66,-3'),first);assert.equal(first.speed,0)
  await h.stage([node(8,-32)]);assert.equal(first.speed,-32);assert.equal(h.created.length,1)
  const unavailable=await h.stage([node(8,null)])
  assert.match(unavailable.issues[0],/SPEED_UNAVAILABLE/);assert.equal(h.actors.size,0);assert.equal(h.scene.children.length,0);assert.equal(first.disposed,true)
  assert.deepEqual((await h.stage([node(8,32)])).issues,[],'fresh state cannot return an old unavailable diagnostic')
  assert.equal(h.created.length,2)
})

test('one source failure is isolated; replacement/removal clear the previous geometry and never keep an earlier successful speed',async()=>{
  const h=fixture(),create=h.options.createActor
  h.options.createActor=async(state,p)=>{if(p.x===9)throw Error('NATIVE_RESOURCE_PRIORITY_UNRESOLVED:inner');return create(state,p)}
  let staged=await h.stage([node(8),node(9)])
  assert.equal(h.scene.children.length,1);assert.match(staged.issues[0],/PRIORITY_UNRESOLVED/)
  const old=h.actors.get('8,66,-3');await h.stage([node(8,16,2)]);assert.equal(old.disposed,true)
  assert.equal(h.actors.get('8,66,-3').state.name,'create:shaft');assert.equal(h.scene.children.length,1)
  const before=h.actors.get('8,66,-3');staged=await h.stage([])
  assert.deepEqual(staged.issues,[]);assert.equal(before.disposed,true);assert.equal(h.scene.children.length,0)
})

test('late original mesh after disconnect/epoch retirement is disposed before attach, with no actor resurrection',async()=>{
  const h=fixture();let finish
  const create=h.options.createActor;h.options.createActor=(state,p)=>new Promise(resolve=>{finish=async()=>resolve(await create(state,p))})
  const task=h.stage([node(8)])
  await new Promise(resolve=>setImmediate(resolve));h.retire();await finish()
  assert.equal((await task).current,false);assert.equal(h.scene.children.length,0);assert.equal(h.actors.size,0);assert.equal(h.created[0].disposed,true)
})

test('duplicate/malformed/unregistered nodes fail closed, finite budgets cannot allocate an unbounded actor table, non-Object3D is rejected before scene.add',async()=>{
  for(const nodes of [[node(8),node(8,0)],[{...node(8),position:{x:NaN,y:66,z:-3}}],[node(8,32,99)],Array(4097)]){
    const h=fixture();await h.stage([node(7)]);const old=h.created[0]
    const staged=await h.stage(nodes);assert.match(staged.issues[0],/SNAPSHOT_.*UNAVAILABLE/)
    assert.equal(h.actors.size,0);assert.equal(h.scene.children.length,0);assert.equal(old.disposed,true)
  }
  const h=fixture(),staged=await h.stage(Array.from({length:NATIVE_KINETIC_ACTOR_LIMIT+1},(_,i)=>node(i)))
  assert.equal(h.actors.size,NATIVE_KINETIC_ACTOR_LIMIT);assert.match(staged.issues[0],/ACTOR_BUDGET_EXCEEDED/)
  const invalid=fixture();let disposed=0
  invalid.options.createActor=async state=>({state,root:{},dispose(){disposed++}})
  const blocked=await invalid.stage([node(8)])
  assert.match(blocked.issues[0],/ACTOR_BINDING_UNAVAILABLE/);assert.equal(invalid.scene.children.length,0);assert.equal(invalid.actors.size,0);assert.equal(disposed,1)
})
