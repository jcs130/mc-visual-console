import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash,webcrypto} from 'node:crypto'
import {createNativeAudio} from '../../src/native-viewer/native-audio.js'
import {NativeSoundRandom,selectNativeSound} from '../../src/native-viewer/native-sound-selection.js'

globalThis.document={baseURI:'http://viewer.test/body/'}
globalThis.crypto??=webcrypto
const flush=async()=>{for(let i=0;i<16;i++)await new Promise(r=>setImmediate(r))}
const until=async condition=>{const deadline=Date.now()+2000;while(!condition()&&Date.now()<deadline)await new Promise(r=>setTimeout(r,1));assert.ok(condition(),'audio work reaches its observed terminal state')}
const digest=(kind,bytes)=>createHash(kind).update(bytes).digest('hex')
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return{promise,resolve}}
function fixture({gate=null,tamper=false,stream=false,storage=null,schedule=undefined,cancelSchedule=undefined}={}){
  // Decoder double, explicitly not an original OGG or a playback acceptance.
  const bytes=Buffer.from('offline audio transport fixture'),sources=[],panners=[],gains=[],requests=[],media=[],listeners=[]
  const metadata={available:true,minecraftVersion:'1.21.1',source:'verified_original_launcher_assets',
    definitions:Object.fromEntries(['block.test','music.game','ui.button.click'].map(n=>[n,{sounds:[{name:'test',stream:stream&&n==='music.game'}]}])) ,
    files:{'test.ogg':{bytes:bytes.length,sha1:digest('sha1',bytes),sha256:digest('sha256',bytes)}}}
  let contexts=0,decoded=0
  const audio=createNativeAudio({storage,schedule,cancelSchedule,mediaFactory:()=>{const n={async play(){this.played=true},pause(){this.paused=true}};media.push(n);return n},contextFactory:()=>{contexts++;const listener={setPosition(...p){this.position=p},setOrientation(){}};listeners.push(listener);return{state:'suspended',destination:{},
    listener,async resume(){this.state='running'},async close(){this.state='closed'},
    createGain(){const n={gain:{value:1},connect(){},disconnect(){}};gains.push(n);return n},
    createPanner(){const n={connect(){},disconnect(){},setPosition(...p){this.position=p}};panners.push(n);return n},
    createBufferSource(){const n={playbackRate:{value:1},connect(){},disconnect(){},start(){this.started=true},stop(){this.stopped=true}};sources.push(n);return n},
    createMediaElementSource(){const n={connect(){},disconnect(){}};sources.push(n);return n},
    async decodeAudioData(){decoded++;return{duration:1}}}},fetchData:async url=>{
      requests.push(url);if(url.endsWith('sound-manifest.json'))return{ok:true,json:async()=>metadata}
      if(gate)await gate.promise
      const body=tamper?Buffer.alloc(bytes.length):bytes
      return{ok:true,arrayBuffer:async()=>body.buffer.slice(body.byteOffset,body.byteOffset+body.length)}
    }})
  const event=(sequence=1,extra={})=>audio.event({epoch:1,sequence,observedAt:Date.now(),effect:{kind:'sound',
    value:{name:'block.test',category:'blocks',volume:.7,pitch:1,seed:'0',position:{x:1,y:64,z:3},...extra}}})
  const stop=(sequence=2,filter={})=>audio.event({epoch:1,sequence,observedAt:Date.now(),effect:{kind:'sound_stop',value:filter}})
  return{audio,event,stop,sources,panners,gains,requests,media,listeners,contexts:()=>contexts,decoded:()=>decoded}
}
test('seeded variants preserve Java Random draws and nested references rather than flattening weights',()=>{
  const r=new NativeSoundRandom(0);assert.deepEqual(Array.from({length:5},()=>r.nextInt(1000)),[360,948,29,447,515])
  const definitions={outer:{sounds:[{name:'child',type:'event',weight:999,volume:.5,pitch:.7,stream:true},'other']},
    child:{sounds:[{name:'a',weight:2,volume:.3,pitch:.8},{name:'b'}]}}
  const calls=[],random={nextInt(bound){calls.push(bound);return 0}}
  const v=selectNativeSound(definitions,'minecraft:outer',random)
  assert.deepEqual(calls,[4,3]);assert.equal(v.file,'a.ogg');assert.equal(v.volume,Math.fround(.3*.5));assert.equal(v.pitch,Math.fround(.8*.7));assert.equal(v.stream,true)
  const one=[];selectNativeSound({one:{sounds:['a']}},'one',{nextInt(n){one.push(n);return 0}});assert.deepEqual(one,[1])
  assert.throws(()=>selectNativeSound({a:{sounds:[{name:'a',type:'event'}]}},'a',r),/REFERENCE_CYCLE/)
})
test('audio defaults off, requires a gesture and verifies bytes before positional playback',async()=>{
  const f=fixture();await f.audio.load();f.audio.connect(true);f.event();await flush()
  assert.equal(f.contexts(),0);assert.equal(f.sources.length,0)
  await f.audio.toggle('effects');f.event(2,{pitch:4,fixedRange:9});await flush()
  assert.equal(f.decoded(),1);assert.equal(f.sources[0].started,true);assert.equal(f.sources[0].playbackRate.value,2)
  assert.equal(f.panners[0].distanceModel,'linear');assert.equal(f.panners[0].maxDistance,16,'server fixedRange is not client attenuation');assert.deepEqual(f.panners[0].position,[1,64,3])
  assert.equal(f.gains[0].gain.value,.45);assert.equal(f.gains[1].gain.value,.7*.8)
  f.audio.setVolume('effects',.4);assert.equal(f.gains[1].gain.value,.7*.4)
  f.event(2);await flush();assert.equal(f.sources.length,1,'duplicate packet cannot replay')
  f.stop(3,{category:'hostile'});assert.equal(f.sources[0].stopped,undefined)
  f.stop(4,{category:'blocks'});assert.equal(f.sources[0].stopped,true);f.audio.dispose()
})
test('stop_sound cancels an undecoded sound, including category-specific stops',async()=>{
  const gate=deferred(),f=fixture({gate});await f.audio.load();f.audio.connect(true);await f.audio.toggle('effects')
  f.event();await flush();f.stop(2,{name:'minecraft:block.test',category:'blocks'});gate.resolve();await flush()
  assert.equal(f.sources.length,0);f.audio.dispose()
})
test('disable/re-enable and reconnect cannot resurrect pending audio from the old state',async()=>{
  for(const reconnect of [false,true]){
    const gate=deferred(),f=fixture({gate});await f.audio.load();f.audio.connect(true);await f.audio.toggle('effects');f.event();await flush()
    if(reconnect){f.audio.connect(false);f.audio.connect(true)}else{await f.audio.toggle('effects');await f.audio.toggle('effects')}
    gate.resolve();await flush();assert.equal(f.sources.length,0);f.audio.dispose()
  }
})
test('bad original-file bytes never reach the decoder; preview is local and effects remain off',async()=>{
  const bad=fixture({tamper:true});await bad.audio.load();assert.equal(await bad.audio.preview(),false)
  assert.equal(bad.decoded(),0);assert.equal(bad.sources.length,0);assert.equal(bad.audio.state().reason,'NATIVE_AUDIO_FILE_INTEGRITY_MISMATCH');bad.audio.dispose()
  const f=fixture();await f.audio.load();assert.equal(await f.audio.preview(),true)
  assert.equal(f.audio.state().connected,false);assert.equal(f.audio.state().soundEnabled,false);assert.equal(f.sources.length,1)
  assert.equal(f.requests.every(u=>u.startsWith('http://viewer.test/body/')),true);f.audio.dispose()
})
test('original streamed music stays compressed, is explicitly selected and stops on disconnect',async()=>{
  const f=fixture({stream:true});await f.audio.load();f.audio.connect(true)
  assert.equal(await f.audio.playlist(),true);assert.equal(f.decoded(),0,'no many-minute PCM allocation')
  assert.equal(f.media[0].played,true);assert.match(f.media[0].src,/^blob:/);assert.equal(f.media[0].preservesPitch,false)
  assert.equal(f.audio.state().soundEnabled,false);assert.equal(f.audio.state().musicEnabled,true)
  f.audio.connect(false);assert.equal(f.media[0].paused,true);assert.equal(f.audio.state().active,0);f.audio.dispose()
})
test('entity audio follows only the original entity identity and stops on ID reuse',async()=>{
  const f=fixture();await f.audio.load();f.audio.connect(true);await f.audio.toggle('effects')
  f.event(1,{entityId:7,entityUuid:'original'});await flush()
  const camera={position:{x:0,y:64,z:0},matrixWorld:{elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}}
  f.audio.frame(camera,new Map([[7,{uuid:'original',position:{x:2,y:64,z:4}}]]))
  assert.deepEqual(f.panners[0].position,[2,64,4])
  f.audio.frame(camera,new Map([[7,{uuid:'replacement',position:{x:3,y:64,z:4}}]]))
  assert.equal(f.sources[0].stopped,true);f.audio.dispose()
})
test('saved viewer audio survives a page reload but never creates a context without a gesture',async()=>{
  const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)}
  const first=fixture({storage});await first.audio.load();first.audio.connect(true)
  await first.audio.toggle('effects');first.audio.setVolume('master',.31);first.audio.dispose()
  const next=fixture({storage});await next.audio.load();next.audio.connect(true)
  assert.equal(next.audio.state().soundEnabled,true);assert.equal(next.audio.state().volumes.master,.31)
  assert.equal(next.contexts(),0)
  await next.audio.activate();next.event();await until(()=>next.sources.length>0||next.audio.state().failed>0);assert.equal(next.sources[0].started,true)
  await next.audio.toggle('effects');next.audio.dispose()
  const muted=fixture({storage});await muted.audio.load();assert.equal(muted.audio.state().soundEnabled,false);muted.audio.dispose()
})
test('spectator playlist continues after a track and cancels scheduled work on disconnect or mute',async()=>{
  const timers=new Map();let id=0
  const f=fixture({stream:true,schedule:(fn,ms)=>{timers.set(++id,{fn,ms});return id},cancelSchedule:id=>timers.delete(id)})
  await f.audio.load();f.audio.connect(true);await f.audio.playlist();assert.equal(f.media.length,1)
  f.media[0].onended();await flush();assert.equal(timers.size,1)
  const timer=timers.values().next().value;timers.clear();timer.fn();await until(()=>f.media[1]?.played===true||f.audio.state().failed>0)
  assert.equal(f.media.length,2);assert.equal(f.audio.state().byCategory.music,2)
  f.media[1].onended();assert.equal(timers.size,1)
  f.audio.connect(false);assert.equal(timers.size,0)
  f.audio.connect(true);assert.equal(timers.size,1)
  const resumed=timers.values().next().value;timers.clear();resumed.fn();await until(()=>f.media[2]?.played===true||f.audio.state().failed>0);assert.equal(f.media.length,3)
  await f.audio.toggle('music');assert.equal(f.media[2].paused,true);assert.equal(timers.size,0)
  f.audio.dispose()
})
test('an elevated spectator camera cannot attenuate the action body to silence',async()=>{
  const f=fixture();await f.audio.load();await f.audio.toggle('effects')
  const camera={position:{x:0,y:90,z:16},matrixWorld:{elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}}
  f.audio.frame(camera,new Map(),{position:{x:0,y:64,z:0},eyeHeight:1.62})
  assert.deepEqual(f.listeners[0].position,[0,65.62,0]);f.audio.dispose()
})
