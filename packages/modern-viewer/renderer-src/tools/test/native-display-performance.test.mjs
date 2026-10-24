import test from 'node:test'
import assert from 'node:assert/strict'
import {NativeSelfDisplayPose,NativeFrameGaps,writeChanged,createTargetSignature} from '../../src/native-viewer/native-display-performance.js'
import {nativeCameraTarget} from '../../src/native-viewer/native-camera.js'
import {createNativePlayerMotionTracker} from '../../src/native-viewer/native-player-motion.js'
const pose=(x=0,yaw=0)=>({x,y:64,z:0,yaw,pitch:0,eyeHeight:1.62})

test('cloud intervals over 250ms do not repeatedly reset the same actor/camera or jump body heading',()=>{
 const d=new NativeSelfDisplayPose(),a={...pose(0,3),bodyYaw:3,headYaw:3.1},b={...pose(1,-3),bodyYaw:-3,headYaw:-3.1}
 const before=structuredClone([a,b]);d.receive(a,0,'same-body',{tick:1});const version=d.resetVersion
 assert.equal(d.sample(350).x,0,'a late packet holds its last observed position')
 d.receive(b,400,'same-body',{tick:2});assert.equal(d.resetVersion,version);assert.equal(d.delayMs,400)
 const middle=d.sample(600);assert.equal(middle.x,.5)
 assert.ok(Math.abs(middle.bodyYaw-Math.PI)<1e-10);assert.ok(Math.abs(middle.headYaw-Math.PI)<1e-10)
 assert.deepEqual([a,b],before);assert.equal(d.sample(1000).x,1,'never extrapolate beyond the last delivered position')
 d.receive(pose(2),1000,'same-body',{tick:3});assert.equal(d.resetVersion,version)
 d.receive(pose(3),2600,'same-body',{tick:4});assert.ok(d.resetVersion>version,'a real stream gap still resets')
})

test('observed 60ms delivery keeps moving between packets instead of freezing at the 50ms endpoint',()=>{
 const d=new NativeSelfDisplayPose(),raw=[pose(),pose(1),pose(2)],before=structuredClone(raw)
 d.receive(raw[0],0,'a',{tick:0});d.receive(raw[1],60,'a',{tick:1})
 assert.equal(d.delayMs,60)
 assert.ok(Math.abs(d.sample(80).x-1/3)<1e-12)
 assert.ok(Math.abs(d.sample(100).x-2/3)<1e-12)
 assert.equal(d.sample(120).x,1)
 d.receive(raw[2],120,'a',{tick:2})
 assert.ok(Math.abs(d.sample(140).x-4/3)<1e-12)
 assert.equal(d.sample(180).x,2);assert.equal(d.sample(240).x,2,'never predicts another step')
 assert.deepEqual(raw,before)
})

test('cadence changes are bounded and never rewind the display playhead; duplicate tick frames do not change the rate',()=>{
 const d=new NativeSelfDisplayPose();d.receive(pose(),0,'a',{tick:0});d.receive(pose(1),50,'a',{tick:1})
 assert.equal(d.sample(99).x,.98)
 d.receive(pose(1),55,'a',{tick:1});assert.equal(d.delayMs,50)
 d.receive(pose(2),150,'a',{tick:2});assert.equal(d.delayMs,100)
 let previous=.98
 for(let now=150;now<=350;now+=10){const x=d.sample(now).x;assert.ok(x>=previous);previous=x;assert.ok(x<=2)}
 for(let i=1;i<40;i++)d.receive(pose(2),150+i*240,'a',{tick:2+i})
 assert.ok(d.delayMs<=500);assert.ok(d.samples.length<=64);assert.ok(d.arrivalGaps.length<=16)
 d.receive(pose(10),10000,'b',{tick:1});assert.equal(d.delayMs,50);assert.equal(d.sample(10000).x,10)
})
test('50ms observed display produces intermediate 60Hz poses without modifying raw inputs or extrapolating',()=>{
 const d=new NativeSelfDisplayPose(),raw=[pose(),pose(1)],before=structuredClone(raw)
 d.receive(raw[0],0,'a');d.receive(raw[1],50,'a')
 assert.equal(d.sample(66).x,.32);assert.equal(d.sample(83).x,.66);assert.equal(d.sample(100).x,1);assert.equal(d.sample(200).x,1)
 assert.deepEqual(raw,before)
 for(let i=0;i<100;i++)d.receive(pose(1),100+i*50,'a')
 assert.ok(d.samples.length<=64);assert.deepEqual(d.sample(5050),pose(1))
})

test('repeated HUD frames for one physics tick never insert stationary pose intervals',()=>{
 const d=new NativeSelfDisplayPose();d.receive(pose(),0,'a',{tick:0});d.receive(pose(1),50,'a',{tick:1})
 for(let at=51;at<90;at++)d.receive(pose(1),at,'a',{tick:1})
 assert.equal(d.samples.length,2);assert.equal(d.delayMs,50)
 assert.equal(d.sample(75).x,.5)
 d.receive(pose(.2),90,'a',{tick:0});assert.equal(d.samples.length,2);assert.equal(d.sample(100).x,1)
})

test('batched SSE preserves measured source spacing and smooth 60Hz travel without predicting',()=>{
 const d=new NativeSelfDisplayPose(),epoch=1000000,shown=[];let latest=0
 d.receive(pose(0),0,'a',{tick:0,sampledAt:epoch},epoch)
 for(let frame=1;frame<=120;frame++){
  const now=frame*1000/60
  if(frame%9===0)for(let i=2;i>=0;i--){
   const sampled=now-i*50;latest=sampled/1000*4
   d.receive(pose(latest),now,'a',{tick:frame/3-i,sampledAt:epoch+sampled},epoch+now)
  }
  const x=d.sample(now).x;assert.ok(x<=latest+1e-9);shown.push(x)
 }
 const steps=shown.slice(20).map((x,i)=>x-shown[i+19])
 assert.ok(steps.every(x=>x>=-1e-9&&x<.09));assert.ok(steps.filter(x=>x>.01).length>90)
 assert.ok(d.samples.length<=64)
})
test('shortest yaw, identity, epoch, actual reset counters, jumps and stale gaps snap coherently',()=>{
 const d=new NativeSelfDisplayPose();d.receive(pose(0,Math.PI-.1),0,'a',{resetSequence:0});d.receive(pose(1,-Math.PI+.1),50,'a',{resetSequence:0})
 assert.ok(Math.abs(d.sample(75).yaw-Math.PI)<1e-12)
 d.receive(pose(2),100,'b',{resetSequence:0});assert.equal(d.sample(100).x,2)
 d.receive(pose(3),150,'b',{resetSequence:1});assert.equal(d.sample(150).x,3)
 d.receive(pose(20),200,'b',{resetSequence:1});assert.equal(d.sample(200).x,20)
 assert.equal(d.sample(500).x,20);assert.equal(d.stale,true)
 d.receive(pose(21),1701,'b',{resetSequence:1});assert.equal(d.sample(1701).x,21)
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

test('late publications retain visible-session spikes with bounded sixty-second histograms',()=>{
 const g=new NativeFrameGaps();let t=0;g.frame(t);g.frame(t+=200)
 for(let i=0;i<5000;i++)g.frame(t+=16)
 assert.equal(g.value.max,16);assert.equal(g.value.session.max,200);assert.equal(g.value.session.over100,1)
 assert.equal(g.value.window60.max,16);assert.ok(g.value.window60.durationMs<=60016)
 const session={...g.session};g.frame(t+50000,false);g.frame(t+100000);g.frame(t+101000)
 assert.equal(g.session.sampleCount,session.sampleCount+1);assert.equal(g.session.durationMs,session.durationMs+1000)
 assert.equal(g.buckets.length,61);g.reset();assert.equal(g.session.sampleCount,0)
})


test('actual scene visibility and ResizeObserver callbacks preserve visible-session spikes',async()=>{
 const {readFile}=await import('node:fs/promises')
 const source=await readFile(new URL('../../src/native-viewer/native-scene.js',import.meta.url),'utf8')
 const visibility=source.slice(source.indexOf('const kineticVisibility = () => {'),source.indexOf("document.addEventListener('visibilitychange'"))
 const resize=source.slice(source.indexOf('  const resize = () => {'),source.indexOf('  observer = new ResizeObserver(resize)'))
 const frameGaps=new NativeFrameGaps(),document={hidden:false},renderer={domElement:{dataset:{}},setSize(){}},camera={updateProjectionMatrix(){}}
 const callbacks=Function('frameGaps','document','renderer','camera',`let disposed=false,displayPose=null,lastPlayerFrameTime=null,kineticClockState;const selfDisplay={reset(){}},kineticClock={pause(){},resume(){}},actors=new Map(),publishDiagnostics=()=>{},viewport={clientWidth:800,clientHeight:600},firstPersonCamera={updateProjectionMatrix(){}},selfActor=null;${visibility};${resize};return {visibility:kineticVisibility,resize}`)(frameGaps,document,renderer,camera)
 frameGaps.frame(0);frameGaps.frame(200);frameGaps.frame(1200)
 const before={...frameGaps.session};assert.equal(before.over100,2)
 document.hidden=true;callbacks.visibility();document.hidden=false;callbacks.visibility();callbacks.resize()
 assert.deepEqual(frameGaps.session,before)
 frameGaps.frame(90000);const stats=frameGaps.frame(91000)
 assert.equal(stats.session.sampleCount,3);assert.equal(stats.session.durationMs,2200);assert.equal(stats.window60.over100,3)
})
