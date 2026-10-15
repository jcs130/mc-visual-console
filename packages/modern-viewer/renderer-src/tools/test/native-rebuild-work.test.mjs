import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { NativeTerrainQueue, createNativeRebuildWork, NativeStaticStage, isNativeRebuildRetired, nativeStaticSignature } from '../../src/native-viewer/native-rebuild-work.js'

test('terrain signature includes biome grid origin, dimensions and world clamp even if quart IDs repeat', () => {
  const snapshot = { groups: [], neighbors: [], biomeSeed: '1', biomes: [], biomeGrid: { x: 0, y: 0, z: 0, width: 1, height: 1, depth: 1, worldMinY: -16, worldMaxY: 79, ids: [1] } }
  const before = nativeStaticSignature(snapshot)
  for (const property of ['x', 'y', 'z', 'width', 'height', 'depth', 'worldMinY', 'worldMaxY'])
    assert.notEqual(nativeStaticSignature({ ...snapshot, biomeGrid: { ...snapshot.biomeGrid, [property]: snapshot.biomeGrid[property] + 1 } }), before, property)
  assert.notEqual(nativeStaticSignature({ ...snapshot, biomeSeed: '2' }), before)
})

test('budget checks yield between expensive units and check retirement before and after suspension', async () => {
  let time = 0, current = true, yields = 0
  const work = createNativeRebuildWork({ now: () => time, budgetMs: 4, isCurrent: () => current, yieldTask: async () => { yields++; time += 50 } })
  assert.equal(work.checkpoint(), null)
  time = 5; await work.checkpoint(); assert.equal(yields, 1)
  assert.equal(work.checkpoint(), null, 'waiting time is excluded from the next work slice')
  current = false
  assert.throws(() => work.checkpoint(), isNativeRebuildRetired)
  current = true; time += 5
  const retired = createNativeRebuildWork({ now: () => time, isCurrent: () => current, yieldTask: async () => { current = false } })
  time += 5
  await assert.rejects(retired.checkpoint(), isNativeRebuildRetired)
})

test('a static stage keeps the complete scene until commit and frees only owned resources on retirement', () => {
  const active = new THREE.Group(), previous = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
  let oldDisposed = 0, fluidDisposed = 0, sharedDisposed = 0, instanceDisposed = 0
  previous.dispose = () => oldDisposed++; active.add(previous)
  const stage = new NativeStaticStage(), fluid = new THREE.Mesh(new THREE.BoxGeometry(), previous.material)
  fluid.userData.nativeFluid = true; fluid.geometry.addEventListener('dispose', () => fluidDisposed++)
  const instance = new THREE.InstancedMesh(previous.geometry, previous.material, 1)
  instance.addEventListener('dispose', () => instanceDisposed++); previous.geometry.addEventListener('dispose', () => sharedDisposed++)
  stage.add(fluid); stage.add(instance)
  assert.deepEqual(active.children, [previous])
  assert.throws(() => stage.commit(active, () => false), isNativeRebuildRetired)
  stage.dispose(); stage.dispose()
  assert.equal(fluidDisposed, 1); assert.equal(instanceDisposed, 1); assert.equal(sharedDisposed, 0); assert.equal(oldDisposed, 0)
  const ready = new NativeStaticStage(), replacement = new THREE.Group(); ready.add(replacement)
  ready.commit(active, () => true); ready.dispose()
  assert.deepEqual(active.children, [replacement]); assert.equal(oldDisposed, 1)
})

test('production terrain queue retires A, coalesces B into C and preserves complete active scene',async()=>{
 const queue=new NativeTerrainQueue(),active=new THREE.Group(),old=new THREE.Group();active.add(old)
 const snapshot=id=>({epoch:1,groups:[id],kinetic:[]}),commits=[],disposed=[];let release
 const gate=new Promise(resolve=>release=resolve)
 queue.request(snapshot('A'))
 const running=queue.run(async(value,isCurrent)=>{
   const id=value.groups[0],stage=new NativeStaticStage(),mesh=new THREE.Group();mesh.dispose=()=>disposed.push(id);stage.add(mesh)
   try {if(id==='A')await gate;stage.commit(active,isCurrent);commits.push(id)}finally{stage.dispose()}
 })
 queue.request(snapshot('B'));queue.request(snapshot('C'));assert.equal(queue.request(snapshot('C')),false)
 assert.deepEqual(active.children,[old]);release();await running
 assert.deepEqual(commits,['C']);assert.deepEqual(disposed,['A']);assert.equal(queue.stats.retiredWorkCount,1)
 queue.request(snapshot('D'));const later=queue.run(async(_,isCurrent)=>{queue.reset();assert.throws(()=>new NativeStaticStage().commit(active,isCurrent),isNativeRebuildRetired)})
 await later;assert.equal(active.children.length,1);assert.equal(queue.running,false)
})


test('actual scene rebuild preserves crank history and defers live updates through A -> B -> C',async()=>{
 const {readFile}=await import('node:fs/promises')
 const {stageNativeKineticActors}=await import('../../src/native-viewer/native-kinetic-layer.js')
 const {createKineticActor,CREATE_JAR_SHA256}=await import('../../src/native-viewer/create-kinetics.js')
 const source=await readFile(new URL('../../src/native-viewer/native-scene.js',import.meta.url),'utf8')
 const rebuild=source.slice(source.indexOf('async function rebuildLatest ()'),source.indexOf('function fail (error)'))
 const queue=new NativeTerrainQueue(),actors=new Map(),worldRoot=new THREE.Group(),statics=new THREE.Group(),created=[],disposed=new Map(),commits=[]
 const state={stateId:1,name:'create:hand_crank',properties:{facing:'north'}},node=(x,speed=32)=>({stateId:1,position:{x,y:0,z:0},speed})
 let hold=false,release,entered
 const loader={reader:{manifest:{sources:[{name:'create-1.21.1-6.0.10.jar',sha256:CREATE_JAR_SHA256}]}},block:async()=>new THREE.Group(),model:async()=>new THREE.Group(),releaseModel(){}}
 const create=async(...args)=>{const actor=await createKineticActor(...args);created.push(actor);const original=actor.dispose;actor.dispose=()=>{disposed.set(actor,(disposed.get(actor)||0)+1);original()};if(hold&&actor.position.x===1){entered?.();await new Promise(r=>release=r)}return actor}
 const run=Function('THREE','terrainQueue','actors','worldRoot','statics','loader','createKineticActor','stageNativeKineticActors','nativeStaticSignature','NativeStaticStage','createNativeRebuildWork','commits',`
 let generation=1,disposed=false,current={},lastGroupSignature=null,staticIssues=[],unknown=[],drawn=0,terrainRaycast,lastCollision,firstTerrainRender;
 const terrainPhases={},colormaps={},camera={position:{lengthSq:()=>1}},viewMode='third',pointKey=p=>JSON.stringify(p),removeActor=a=>a.dispose(),roomVisibility={stage:s=>commits.push(s.biomeSeed)},publishDiagnostics=()=>{},fail=e=>{throw e},createNativeEnvironment=()=>({clear(){}}),createNativeTerrainRaycast=()=>null;
 ${rebuild};return rebuildLatest`)(THREE,queue,actors,worldRoot,statics,loader,create,stageNativeKineticActors,nativeStaticSignature,NativeStaticStage,createNativeRebuildWork,commits)
 const snapshot=(id,nodes)=>({epoch:1,states:[state],groups:[],kinetic:nodes,biomeSeed:id})
 queue.request(snapshot('initial',[node(0),node(4)]));await run()
 const crank=actors.get('0,0,0'),removed=actors.get('4,0,0');for(let i=0;i<10;i++)crank.tick()
 const history={...crank.motion};queue.request(snapshot('unrelated',[node(0),node(4)]));await run()
 assert.equal(actors.get('0,0,0'),crank);assert.deepEqual({...crank.motion},history);assert.equal(created.length,2)
 hold=true;const waiting=new Promise(r=>entered=r);queue.request(snapshot('A',[node(0,-32),node(1)]));const active=run();await waiting
 assert.equal(crank.motion.speed,32);assert.equal(actors.get('4,0,0'),removed)
 crank.tick();const continued={...crank.motion};queue.request(snapshot('B',[node(0,0)]));queue.request(snapshot('C',[node(0,64),node(2)]))
 release();await active
 assert.equal(actors.get('0,0,0'),crank);assert.equal(crank.motion.angle,continued.angle);assert.equal(crank.motion.velocity,continued.velocity);assert.equal(crank.motion.tick,continued.tick);assert.equal(crank.motion.speed,64)
 assert.deepEqual(commits,['initial','unrelated','C']);assert.equal(disposed.get(crank),undefined);assert.equal(disposed.get(removed),1)
 const canceled=created.find(a=>a.position.x===1);assert.equal(disposed.get(canceled),1);assert.equal(actors.has('1,0,0'),false)
 queue.request(snapshot('removed',[]));await run();assert.equal(disposed.get(crank),1);assert.equal(disposed.get(created.find(a=>a.position.x===2)),1)
})
