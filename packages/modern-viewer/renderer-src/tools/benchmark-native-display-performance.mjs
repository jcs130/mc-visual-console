// Network-free real-class workload; counts are causal evidence, timings synthetic.
import {performance} from 'node:perf_hooks'
import {NativeWorldState} from './native-world-host.mjs'
import {NativeSnapshotCadence} from './native-snapshot-cadence.mjs'
import {writeChanged,createTargetSignature,NativeSelfDisplayPose} from '../src/native-viewer/native-display-performance.js'
function trial(optimized){
 const world=new NativeWorldState({states:new Map([[0,{stateId:0,name:'minecraft:air'}],[1,{stateId:1,name:'minecraft:stone'}]]),registrySha256:'a'.repeat(64)})
 world.dimension={minY:0,height:256,name:'fixture'};world.pose={x:0,y:64,z:0,yaw:0,pitch:0,eyeHeight:1.62}
 let remote=0;world.columns.set('10,10',{getBlockStateId:()=>remote,setBlockStateId:(p,v)=>{remote=v}})
 const cadence=new NativeSnapshotCadence({minimumIntervalMs:0});let builds=0,scanned=0
 const build=t=>{const snapshot=world.snapshot();builds++;scanned+=snapshot.viewCoverage.scannedVoxels;cadence.completed(world.pose,t,true,snapshot.bounds)}
 build(0);world.on('world',c=>cadence.invalidate(optimized?c:undefined));const start=performance.now()
 for(let batch=0;batch<20;batch++){
  for(let i=0;i<250;i++){world.changeBlock({x:160,y:64,z:160},i%2);if(!optimized)cadence.invalidate()}
  if(cadence.required(world.pose,batch+1))build(batch+1)
 }
 return {ms:performance.now()-start,updates:5000,builds,scannedVoxels:scanned,authoritativeRemoteState:remote}
}
trial(false);trial(true)
const runs=Array.from({length:5},()=>({before:trial(false),after:trial(true)}))
function dom(optimized){let writes=0;const data=new Proxy({}, {set(o,k,v){writes++;o[k]=v;return true}}),rows=[{id:1,uuid:'a',name:'self',rendered:true}],signature=createTargetSignature(),start=performance.now();for(let i=0;i<100000;i++){if(optimized){writeChanged(data,'room','same');signature(rows)}else{data.room='same';JSON.stringify(rows.map(e=>[e.id,e.uuid,e.name,e.rendered]))}}return {ms:performance.now()-start,writes}}
const display=new NativeSelfDisplayPose(),positions=[],direct=[];for(let frame=0;frame<12;frame++){const now=frame*50/3;if(frame%3===0)display.receive({x:frame/3*.05,y:64,z:0,yaw:0,pitch:0,eyeHeight:1.62},now,'a');positions.push(display.sample(now).x);direct.push(Math.floor(frame/3)*.05)}
console.log(JSON.stringify({runs,dom:{before:dom(false),after:dom(true)},smoothness:{direct,display:positions,displayLatencyMs:50}},null,2))
