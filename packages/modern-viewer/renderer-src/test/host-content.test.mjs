import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import minecraftData from 'minecraft-data';
import {cachedMapFrame,createViewerContentBridge,frameMapId,frameTileCenter,transitionFieldOrder,viewerMapPacket,viewerParticlePacket,VIEWER_CONTENT_LIMITS} from '../host/viewer-content.mjs';

const registry=minecraftData('1.20.6');
const slot=id=>({itemId:registry.itemsByName.filled_map.id,itemCount:1,components:[{type:'map_id',data:id}],removeComponents:[]});
const particle=(name='dust')=>({longDistance:false,x:1.25,y:66,z:-2.5,offsetX:0,offsetY:0,offsetZ:0,velocityOffset:0,amount:1,particle:{type:name,data:{red:.25,green:.5,blue:.75,scale:1.5}}});
function setup(entities={}) {
  const protocol=Object.assign(new EventEmitter(),{write(){throw Error('Observation must not write');}});
  const bot=Object.assign(new EventEmitter(),{version:'1.20.6',registry,_client:protocol,entities,entity:{position:{x:0,y:64,z:0}}});
  const events=[];let tick,stopped=0;
  const bridge=createViewerContentBridge(bot,{now:()=>123,schedule:fn=>{tick=fn;return 1;},unschedule:()=>stopped++});
  return {bot,protocol,bridge,events,tick:()=>tick(),stopped:()=>stopped,subscribe:()=>bridge.subscribe((name,value)=>events.push({name,value}))};
}

test('native protocol 766 dust transition float bytes survive the decoder field-label defect',()=>{
  const root=createRequire(new URL('../../../../package.json',import.meta.url));
  const mfRequire=createRequire(root.resolve('mineflayer'));
  const {createSerializer,createDeserializer}=mfRequire('minecraft-protocol');
  const nativeFloats=[.25,.5,.75,1,0,.125,1.5]; // from RGB, to RGB, scale
  const order=transitionFieldOrder(registry.protocol).split(',');
  const raw=particle('dust_color_transition');raw.particle.data=Object.fromEntries(order.map((key,i)=>[key,nativeFloats[i]]));
  const serializer=createSerializer({state:'play',version:'1.20.6',isServer:true});
  const parser=createDeserializer({state:'play',version:'1.20.6',isServer:false});
  const buffer=serializer.createPacketBuffer({name:'world_particles',params:raw});
  assert.deepEqual(Array.from({length:7},(_,i)=>buffer.readFloatBE(buffer.length-28+i*4)),nativeFloats);
  const decoded=parser.parsePacketBuffer(buffer).data.params;
  const event=viewerParticlePacket(decoded,{protocol:registry.protocol});
  assert.deepEqual(event.color,[.25,.5,.75]);assert.deepEqual(event.colorEnd,[1,0,.125]);assert.equal(event.size,1.5);
  assert.equal(event.speed,0);assert.equal(event.exact,true);assert.deepEqual(event.position,{x:1.25,y:66,z:-2.5});
});

test('dust rejects missing/invalid data and unknown transition schemas; directional count zero is preserved',()=>{
  assert.equal(viewerParticlePacket({...particle(),particle:{type:'dust'}}),null);
  const p=particle();p.particle.data.scale=NaN;assert.equal(viewerParticlePacket(p),null);
  assert.equal(viewerParticlePacket(particle('dust_color_transition'),{protocol:{}}),null);
  const direction=viewerParticlePacket({...particle('flame'),amount:0,offsetX:-.5,velocityOffset:.3});
  assert.equal(direction.count,0);assert.equal(direction.spread.x,-.5);assert.equal(direction.speed,.3);
});

test('map wire patch round trip uses map ID, exact rectangle and binary bytes, independent of item damage',()=>{
  const patch={itemDamage:725,scale:0,locked:true,icons:[],columns:2,rows:2,x:126,y:126,data:Buffer.from([4,5,6,7])};
  assert.deepEqual(viewerMapPacket(patch).data,Uint8Array.from([4,5,6,7]));
  assert.equal(viewerMapPacket({...patch,rows:3}),null);
  assert.equal(viewerMapPacket({...patch,data:Buffer.from([4])}),null);
  assert.equal(viewerMapPacket({...patch,itemDamage:-1}),null);
  assert.equal(viewerMapPacket({itemDamage:725,scale:0,columns:0}).columns,0);
  assert.equal(frameMapId(slot(725),registry),725);
  assert.equal(frameMapId({...slot(725),itemId:registry.itemsByName.map.id},registry),null);
});

test('late-attached frame bootstrap accepts six exact native cardinal poses, rejects arbitrary orientation',()=>{
  assert.deepEqual(frameTileCenter({x:-452,y:102,z:-430},[0,0,1]),{x:-451.5,y:102.5,z:-429.96875});
  assert.deepEqual(cachedMapFrame({id:22,name:'item_frame',yaw:Math.PI,pitch:0,position:{x:-451.5,y:102.5,z:-429.96875},metadata:{8:slot(9)}},registry).position,{x:-451.5,y:102.5,z:-429.96875});
  const poses=[[Math.PI,-Math.PI/2,[0,-1,0]],[Math.PI,Math.PI/2,[0,1,0]],[0,0,[0,0,-1]],[Math.PI,0,[0,0,1]],[Math.PI/2,0,[-1,0,0]],[Math.PI*1.5,0,[1,0,0]]];
  for(const [yaw,pitch,normal] of poses) {
    const f=cachedMapFrame({id:22,name:'item_frame',yaw,pitch,position:{x:0,y:64,z:0},metadata:{0:32,8:slot(9),9:7}},registry);
    assert.deepEqual(f.normal,normal);assert.equal(f.invisible,true);assert.equal(f.mapId,9);assert.equal(f.rotation,7);
  }
  assert.equal(cachedMapFrame({id:22,name:'item_frame',yaw:.3,pitch:0,position:{x:0,y:64,z:0}},registry),null);
});

test('one raw observer batches the full 32-point skill geometry, without rate fingerprint deduplication',()=>{
  const s=setup(),off=s.subscribe();s.events.length=0;
  assert.equal(s.protocol.listenerCount('world_particles'),1);
  for(let i=0;i<32;i++)s.protocol.emit('world_particles',{...particle(),x:1+i*.005});
  assert.equal(s.events.length,0);s.tick();
  assert.equal(s.events.length,1);assert.equal(s.events[0].value.events.length,32);
  assert.equal(new Set(s.events[0].value.events.map(p=>p.position.x)).size,32);
  off();s.protocol.emit('world_particles',particle());s.tick();assert.equal(s.events.length,1);
  s.bridge.dispose();assert.equal(s.stopped(),1);assert.deepEqual(s.protocol.eventNames(),[]);assert.deepEqual(s.bot.eventNames(),[]);
});

test('bounded batches, range filtering and failing viewer callbacks never interrupt the game protocol',()=>{
  const s=setup();s.subscribe();s.bridge.subscribe(()=>{throw Error('Viewer unavailable');});s.events.length=0;
  for(let i=0;i<100;i++)s.protocol.emit('world_particles',particle());
  s.protocol.emit('world_particles',{...particle(),x:500});s.tick();
  assert.equal(s.events[0].value.events.length,VIEWER_CONTENT_LIMITS.particleBatch);
  assert.equal(s.bridge.stats().droppedParticles,36);assert.ok(s.bridge.stats().subscriberErrors>=2);s.bridge.dispose();
});

test('maps are retained before a viewer connects, with sparse coverage; particles are never replayed',()=>{
  const s=setup();s.protocol.emit('map',{itemDamage:3,scale:1,locked:false,columns:2,rows:1,x:5,y:6,data:Buffer.from([8,9])});
  s.protocol.emit('world_particles',particle());s.subscribe();s.tick();
  const snapshot=s.events.find(e=>e.name==='mapPixels').value;
  assert.equal(snapshot.data[6*128+5],8);assert.equal(snapshot.data[6*128+6],9);
  assert.equal(snapshot.coverage.reduce((n,b)=>n+b.toString(2).replaceAll('0','').length,0),2);
  assert.equal(s.events.some(e=>e.name==='particleBatch'),false);
  snapshot.data.fill(255);s.events.length=0;s.subscribe();assert.equal(s.events.find(e=>e.name==='mapPixels').value.data[6*128+5],8);
  s.bridge.dispose();
});

test('raw frame metadata updates map component, rotation and invisibility; removal and dimension reset clear replay',()=>{
  const s=setup();s.subscribe();s.events.length=0;
  s.protocol.emit('spawn_entity',{entityId:20,objectUUID:'frame-test',type:registry.entitiesByName.glow_item_frame.id,objectData:3,x:1,y:64,z:0});
  s.protocol.emit('entity_metadata',{entityId:20,metadata:[{key:8,value:slot(19)},{key:9,value:5},{key:0,value:32}]});
  const frame=s.events.at(-1).value;assert.equal(frame.mapId,19);assert.equal(frame.rotation,5);assert.equal(frame.invisible,true);assert.deepEqual(frame.normal,[0,0,1]);
  s.protocol.emit('entity_destroy',{entityIds:[20]});assert.equal(s.events.at(-1).value.delete,true);
  s.protocol.emit('map',{itemDamage:19,scale:0,columns:1,rows:1,x:0,y:0,data:Buffer.from([8])});
  s.protocol.emit('world_particles',particle());s.bot.emit('respawn');s.tick();
  assert.equal(s.bridge.stats().maps,0);assert.equal(s.bridge.stats().pendingParticles,0);assert.equal(s.events.at(-1).name,'contentReset');assert.equal(s.events.at(-1).value.epoch,1);
  s.bridge.dispose();
});

test('map and frame caches are bounded; obsolete versions are rejected instead of interpreted with 1.20.6 IDs',()=>{
  const s=setup();for(let i=0;i<100;i++)s.protocol.emit('map',{itemDamage:i,scale:0,columns:0});
  for(let i=0;i<200;i++)s.protocol.emit('spawn_entity',{entityId:i,objectUUID:'frame-'+i,type:registry.entitiesByName.item_frame.id,objectData:3,x:0,y:64,z:0});
  assert.equal(s.bridge.stats().maps,64);assert.equal(s.bridge.stats().frames,128);s.bridge.dispose();
  assert.throws(()=>createViewerContentBridge({...s.bot,version:'1.21.1'}),/requires_1.20.6/);
});

test('a stalled Socket.IO viewer retains bounded map identities, resends latest pixels, and never replays stale particles',()=>{
  const s=setup();let writable=false;const output=[];
  const socket=Object.assign(new EventEmitter(),{connected:true});socket.emit=(name,value)=>output.push({name,value});
  const off=s.bridge.subscribeSocket(socket,{writable:()=>writable});
  for(let i=0;i<200;i++)s.protocol.emit('map',{itemDamage:i%10,scale:0,columns:1,rows:1,x:0,y:0,data:Buffer.from([i%248])});
  s.protocol.emit('world_particles',particle());s.tick();assert.equal(output.length,0);
  writable=true;for(let i=0;i<4;i++)s.tick();
  assert.equal(output[0].name,'contentReset');const maps=output.filter(e=>e.name==='mapPixels');assert.equal(maps.length,10);
  assert.equal(maps.find(e=>e.value.mapId===9).value.data[0],199);assert.equal(output.some(e=>e.name==='particleBatch'),false);
  assert.ok(maps.every(e=>e.value.snapshot&&e.value.data.length===16384));off();s.bridge.dispose();
});
