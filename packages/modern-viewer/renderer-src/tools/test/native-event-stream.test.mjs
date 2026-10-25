import test from 'node:test'
import assert from 'node:assert/strict'
import {createNativeEventStream} from '../../src/native-viewer/native-event-stream.js'

function fixture(onUnavailableHook=()=>{}){
  const sources=[],timers=new Map(),delays=[],reads=[],messages=[],unavailable=[]
  let seq=0,status=200,fetcher=null
  class Source{
    constructor(url){this.url=url;this.readyState=1;this.closed=false;sources.push(this)}
    close(){this.closed=true;this.readyState=2}
    error(state=2){this.readyState=state;this.onerror?.()}
    message(data){this.onmessage?.({data})}
  }
  const stream=createNativeEventStream({url:'/watch/example/events',statusUrl:'/watch/example/status.json',EventSource:Source,
    onMessage:m=>messages.push(m.data),onUnavailable:r=>{unavailable.push(r);onUnavailableHook()},
    fetch:async(url,options)=>{reads.push({url,options});return fetcher?fetcher(url,options):{status,ok:status===200}},
    setTimer:(fn,ms)=>{const id=++seq;timers.set(id,{fn,ms});delays.push(ms);return id},clearTimer:id=>timers.delete(id)})
  return{stream,sources,timers,delays,reads,messages,unavailable,setStatus:s=>{status=s},setFetch:f=>{fetcher=f},
    async next(){const [id,timer]=timers.entries().next().value??[];assert.ok(timer,'expected a scheduled read');timers.delete(id);timer.fn();await new Promise(r=>setImmediate(r))}}
}
test('terminal stream error probes authorization then resumes the original readonly route',async()=>{
  const f=fixture(),old=f.sources[0];old.error();old.error();assert.equal(f.timers.size,1)
  await f.next();assert.equal(f.sources.length,2);assert.equal(old.closed,true)
  assert.equal(f.reads[0].url,'/watch/example/status.json');assert.equal(f.reads[0].options.cache,'no-store')
  assert.equal(f.sources[1].url,old.url);assert.equal(f.timers.size,0)
  f.sources[1].message('fresh identity');assert.deepEqual(f.messages,['fresh identity']);f.stream.close()
})
test('native CONNECTING retries remain owned by EventSource',async()=>{
  const f=fixture();f.sources[0].error(0);assert.equal(f.timers.size,0);assert.equal(f.reads.length,0)
  assert.deepEqual(f.unavailable,['NATIVE_WORLD_STREAM_DISCONNECTED']);f.stream.close()
})
test('temporary missing source, HTTP 503 and network failure back off without adding event connections',async()=>{
  const f=fixture();f.sources[0].error()
  for(const status of [404,503,503,503,503,503]){f.setStatus(status);await f.next()}
  assert.equal(f.sources.length,1);assert.equal(f.reads.length,6)
  assert.deepEqual(f.delays.filter(ms=>ms!==6000),[1000,2000,4000,8000,10000,10000,10000])
  f.setFetch(async()=>{throw Error('offline')});await f.next();assert.equal(f.sources.length,1)
  f.setFetch(null);f.setStatus(200);await f.next();assert.equal(f.sources.length,2);f.stream.close()
})
for(const status of [401,403])test(`authorization ${status} stops all reads and never reuses cached scene`,async()=>{
  const f=fixture();f.setStatus(status);f.sources[0].error();await f.next()
  assert.equal(f.stream.readyState,2);assert.equal(f.sources.length,1);assert.equal(f.timers.size,0)
  assert.equal(f.unavailable.at(-1),'NATIVE_WORLD_STREAM_UNAUTHORIZED')
})
test('closing during a queued retry removes it; closing during a pending probe aborts and rejects late success',async()=>{
  const queued=fixture();queued.sources[0].error();queued.stream.close();assert.equal(queued.timers.size,0);assert.equal(queued.reads.length,0)
  const f=fixture();let release;f.setFetch(()=>new Promise(resolve=>{release=resolve}));f.sources[0].error();await f.next()
  assert.equal(f.timers.size,1);f.stream.close();assert.equal(f.reads[0].options.signal.aborted,true)
  release({status:200,ok:true});await new Promise(r=>setImmediate(r));assert.equal(f.sources.length,1);assert.equal(f.timers.size,0)
})
test('replaced sources and queued old messages cannot update the current scene',async()=>{
  const f=fixture(),old=f.sources[0],lateMessage=old.onmessage;old.error();await f.next()
  lateMessage({data:'old snapshot'});assert.deepEqual(f.messages,[])
  f.sources[1].message('new snapshot');assert.deepEqual(f.messages,['new snapshot']);f.stream.close()
})
test('the current stream resets backoff only after actual data arrives',async()=>{
  const f=fixture();f.sources[0].error();f.setStatus(503);await f.next();f.setStatus(200);await f.next()
  f.sources[1].message('identity');f.sources[1].error();assert.equal(f.delays.at(-1),1000);f.stream.close()
})
test('closing from an unavailable callback cannot schedule more work',async()=>{
  let f;f=fixture(()=>f.stream.close());f.sources[0].error();assert.equal(f.timers.size,0);assert.equal(f.reads.length,0)
})
test('a timed-out authorization probe cannot create a connection from late success',async()=>{
  const f=fixture();let release;f.setFetch(()=>new Promise(r=>{release=r}));f.sources[0].error();await f.next();await f.next()
  assert.equal(f.reads[0].options.signal.aborted,true)
  release({status:200,ok:true});await new Promise(r=>setImmediate(r));assert.equal(f.sources.length,1);assert.equal(f.timers.size,1);f.stream.close()
})
