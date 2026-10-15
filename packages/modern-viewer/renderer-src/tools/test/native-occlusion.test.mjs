import assert from 'node:assert/strict'
import {test} from 'node:test'
import {nativeOpaqueFullCube,appendOccludedSolid,nativeTerrainSignature} from '../native-occlusion.mjs'
import {createHiddenSolidLookup} from '../../src/native-viewer/native-hidden-solids.js'
import {nativeReceivedRoomCache} from '../../src/native-viewer/native-room-visibility.js'
const stone={stateId:1,renderShape:'MODEL',canOcclude:true,solid:true,blocksMotion:true,dynamicShape:false,hasBlockEntity:false,fluid:{empty:true},occlusionBoxes:[[0,0,0,1,1,1]]}
test('only exact received full opaque shapes hide cubes; missing/partial/fluid/dynamic/transparent states never do',()=>{
  assert.equal(nativeOpaqueFullCube(stone),true)
  for(const patch of [{canOcclude:false},{dynamicShape:true},{hasBlockEntity:true},{fluid:{empty:false}},
    {occlusionBoxes:[[0,0,0,1,.5,1]]},{occlusionBoxes:undefined},{renderShape:'INVISIBLE'}]) assert.equal(nativeOpaqueFullCube({...stone,...patch}),false)
  assert.equal(nativeOpaqueFullCube(null),false)
})
test('hidden solid runs keep native material IDs and exact occupied space for rooms and collision lookups',()=>{
  const runs=[];appendOccludedSolid(runs,1,2,3,1);appendOccludedSolid(runs,2,2,3,1);appendOccludedSolid(runs,3,2,3,2)
  assert.deepEqual(runs,[[2,3,1,2,1],[2,3,3,3,2]])
  const snapshot={states:[stone,{...stone,stateId:2}],groups:[],occludedSolidRuns:runs,
    bounds:{minX:0,maxX:8,minY:0,maxY:8,minZ:0,maxZ:8},viewCoverage:{receivedColumns:['0,0']}}
  const lookup=createHiddenSolidLookup(snapshot),room=nativeReceivedRoomCache(snapshot)
  assert.equal(lookup(1,2,3).stateId,1);assert.equal(lookup(3,2,3).stateId,2);assert.equal(lookup(4,2,3),undefined)
  assert.equal(room.isSolidBlock(2,2,3),true);assert.equal(room.isSolidBlock(4,2,3),false)
  assert.throws(()=>createHiddenSolidLookup({...snapshot,occludedSolidRuns:[[2,3,1,9,1]]}),/INVALID/)
  assert.throws(()=>createHiddenSolidLookup({...snapshot,occludedSolidRuns:[[2,3,1,3,1],[2,3,2,2,1]]}),/OVERLAP/)
})
test('terrain identity ignores self/entity movement and native packet counters but changes with terrain and received coverage',()=>{
  const a={epoch:1,groups:[{stateId:1,positions:[0,0,0]}],viewCoverage:{receivedColumns:['0,0']}}
  assert.equal(nativeTerrainSignature(a),nativeTerrainSignature({...a,pose:{x:3},time:5,revision:9,entityState:{entities:[{}]}}))
  for(const patch of [{epoch:2},{groups:[]},{occludedSolidRuns:[[1,1,1,1,1]]},{viewCoverage:{receivedColumns:[]}}])assert.notEqual(nativeTerrainSignature(a),nativeTerrainSignature({...a,...patch}))
})
