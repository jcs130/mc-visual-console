import test from 'node:test'
import assert from 'node:assert/strict'
import {NativeSelfDisplayPose,NativeFrameGaps,writeChanged,createTargetSignature} from '../../src/native-viewer/native-display-performance.js'
import {nativeCameraTarget} from '../../src/native-viewer/native-camera.js'
import {createNativePlayerMotionTracker} from '../../src/native-viewer/native-player-motion.js'
const pose=(x=0,yaw=0)=>({x,y:64,z:0,yaw,pitch:0,eyeHeight:1.62})
test('50ms observed display produces intermediate 60Hz poses without modifying raw inputs or extrapolating',()=>{
 const d=new NativeSelfDisplayPose(),raw=[pose(),pose(1)],before=structuredClone(raw)
 d.receive(raw[0],0,'a');d.receive(raw[1],50,'a')
 assert.equal(d.sample(66).x,.32);assert.equal(d.sample(83).x,.66);assert.equal(d.sample(100).x,1);assert.equal(d.sample(200).x,1)
 assert.deepEqual(raw,before)
 for(let i=0;i<100;i++)d.receive(pose(1),100+i*50,'a')
 assert.ok(d.samples.length<=8);assert.deepEqual(d.sample(5050),pose(1))
})
test('shortest yaw, identity, epoch, actual reset counters, jumps and stale gaps snap coherently',()=>{
 const d=new NativeSelfDisplayPose();d.receive(pose(0,Math.PI-.1),0,'a',{resetSequence:0});d.receive(pose(1,-Math.PI+.1),50,'a',{resetSequence:0})
 assert.ok(Math.abs(d.sample(75).yaw-Math.PI)<1e-12)
 d.receive(pose(2),100,'b',{resetSequence:0});assert.equal(d.sample(100).x,2)
 d.receive(pose(3),150,'b',{resetSequence:1});assert.equal(d.sample(150).x,3)
 d.receive(pose(20),200,'b',{resetSequence:1});assert.equal(d.sample(200).x,20)
 assert.equal(d.sample(500).x,20);assert.equal(d.stale,true)
 d.receive(pose(21),501,'b',{resetSequence:1});assert.equal(d.sample(501).x,21)
 const tracker=createNativePlayerMotionTracker();const seq=tracker.current().resetSequence;tracker.reset('teleport');assert.equal(tracker.current().resetSequence,seq+1)
 d.reset();assert.equal(d.sample(600),null)
})
test('fixed 240 gap ring, nearest-rank percentiles and strict spike counts exclude pauses and reset',()=>{
 const g=new NativeFrameGaps();g.frame(0);let t=0,value
 for(let i=0;i<240;i++){t+=i===239?101:16;value=g.frame(t)??value}
 t+=1000;const stats=g.frame(t)
 assert.equal(stats.sampleCount,240);assert.equal(stats.p50,16);assert.equal(stats.p95,16);assert.equal(stats.p99,16);assert.equal(stats.max,1000);assert.equal(stats.over100,2);assert.equal(stats.over33,2);assert.equal(stats.durationMs,238*16+101+1000)
 assert.equal(g.frame(t+16),null);g.frame(t+5000,false);assert.equal(g.count,0);g.frame(t+10000);assert.equal(g.count,0)
 g.reset();g.frame(0);g.frame(100);assert.equal(g.values[0],100);assert.equal(g.frame(1000).over100,1)
 g.reset();g.frame(10);g.frame(9);assert.equal(g.count,0)
})
test('unchanged diagnostics cause zero writes; target arrays serialize only on identity changes',()=>{
 let writes=0;const data=new Proxy({}, {set(o,k,v){writes++;o[k]=v;return true}})
 for(let i=0;i<1000;i++)writeChanged(data,'hands','same')
 assert.equal(writes,1);writeChanged(data,'hands','changed');assert.equal(writes,2)
 let reads=0;const row={id:1,uuid:'a',get name(){reads++;return 'name'},rendered:true},rows=[row],sig=createTargetSignature()
 for(let i=0;i<1000;i++)sig(rows)
 assert.equal(reads,1);sig([{...row,name:'new'}]);assert.equal(reads,2)
})

test('self camera target uses the same interpolated position and shortest yaw through a lifecycle reset',()=>{
 const d=new NativeSelfDisplayPose(),selfPlayer={uuid:'self',entityId:1},raw={pose:pose(1),selfPlayer,epoch:1}
 const before=structuredClone(raw);d.receive(pose(),0,'self:1',{resetSequence:0});d.receive(raw.pose,50,'self:1',{resetSequence:0})
 const display=d.sample(75),actor={root:{position:display}},target=nativeCameraTarget({...raw,pose:display},actor)
 assert.deepEqual(target.position,{x:.5,y:64,z:0});assert.equal(target.yaw,display.yaw);assert.deepEqual(raw,before)
 d.receive(pose(3),80,'self:1',{resetSequence:1});const reset=d.sample(80)
 assert.equal(reset.x,3);assert.equal(nativeCameraTarget({...raw,pose:reset},{root:{position:reset}}).position.x,3)
})
