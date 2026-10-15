import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {tmpdir} from 'node:os'
import {webcrypto,createHash} from 'node:crypto'
import * as THREE from 'three'
import {NativeAssetReader} from '../../src/native-viewer/model-loader.js'
import {NativeParticleRandom,NATIVE_PARTICLE_TYPES,nativeParticlePacket,expandNativeParticlePacket,createNativeParticle,tickNativeParticle,nativeParticleFrame,collideNativeParticleVoxel,collideNativeParticleShapes} from '../../src/native-viewer/native-particle-state.js'
import {NativeParticleLayer,createNativeParticleCollision} from '../../src/native-viewer/native-particles.js'
import {loadNativeParticleCollisions,NATIVE_PARTICLE_COLLISION_SHA256} from '../../host/native-particle-collisions.mjs'
import {loadNativeStateRegistry,NativeWorldState} from '../native-world-host.mjs'
import {pngRgba} from './fixtures/png-rgba.mjs'

globalThis.crypto??=webcrypto
const root=fileURLToPath(new URL('../../../asset-packs/vanilla-1.21.1/',import.meta.url))
const manifest=JSON.parse(await fs.readFile(path.join(root,'native-assets.json'),'utf8'))
const reader=()=>new NativeAssetReader(manifest,p=>fs.readFile(path.join(root,p)))
const pos={x:4,y:64,z:4},velocity={x:.3,y:.2,z:-.1}
const rng=()=>({particle:new NativeParticleRandom(12),math:new NativeParticleRandom(34),world:new NativeParticleRandom(56)})
const packet={x:4,y:64,z:4,offsetX:.1,offsetY:.2,offsetZ:.3,velocityOffset:.6,amount:0,particle:{type:'heart'}}
const near=(a,b)=>assert(Math.abs(a-b)<1e-12,`${a} != ${b}`)

test('native packet preserves directional count-zero floats and positive-count Gaussian draws',()=>{
  const value=nativeParticlePacket(packet),r={gaussian(){throw Error('count zero has no Gaussian draws')}}
  assert.equal(value.count,0);assert.equal(value.randomPhase,'observer_local_not_server_seed')
  assert.deepEqual(expandNativeParticlePacket(value,r),[{position:pos,velocity:{x:Math.fround(Math.fround(.1)*Math.fround(.6)),y:Math.fround(Math.fround(.2)*Math.fround(.6)),z:Math.fround(Math.fround(.3)*Math.fround(.6))}}])
  let draws=0;const samples=expandNativeParticlePacket({...value,count:2},{gaussian(){return ++draws}})
  assert.equal(draws,12);near(samples[0].position.x,4+Math.fround(.1));near(samples[0].velocity.x,4*Math.fround(.6))
  assert.equal(nativeParticlePacket({...packet,particle:{type:'unknown:particle'}}),null)
  assert.equal(nativeParticlePacket({...packet,x:NaN}),null)
  assert.equal(nativeParticlePacket({...packet,amount:-1}),null)
})

test('original constructor order, constructor tick and removal tick remain distinct',()=>{
  const heart=createNativeParticle('heart',pos,velocity,rng()),angry=createNativeParticle('angry_villager',pos,{x:100,y:100,z:100},rng())
  assert.deepEqual(heart.velocity,angry.velocity);assert.equal(angry.position.y,64.5);assert.equal(heart.physics,false)
  const crit=createNativeParticle('crit',pos,velocity,rng()),damage=createNativeParticle('damage_indicator',pos,velocity,rng())
  assert.equal(crit.age,1);assert.equal(damage.age,1);assert.equal(damage.lifetime,20)
  near(damage.position.y-crit.position.y,.4);near(damage.velocity.y-crit.velocity.y,.4*Math.fround(.7))
  const enchanted=createNativeParticle('enchanted_hit',pos,velocity,rng())
  assert.equal(enchanted.color[0],Math.fround(crit.color[0]*Math.fround(.3)))
  assert.equal(enchanted.color[1],Math.fround(crit.color[1]*Math.fround(.8)))
  while(crit.age<crit.lifetime)tickNativeParticle(crit)
  assert.equal(crit.removed,false);assert(nativeParticleFrame(crit,0))
  const green=crit.color[1];tickNativeParticle(crit);assert.equal(crit.removed,true)
  assert.equal(crit.color[1],Math.fround(green*Math.fround(.96)));assert.equal(nativeParticleFrame(crit,0),null)
})

test('original flame field jitter, small-flame box reset and sweep frames are preserved',()=>{
  const flame=createNativeParticle('flame',pos,velocity,rng()),small=createNativeParticle('small_flame',pos,velocity,rng())
  assert.notDeepEqual(flame.position,flame.previous);assert.deepEqual(small.position,flame.position)
  near(small.box[3]-small.box[0],Math.fround(.1));assert.equal(small.size,Math.fround(flame.size*Math.fround(.5)))
  tickNativeParticle(flame,()=>{throw Error('flame move bypasses clipping')})
  near(flame.position.x,pos.x+velocity.x+(flame.velocity.x/Math.fround(.96)-velocity.x))
  const sweep=createNativeParticle('sweep_attack',pos,velocity,rng()),frames=[]
  do{frames.push(nativeParticleFrame(sweep,0,8).sprite)}while(tickNativeParticle(sweep))
  assert.deepEqual(frames,[0,1,3,5,7]);assert.deepEqual(sweep.position,pos)
})

test('discrete collision keeps internal voxel planes, original axis order and epsilon behavior',()=>{
  const voxel={axes:[[0,.5,1],[0,1],[0,1]],dimensions:[2,1,1],occupied:'Aw=='}
  near(collideNativeParticleVoxel(voxel,0,[.1,.1,.1,.4,.3,.3],.2),.1)
  near(collideNativeParticleVoxel(voxel,0,[.6,.1,.1,.9,.3,.3],-.2),-.1)
  const full={axes:[[0,1],[0,1],[0,1]],dimensions:[1,1,1],occupied:'AQ=='}
  assert.deepEqual(collideNativeParticleShapes([.1,1.1,.1,.3,1.3,.3],{x:.1,y:-.2,z:.15},[{voxel:full,position:[0,0,0]}]),{x:.1,y:-.10000000000000009,z:.15})
  assert.equal(collideNativeParticleShapes([0,0,0,.2,.2,.2],{x:1e-8,y:0,z:0},[]).x,1e-8)
  assert.equal(collideNativeParticleShapes([0,0,0,.2,.2,.2],{x:1e-8,y:0,z:0},[{voxel:full,position:[4,0,0]}]).x,0)
})

test('locked original collision export carries discrete grids and explicitly unavailable dynamic states',async t=>{
  const bytes=await fs.readFile(path.join(root,'registry/block-states.jsonl'))
  const hash=createHash('sha256').update(bytes).digest('hex'),states=loadNativeStateRegistry(bytes,hash)
  const loaded=await loadNativeParticleCollisions(root,states,hash)
  assert.equal(loaded.available,true,loaded.reason);assert.equal(loaded.sourceSha256,NATIVE_PARTICLE_COLLISION_SHA256)
  const stone=[...loaded.states.values()].find(s=>s.name==='minecraft:stone')
  assert.equal(stone.collisionFullBlock,true);assert.equal(stone.collisionVoxel.occupied,'AQ==')
  assert([...loaded.states.values()].find(s=>s.name==='minecraft:oak_fence').collisionLarge)
  assert.match([...loaded.states.values()].find(s=>s.name==='minecraft:scaffolding').collisionUnavailable,/dynamic/)
  const airspace={particleCollisions:{available:true},states:[stone],groups:[],bounds:{minX:-8,maxX:15,minY:0,maxY:100,minZ:-8,maxZ:15},viewCoverage:{receivedColumns:['0,0']}}
  const collide=createNativeParticleCollision({...airspace,groups:[{stateId:stone.stateId,positions:[4,63,4]}]})
  assert.equal(collide([4.1,64.1,4.1,4.3,64.3,4.3],{x:0,y:-.2,z:0}).y,-.09999999999999432)
  assert.throws(()=>createNativeParticleCollision({...airspace,viewCoverage:{receivedColumns:[]}})([4,64,4,4.2,64.2,4.2],{x:0,y:0,z:0}),/WORLD_UNRECEIVED/)
  const tmp=await fs.mkdtemp(path.join(tmpdir(),'mc-particle-collision-'));t.after(()=>fs.rm(tmp,{recursive:true,force:true}))
  assert.equal((await loadNativeParticleCollisions(tmp,states,hash)).available,false)
  await fs.mkdir(path.join(tmp,'registry'));await fs.writeFile(path.join(tmp,'registry/particle-collisions.json'),'corrupt')
  assert.equal((await loadNativeParticleCollisions(tmp,states,hash)).reason,'NATIVE_PARTICLE_COLLISION_SOURCE_MISMATCH')
})

test('original sprites decode, preserve UV/cutout and retire on a new connection epoch',async()=>{
  const decoded=[],hashes=new Set(),layer=new NativeParticleLayer(reader(),{seed:1,loadTexture:async bytes=>{const image=pngRgba(bytes);decoded.push(image);hashes.add(createHash('sha256').update(bytes).digest('hex'));return new THREE.Texture()}})
  try{
    for(const name of NATIVE_PARTICLE_TYPES)await layer.template(name)
    assert.equal(decoded.length,47);assert.equal(hashes.size,38);assert(decoded.every(p=>p.width===p.height&&[8,32].includes(p.width)))
    const message={epoch:1,sequence:1,tick:10,observedAt:Date.now(),effect:{kind:'particle',value:nativeParticlePacket(packet)}}
    await layer.event(message);await layer.event(message);assert.equal(layer.live.size,1)
    const row=[...layer.live][0];assert.deepEqual([...layer.geometry.getAttribute('uv').array],[1,0,1,1,0,1,0,0])
    assert.equal(row.mesh.material.alphaTest,.1);assert.equal(row.mesh.material.transparent,false);assert.equal(row.mesh.material.depthWrite,true)
    layer.frame(Date.now(),{tick:11,sampledAt:Date.now()},new THREE.PerspectiveCamera(),{})
    assert.equal(row.state.age,1);assert(layer.diagnostics().issues.includes('NATIVE_PARTICLE_LIGHTMAP_UNAVAILABLE'))
    layer.reset();assert.equal(layer.live.size,0);assert.equal(layer.root.children.length,0)
  }finally{layer.dispose()}
})

test('pending asynchronous particle loads share the budget and cannot resurrect after reset',async()=>{
  let finish;const gate=new Promise(r=>{finish=r}),layer=new NativeParticleLayer(reader(),{loadTexture:async()=>{await gate;return new THREE.Texture()}})
  const calls=Array.from({length:9},(_,i)=>layer.event({epoch:1,sequence:i,tick:1,observedAt:Date.now(),effect:{kind:'particle',value:{...nativeParticlePacket(packet),count:256}}}))
  assert.equal(layer.pending,2048);assert(layer.diagnostics().issues.includes('NATIVE_PARTICLE_REQUEST_EXCEEDS_VIEWER_BUDGET'))
  layer.reset();finish();await Promise.all(calls);assert.equal(layer.live.size,0);assert.equal(layer.pending,0);layer.dispose()
})

test('received particle effects remain bounded transient events and never enter replay snapshots',()=>{
  const states=new Map([[0,{stateId:0,name:'minecraft:air',properties:{},renderShape:'INVISIBLE'}]])
  const world=new NativeWorldState({states,registrySha256:'a'.repeat(64),now:()=>1000,resolveDimension:()=>({name:'minecraft:overworld',minY:-64,height:384})}),events=[]
  world.on('effect',e=>events.push(e));let sequence=0
  const receive=(name,params)=>world.handle({registrySha256:'a'.repeat(64),sequence:++sequence,name,params})
  receive('login',{worldState:{dimension:0}})
  for(let i=0;i<70;i++)receive('world_particles',packet)
  assert.equal(events.length,64);assert.equal(events[0].kind,'particle');assert.equal(world.snapshot().particles,undefined)
})
