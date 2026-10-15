import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {deflateSync,crc32} from 'node:zlib';
import {io} from 'socket.io-client';
import {createJavaDataViewer} from '../host/java-data-viewer.mjs';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function skinPng(){
 const chunk=(name,bytes)=>{const kind=Buffer.from(name),out=Buffer.alloc(bytes.length+12);out.writeUInt32BE(bytes.length);kind.copy(out,4);bytes.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([kind,bytes])),out.length-4);return out;};
 const header=Buffer.alloc(13);header.writeUInt32BE(64);header.writeUInt32BE(64,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.alloc(64*(1+64*4)))),chunk('IEND',Buffer.alloc(0))]);
}
async function rig({nativeSkin=false,invalidSkin=false,minecraftVersion='1.21.1'}={}) {
 const root=await mkdtemp(path.join(tmpdir(),'native-data-view-'));
 for(const route of ['','third','dungeon']){await mkdir(path.join(root,'public',route),{recursive:true});await writeFile(path.join(root,'public',route,'index.html'),'<body>WebGL</body>');}
 await writeFile(path.join(root,'public/asset-source.json'),JSON.stringify({minecraftVersion}));await writeFile(path.join(root,'public/viewer.css'),'');
 await mkdir(path.join(root,`public/textures/${minecraftVersion}/entity/player/slim`),{recursive:true});await writeFile(path.join(root,`public/textures/${minecraftVersion}/entity/player/slim/efe.png`),Buffer.from('fixture-resource'));
 let sequence=0,fail=false;const methods=[];
 const uuid='11111111-1111-4111-8111-111111111111',skinResource=nativeSkin?'minecraft:skins/actual-resource-key':'minecraft:textures/entity/player/slim/efe.png';
 const rpc=async(method,args)=>{methods.push(method);if(fail)throw Error('native disconnected');
  const base={protocol:'agent-mc-visual/v1',minecraftVersion,epoch:'fixture',sequence:++sequence,sampledAt:Date.now(),uuid,server:''};
  if(method==='visual_registry')return {...base,registry:{blocks:[{id:0,name:'minecraft:air',properties:{}}],biomes:[{id:0,name:'minecraft:plains'}]}};
  if(method==='visual_frame')return {...base,columns:[],entities:[],health:20,food:20,time:6000,self:{id:1,uuid,name:'minecraft:player',position:[sequence,64,0],yaw:0,pitch:0,headYaw:0,equipment:[],skinResource,skinModel:'slim',velocity:[.1,0,0],hurtTime:0}};
  if(method==='visual_skin'){assert.equal(args.resource,skinResource);return {...base,resource:invalidSkin?'different-player':skinResource,source:'same_java_client_skin_texture',mime:'image/png',width:64,height:64,base64:skinPng().toString('base64')};}
  throw Error('Unexpected RPC '+method);
 };
 const host=await createJavaDataViewer({port:0,assetsDir:root,rpc,uuid,server:'',minecraftVersion});const sockets=[];
 return {host,methods,fail(){fail=true},connect(){const socket=io(host.url,{path:'/third/socket.io',transports:['websocket'],reconnection:false});sockets.push(socket);return socket;},async close(){for(const s of sockets)s.disconnect();await host.close();await rm(root,{recursive:true,force:true});}};
}
test('1.21.1 advertises and serves only matching data and assets',async()=>{
 const r=await rig({minecraftVersion:'1.21.1'});try{
  const s=r.connect();let version;s.on('version',v=>version=v);await sleep(200);
  assert.equal(version,'1.21.1');assert.equal(r.host.status().minecraftVersion,'1.21.1');assert.equal(r.host.status().error,null);
 }finally{await r.close();}
});
test('native read-only host preserves all three movement messages; never requests screenshots or controller actions',async()=>{
 const r=await rig();try {
  const s=r.connect(),positions=[],avatars=[],moves=[];
  s.on('position',v=>positions.push(v));s.on('avatarState',v=>avatars.push(v));s.on('entityMoved',v=>moves.push(v));
  await sleep(550);
  assert.ok(positions.length>5);assert.ok(avatars.length>=positions.length-2);assert.ok(moves.length>=positions.length-2);
  assert.equal(positions.at(-1).pos.x,avatars.at(-1).entity.pos.x);assert.equal(moves.at(-1).pos.x,avatars.at(-1).entity.pos.x);
  const skin=await fetch(r.host.url+avatars.at(-1).entity.skinUrl);assert.equal(await skin.text(),'fixture-resource');
  assert.deepEqual([...new Set(r.methods)].sort(),['visual_frame','visual_registry']);
  assert.equal((await fetch(r.host.url+'/native/frame')).status,404);
  assert.equal((await fetch(r.host.url+'/healthz',{headers:{Origin:'https://other.test'}})).status,403);
  assert.equal((await fetch(r.host.url+'/healthz',{method:'POST'})).status,403);
 } finally {await r.close();}
});

test('custom native skin is requested once on demand and served with its exact pixels',async()=>{
 const r=await rig({nativeSkin:true});try{
  await sleep(80);assert.deepEqual(r.methods,[]);const a=r.connect();let entity;a.on('playerEntity',v=>{entity=v});await sleep(180);
  assert.equal(a.connected,true);assert.ok(entity.skinUrl.startsWith('/head-texture/'));
  assert.deepEqual(Buffer.from(await(await fetch(r.host.url+entity.skinUrl)).arrayBuffer()),skinPng());
  const b=r.connect();await sleep(100);assert.equal(b.connected,true);assert.equal(r.methods.filter(m=>m==='visual_skin').length,1);
  assert.ok(r.methods.every(m=>m.startsWith('visual_')));
 }finally{await r.close();}
});

test('a mismatched native skin never substitutes a different player or starts a live view',async()=>{
 const r=await rig({nativeSkin:true,invalidSkin:true});try{const a=r.connect();await sleep(180);assert.equal(a.connected,false);assert.equal(r.host.status().error,'JAVA_VISUAL_NATIVE_SKIN_INVALID');assert.equal(r.host.status().frames,0);}finally{await r.close();}
});
test('loss of actual native data disconnects viewers and clears live cache without reconnecting the game',async()=>{
 const r=await rig();try {
  const s=r.connect();await sleep(150);assert.equal(s.connected,true);r.fail();await sleep(150);
  assert.equal(s.connected,false);assert.equal(r.host.status().ok,false);assert.equal(r.host.status().columns,0);
  assert.equal(r.host.status().error,'native disconnected');
  assert.ok(r.methods.every(m=>m.startsWith('visual_')));
 }finally{await r.close();}
});
test('normal viewer session limit stays two',async()=>{
 const r=await rig();try{const a=r.connect(),b=r.connect(),c=r.connect();await sleep(200);
  assert.equal([a,b,c].filter(s=>s.connected).length,2);assert.equal(r.host.status().viewers,2);
 }finally{await r.close();}
});

test('idle views and health reads do not sample; opening resumes with fresh data and closing releases demand',async()=>{
 const r=await rig();try {
  await sleep(150);await fetch(r.host.url+'/');await fetch(r.host.url+'/healthz');
  assert.deepEqual(r.methods,[]);assert.equal(r.host.status().state,'idle');
  const a=r.connect();await sleep(180);assert.ok(r.methods.length>1);
  a.disconnect();await sleep(80);const count=r.methods.length;
  await sleep(180);assert.equal(r.methods.length,count);assert.equal(r.host.status().sampling,false);
  const b=r.connect();let fresh=false;b.on('position',()=>{fresh=true});await sleep(180);
  assert.ok(fresh);assert.ok(r.methods.length>count);assert.equal(r.host.status().state,'streaming');
 }finally{await r.close();}
});
