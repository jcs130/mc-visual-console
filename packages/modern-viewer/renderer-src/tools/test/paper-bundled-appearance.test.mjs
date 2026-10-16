import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { loadPaperBundledAppearances, PAPER_BUNDLED_SCHEMA } from '../../src/modern-viewer/paper-bundled-appearance.js';
import { PaperYsmPlayers } from '../../src/modern-viewer/paper-ysm.js';
import { validateBundledCatalog } from '../../src/native-viewer/native-bundled-contract.js';

const UUID='01234567-89ab-cdef-0123-456789abcdef',OTHER='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const scope='a'.repeat(32),endpoint='http://127.0.0.1:7793/third/player-appearances/config.json';
function source(){
  const files={definition:'original/ysm.json',model:'original/model.json',animation:'original/animation.json',texture:'original/texture.png',armModel:'original/arm.json',armAnimation:'original/arm-animation.json',extraAnimation:'original/extra.json'};
  const bytes=new Map(Object.values(files).map(path=>[path,Buffer.from(path===files.definition?JSON.stringify({spec:2,properties:{free:true}}):'original '+path)]));
  const assets=Object.fromEntries([...bytes].map(([p,b])=>[p,{sha256:createHash('sha256').update(b).digest('hex'),bytes:b.length}]));
  const config={schema:PAPER_BUNDLED_SCHEMA,selectionScope:scope,defaults:{[UUID]:'bundled:original'},catalog:{schema:'mc-bundled-appearances/v1',source:'plugin_bundled',available:true,assets,
    appearances:[{id:'original',kind:'ysm',label:'Original rig',provenance:'Author-provided original source',modelId:'original',texture:'cream',format:'ysm-bedrock-original',ysmVersion:'2.4.1',files}]}};
  const calls=[];
  const fetcher=async url=>{calls.push(String(url));if(String(url)===endpoint)return {ok:true,status:200,text:async()=>JSON.stringify(config)};
    const path=String(url).split('/assets/')[1],b=bytes.get(path);if(!b)return {ok:false,status:404};
    return {ok:true,headers:{get:()=>String(b.length)},arrayBuffer:async()=>new Uint8Array(b).buffer};};
  return {config,bytes,fetcher,calls};
}
function harness(){
  let entity={id:7,uuid:UUID,isSelf:true,pos:{x:1,y:64,z:2}};const rendered=new THREE.Group(),skin=new THREE.Group(),mesh=new THREE.Group(),actors=[];
  mesh.name='mesh';mesh.add(skin);rendered.add(mesh);
  const players=new PaperYsmPlayers({entity:id=>id===entity.id?entity:null,rendered:()=>rendered,createActor:async(bundle,texture)=>{
    const actor={root:new THREE.Group(),assetInfo:{modelId:bundle.modelId,texture},animate(){},dispose(){this.disposed=true;this.root.removeFromParent();}};actors.push(actor);return actor;
  }});
  return {players,rendered,skin,actors,get entity(){return entity;},set entity(value){entity=value;}};
}
const settle=()=>new Promise(r=>setImmediate(r));
test('same-origin config loads byte-verified originals without a server assignment or game command',async()=>{
  const s=source(),local=await loadPaperBundledAppearances(endpoint,{fetcher:s.fetcher}),h=harness();
  assert.equal(local.attach(h.players,h.entity),true);h.players.tick(0);await settle();
  assert.equal(h.players.stats().rendered,1);assert.equal(h.skin.visible,false);
  assert.equal(h.players.states.get(UUID).source,'same_connection_entity');assert.equal(h.players.states.get(UUID).available,false);
  assert.equal(h.actors[0].assetInfo.selectionSource,'web_viewer_override');assert.equal(h.actors[0].assetInfo.serverModelId,undefined);
  const b=local.bundles[0].bundle;
  for(const [path,bytes]of s.bytes)assert.deepEqual(Buffer.from(b.files[path].base64,'base64'),bytes);
  assert.deepEqual(Buffer.from(b.files['ysm.json'].base64,'base64'),s.bytes.get('original/ysm.json'));
  assert.ok(s.calls.every(url=>url.startsWith('http://127.0.0.1:7793/third/player-appearances/')));
  assert.match(h.players.choices()[2].label,/Web 原模型/);h.players.clear();
});
test('wrong hashes, absent sources and mismatched versions never become selectable models',async()=>{
  const s=source();s.bytes.set('original/texture.png',Buffer.from('tampered'));
  await assert.rejects(loadPaperBundledAppearances(endpoint,{fetcher:s.fetcher}),/HASH_MISMATCH/);
  const v=source();v.config.catalog.appearances[0].ysmVersion='2.6.5';
  await assert.rejects(loadPaperBundledAppearances(endpoint,{fetcher:v.fetcher}),/VERSION_UNSUPPORTED/);
  assert.equal(await loadPaperBundledAppearances(endpoint,{fetcher:async()=>({status:404})}),null);
});
test('large uploaded geometry uses the explicit Paper budget while native defaults remain bounded',async()=>{
  const s=source(),bytes=Buffer.alloc(2226032,32);s.bytes.set('original/model.json',bytes);
  s.config.catalog.assets['original/model.json']={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  assert.throws(()=>validateBundledCatalog(s.config.catalog),/BUNDLED_ASSET_INVALID/);
  const local=await loadPaperBundledAppearances(endpoint,{fetcher:s.fetcher});assert.equal(local.bundles[0].bundle.files['original/model.json'].bytes,2226032);
});
test('defaults apply only to an exact own UUID; foreign entities and IDs cannot borrow it',async()=>{
  const s=source(),local=await loadPaperBundledAppearances(endpoint,{fetcher:s.fetcher}),h=harness();
  assert.equal(local.attach(h.players,{...h.entity,id:99}),false);
  assert.equal(local.attach(h.players,{...h.entity,isSelf:false}),false);
  h.entity={...h.entity,uuid:OTHER};assert.equal(local.attach(h.players,h.entity),true);assert.equal(h.players.selection(OTHER).selected,'server');
  h.players.tick(0);await settle();assert.equal(h.actors.length,0);h.players.clear();
});
test('server restore remains explicit across same-account respawn, refresh and blocked storage',async()=>{
  const s=source(),stored=new Map(),storage={getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)};
  let local=await loadPaperBundledAppearances(endpoint,{fetcher:s.fetcher,storage});const h=harness();
  local.attach(h.players,h.entity);assert.equal(local.select(h.players,UUID,'server'),true);
  h.players.clear();local.clear();h.entity={...h.entity,id:8};local.attach(h.players,h.entity);assert.equal(h.players.selection(UUID).selected,'server');
  local=await loadPaperBundledAppearances(endpoint,{fetcher:s.fetcher,storage});h.players.clear();local.attach(h.players,h.entity);assert.equal(h.players.selection(UUID).selected,'server');
  assert.equal(stored.get(`paper-appearance/v1:${scope}:${UUID}`),'server');
  local=await loadPaperBundledAppearances(endpoint,{fetcher:s.fetcher,storage:{getItem(){throw Error('disabled');},setItem(){throw Error('disabled');}}});
  h.players.clear();local.attach(h.players,h.entity);local.select(h.players,UUID,'server');h.players.clear();local.clear();local.attach(h.players,h.entity);assert.equal(h.players.selection(UUID).selected,'server');h.players.clear();
});
test('live Freesia observations remain authoritative and unchanged below the explicit Web override',async()=>{
  const s=source(),local=await loadPaperBundledAppearances(endpoint,{fetcher:s.fetcher}),h=harness();local.attach(h.players,h.entity);
  const server={schemaVersion:1,source:'freesia_worker',playerUuid:UUID,entityId:7,epoch:'actual-server',available:false,renderAvailable:false,workerConnected:true,stateStatus:'awaiting_model_state'};
  h.players.state(server);local.attach(h.players,h.entity);h.players.tick(1);await settle();
  assert.equal(h.players.states.get(UUID),server);assert.equal(h.players.stats().rendered,1);
  assert.match(h.players.selection(UUID).status,/服务器模型尚未同步/);
  local.select(h.players,UUID,'server');h.players.tick(2);assert.equal(h.players.stats().rendered,0);assert.equal(h.skin.visible,true);
  assert.match(h.players.selection(UUID).status,/等待当前角色/);h.players.clear();
});
