import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { SpectatorFanout, SpectatorAssetCache } from '../../host/spectator-fanout.mjs';
import { createNativeSession } from '../../src/native-viewer/native-session.js';
import { nativeTerrainDelta } from '../../src/native-viewer/native-terrain-wire.js';

const uuid='01234567-89ab-3def-8123-456789abcdef',hash='a'.repeat(64),mode='paper_server_observation';
const identity={type:'identity',playerUuid:uuid,player:'Observer',entityId:2,minecraftVersion:'1.21.1',registrySha256:hash,mode};
const snapshot={type:'snapshot',epoch:1,terrainSequence:1,registrySha256:hash,mode,groups:[{stateId:1,positions:[1,64,2]}]};
const wire=value=>Buffer.from('data: '+JSON.stringify(value)+'\n\n');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function response(blocked=false) {
  const res=new EventEmitter();res.values=[];res.destroyed=false;res.writableLength=0;
  res.writeHead=()=>{};res.flushHeaders=()=>{};
  res.write=bytes=>{res.values.push(JSON.parse(bytes.toString().slice(6)));return !blocked;};
  res.destroy=()=>{res.destroyed=true;res.emit('close');};return res;
}
function fixture(t,options={}){
  const upstream=[];const hub=new SpectatorFanout({playerUuid:uuid,open:sink=>upstream.push(sink),...options});
  t.after(()=>hub.close());const first=response();hub.subscribe({owner:'A'},first);
  return {hub,first,upstream,send:value=>upstream.at(-1).write(wire(value))};
}
test('late join replays one coherent terrain chain and current pose, without old attacks, sounds or Agent output',t=>{
  const f=fixture(t);f.send(identity);f.send(snapshot);
  const after={...snapshot,terrainSequence:2,groups:[{stateId:1,positions:[1,64,2,3,64,4]}]};
  f.send(nativeTerrainDelta(snapshot,after));f.send({type:'frame',epoch:1,pose:{x:3}});
  f.send({type:'world_effect',epoch:1,sequence:12});f.send({type:'agent_visual',epoch:1,value:{private:'never-replay'}});
  const next=response();f.hub.subscribe({},next);assert.equal(f.upstream.length,1);
  assert.deepEqual(next.values.map(v=>v.type),['identity','snapshot','snapshot_delta','frame']);
  const session=createNativeSession(hash);const results=next.values.map(value=>session.receive(value));
  assert.deepEqual(results[2].value.groups,after.groups);assert.equal(results[3].value.pose.x,3);
});
test('a world epoch reset invalidates old terrain, deltas and latest animation before another visitor attaches',t=>{
  const f=fixture(t);f.send(identity);f.send(snapshot);f.send({type:'motion',epoch:1});
  f.send({...identity,epoch:2});const next=response();f.hub.subscribe({},next);assert.deepEqual(next.values.map(v=>v.type),['identity']);
  f.send({...snapshot,epoch:2});assert.equal(next.values.at(-1).epoch,2);
  f.send({type:'frame',epoch:1,secret:'stale'});assert.ok(!JSON.stringify(next.values).includes('stale'));
});
test('late bootstrap never applies an older motion frame after a newer terrain delta',t=>{
  const f=fixture(t);f.send(identity);f.send(snapshot);f.send({type:'frame',epoch:1,tick:5});
  f.send(nativeTerrainDelta(snapshot,{...snapshot,terrainSequence:2,tick:10}));
  const next=response();f.hub.subscribe({},next);assert.deepEqual(next.values.map(v=>v.type),['identity','snapshot','snapshot_delta']);
});
test('bounded delta history refreshes one upstream checkpoint, and never starts a second simultaneous source',async t=>{
  const f=fixture(t,{maxDeltas:1});f.send(identity);f.send(snapshot);
  f.send(nativeTerrainDelta(snapshot,{...snapshot,terrainSequence:2,groups:[]}));await pause(0);
  assert.equal(f.upstream.length,2);assert.equal(f.upstream[0].destroyed,true);assert.equal(f.hub.state().upstreamStreams,1);
  assert.equal(f.first.values.at(-1).type,'waiting');assert.equal(f.hub.state().replayBytes,0);
});
test('UTF-8 chunks split inside a Chinese character reconstruct correctly and oversized events fail closed',t=>{
  const f=fixture(t,{maxEventBytes:500});const bytes=wire({...identity,player:'Observer',label:'女神之眼'}),i=bytes.indexOf(Buffer.from('女'))+1;
  f.upstream[0].write(bytes.subarray(0,i));f.upstream[0].write(bytes.subarray(i));assert.equal(f.first.values[0].label,'女神之眼');
  f.upstream[0].write(Buffer.alloc(501,32));assert.equal(f.first.destroyed,true);assert.equal(f.hub.state().replayBytes,0);
});
test('slow viewer queue is bounded and cannot block another viewer or acknowledgements to upstream',t=>{
  const f=fixture(t,{maxBufferedBytes:700}),slow=response(true);f.hub.subscribe({},slow);
  f.send(identity);f.send(snapshot);
  for(let i=0;i<20;i++)assert.equal(f.send({type:'frame',epoch:1,tick:i}),true);
  assert.equal(f.first.values.at(-1).tick,19);
  for(let i=0;i<20;i++)f.send({type:'world_effect',epoch:1,sequence:i,payload:'x'.repeat(100)});
  assert.equal(slow.destroyed,true);assert.equal(f.first.destroyed,false);assert.equal(f.hub.state().viewers,1);
});
test('permission revocation affects its viewer, while source retirement clears all replay bytes',async t=>{
  const f=fixture(t),other=response();f.hub.subscribe({owner:'B'},other);f.send(identity);f.send(snapshot);
  await f.hub.check(req=>{if(req.owner==='B')throw Error('revoked');});
  assert.equal(other.destroyed,true);assert.equal(f.first.destroyed,false);
  f.hub.close();assert.equal(f.first.destroyed,true);assert.equal(f.hub.state().replayBytes,0);
});
test('last viewer cancellation closes upstream; stale live status cannot retain a frozen scene',async t=>{
  const f=fixture(t,{idleTimeoutMs:25});f.send(identity);f.send(snapshot);await pause(50);
  assert.equal(f.first.destroyed,true);assert.equal(f.upstream[0].destroyed,true);assert.equal(f.hub.state().replayBytes,0);
});
test('asset singleflight keeps exact bytes, LRU size bound and no cache population after invalidation',async()=>{
  const cache=new SpectatorAssetCache({maxBytes:6,maxEntryBytes:4}),pending=[];
  const open=sink=>pending.push(sink);const a=cache.read('a',open),b=cache.read('a',open);assert.equal(pending.length,1);
  pending[0].writeHead(200,{'Content-Type':'image/png'});pending[0].write(Buffer.from([0,255,4,9]));pending[0].end();
  assert.deepEqual((await a).bytes,(await b).bytes);assert.equal(cache.bytes,4);
  const c=cache.read('b',open);pending[1].writeHead(200,{'Content-Type':'image/png'});pending[1].write(Buffer.from('1234'));pending[1].end();await c;
  assert.equal(cache.bytes,4);assert.equal(cache.entries.has('a'),false);
  const late=cache.read('c',open);cache.clear();pending[2].writeHead(200,{});pending[2].write(Buffer.from('1'));pending[2].end();
  assert.equal(await late,null);assert.equal(cache.bytes,0);
});

test('texture bursts coalesce while queued, respect concurrency and reject overload instead of bypassing the cache',async()=>{
  const cache=new SpectatorAssetCache({maxInflight:2,maxQueued:2}),opened=[];
  const open=sink=>opened.push(sink);
  const a=cache.read('a',open),b=cache.read('b',open),c=cache.read('c',open),duplicate=cache.read('c',open),d=cache.read('d',open);
  assert.equal(opened.length,2);assert.equal(cache.pending.length,2);
  await assert.rejects(cache.read('e',open),/SPECTATOR_ASSET_QUEUE_FULL/);
  const finish=(index,text)=>{opened[index].writeHead(200,{'Content-Type':'image/png'});opened[index].write(Buffer.from(text));opened[index].end();};
  finish(0,'a');assert.equal(opened.length,3);assert.equal(cache.active.size,2);
  finish(1,'b');assert.equal(opened.length,4);finish(2,'c');finish(3,'d');
  assert.deepEqual((await c).bytes,(await duplicate).bytes);
  assert.deepEqual((await Promise.all([a,b,c,d])).map(row=>row.bytes.toString()),['a','b','c','d']);
  assert.equal(cache.loading.size,0);assert.equal(cache.active.size,0);
  assert.equal((await cache.read('c',()=>assert.fail('cache hit'))).bytes.toString(),'c');
});

test('invalidating a saturated asset cache cancels active and queued reads without opening stale jobs',async()=>{
  const cache=new SpectatorAssetCache({maxInflight:1,maxQueued:3}),opened=[];
  const values=['a','b','c'].map(path=>cache.read(path,sink=>opened.push(sink)));
  cache.clear();
  assert.deepEqual(await Promise.all(values),[null,null,null]);
  assert.equal(opened.length,1);assert.equal(opened[0].destroyed,true);
  assert.equal(cache.loading.size,0);assert.equal(cache.pending.length,0);
  assert.equal(await cache.read('new',()=>assert.fail('closed cache')),null);
});
