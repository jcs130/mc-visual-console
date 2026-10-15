import test from 'node:test'
import assert from 'node:assert/strict'
import {NativeWorldState} from '../native-world-host.mjs'
import {NativeSnapshotCadence} from '../native-snapshot-cadence.mjs'
const bounds={minX:-2,maxX:2,minY:60,maxY:68,minZ:-2,maxZ:2},pose={x:0,y:64,z:0}
export function fixture(){
 const world=new NativeWorldState({states:new Map([[0,{}],[1,{}],[2,{}]]),registrySha256:'a'.repeat(64),resolveDimension:()=>({minY:0,height:256,name:'test'}),simplifyNBT:v=>v})
 let state=1;const chunk={getBlockStateId:()=>state,setBlockStateId:(p,v)=>{state=v},load:()=>{}}
 world.columns.set('10,10',chunk);world.columns.set('0,0',chunk);world.columns.set('-1,0',chunk)
 const cadence=new NativeSnapshotCadence();cadence.completed(pose,0,true,bounds);world.on('world',c=>cadence.invalidate(c))
 return {world,cadence,chunk}
}
test('real world thousands of remote/no-op updates preserve state and do not require builds',()=>{
 const {world,cadence}=fixture()
 for(let i=0;i<5000;i++)world.changeBlock({x:160,y:64,z:160},i%2+1)
 assert.equal(world.stateIdAt({x:160,y:64,z:160}),2);assert.equal(world.revision,5000);assert.equal(cadence.required(pose,1000),false)
 for(let i=0;i<5000;i++)world.changeBlock({x:0,y:64,z:0},2)
 assert.equal(cadence.required(pose,1000),false)
 world.changeBlock({x:3,y:64,z:0},1);assert.equal(cadence.required(pose,1000),true)
})
test('local block entities, complete biome quart halo, new coverage/unload and unknown changes remain conservative',()=>{
 const {cadence}=fixture(),clean=()=>cadence.completed(pose,0,true,bounds)
 for(const change of [{position:{x:-3,y:64,z:0}},{column:{x:-1,z:0}},{column:{x:0,z:0}},undefined,{position:{x:NaN,y:64,z:0}}]){clean();cadence.invalidate(change);assert.equal(cadence.required(pose,1000),true)}
 clean();cadence.invalidate({column:{x:10,z:10}});assert.equal(cadence.required(pose,1000),false)
 cadence.reset();assert.equal(cadence.required(pose,1000),true)
 clean();assert.equal(cadence.required({x:2,y:64,z:0},1000),true)
})

test('real packet load/unload, biomes, block entities and fluid neighbors update exact snapshot output',()=>{
 const states=new Map([[0,{stateId:0,name:'minecraft:air'}],[1,{stateId:1,name:'create:millstone'}],[2,{stateId:2,name:'minecraft:water',fluid:{empty:false}}]])
 const makeChunk=()=>{const cells=new Map();return {load(){},getBlockStateId:p=>cells.get(`${p.x},${p.y},${p.z}`)??0,setBlockStateId:(p,v)=>cells.set(`${p.x},${p.y},${p.z}`,v),getBiome:()=>0}}
 const world=new NativeWorldState({states,registrySha256:'a'.repeat(64),makeChunk,resolveDimension:()=>({minY:0,height:256,name:'fixture'}),simplifyNBT:v=>v}),cadence=new NativeSnapshotCadence()
 let seq=0;const packet=(name,params)=>{world.handle({registrySha256:world.registrySha256,sequence:++seq,name,params});assert.equal(world.error,null)}
 packet('login',{});world.setPose({...pose,yaw:0,pitch:0,eyeHeight:1.62});world.biomes.set(0,{id:0,name:'test:biome'})
 const build=()=>{const value=world.snapshot({halfExtent:2,below:4,above:4});cadence.completed(pose,0,true,value.bounds);return value}
 build();world.on('world',c=>cadence.invalidate(c))
 packet('map_chunk',{x:10,z:10,chunkData:Buffer.alloc(0)});assert.equal(cadence.dirty,false);assert.ok(world.columns.has('10,10'))
 packet('map_chunk',{x:0,z:0,chunkData:Buffer.alloc(0)});assert.equal(cadence.dirty,true)
 let snap=build();assert.ok(snap.viewCoverage.receivedColumns.includes('0,0'));assert.equal(snap.biomeGrid.ids.includes(0),true)
 packet('block_change',{location:{x:0,y:64,z:0},type:1});assert.equal(cadence.dirty,true);build()
 packet('tile_entity_data',{location:{x:0,y:64,z:0},nbt:{Speed:12}});assert.equal(cadence.dirty,true);snap=build();assert.equal(snap.kinetic[0].speed,12)
 packet('tile_entity_data',{location:{x:160,y:64,z:160},nbt:{Speed:99}});assert.equal(cadence.dirty,false);assert.equal(world.blockEntities.get('160,64,160').data.Speed,99)
 packet('block_change',{location:{x:2,y:64,z:0},type:2});build()
 packet('block_change',{location:{x:3,y:65,z:1},type:1});assert.equal(cadence.dirty,true);snap=build()
 const neighbors=[];for(let i=0;i<snap.neighbors.length;i+=4)neighbors.push(snap.neighbors.slice(i,i+4));assert.ok(neighbors.some(v=>v.join(',')==='3,65,1,1'))
 packet('unload_chunk',{chunkX:0,chunkZ:0});assert.equal(cadence.dirty,true);snap=build();assert.ok(snap.missingColumns.includes('0,0'));assert.equal(snap.kinetic.length,0)
 packet('unload_chunk',{chunkX:10,chunkZ:10});assert.equal(cadence.dirty,false);assert.equal(world.columns.has('10,10'),false)
})
