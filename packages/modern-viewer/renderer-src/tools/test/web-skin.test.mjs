import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {readWebSkin,skinPngDimensions,BrowserSkinStore,paperSkinBundle} from '../../src/modern-viewer/web-skin.js';
import {PaperBundledAppearanceSelection} from '../../src/modern-viewer/paper-bundled-appearance.js';
import {PaperYsmPlayers,createPaperYsmActor} from '../../src/modern-viewer/paper-ysm.js';
import {installAppearanceSettings} from '../../src/modern-viewer/appearance-settings.js';
import {Document,Element} from './fixtures/native-console-dom.mjs';
const UUID='01234567-89ab-cdef-0123-456789abcdef',OTHER='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const png=new Uint8Array(await readFile(new URL('../../../asset-packs/native-1.21.1/assets/minecraft/textures/entity/player/wide/steve.png',import.meta.url)));
const memory=()=>{const rows=new Map();return {rows,getItem:k=>rows.get(k),setItem:(k,v)=>rows.set(k,v)};};
const settle=()=>new Promise(r=>setImmediate(r));
async function waitForRendered(players, tick) {
 const deadline=Date.now()+2000;
 while(players.stats().rendered!==1&&Date.now()<deadline){await settle();players.tick(tick);}
 assert.equal(players.stats().rendered,1,'restored PNG must finish its asynchronous digest and actor load');
}
const uploadFile={name:'my-skin.png',size:png.length,arrayBuffer:async()=>png.slice().buffer};
function harness(){
 const entity={id:7,uuid:UUID,isSelf:true},rendered=new THREE.Group();
 const players=new PaperYsmPlayers({entity:id=>id===entity.id?entity:null,rendered:()=>rendered,createActor:async(b,t)=>createPaperYsmActor(b,t,{loadTexture:async()=>new THREE.Texture({width:64,height:64})})});
 return {entity,players};
}
test('original PNG survives upload; arm type is part of the asset revision, not a texture rewrite',async()=>{
 const wide=await readWebSkin(png,{model:'wide'}),slim=await readWebSkin(png,{model:'slim'});
 assert.equal(wide.sha256,slim.sha256);assert.notEqual(wide.assetSha256,slim.assetSha256);
 assert.deepEqual(new Uint8Array(Buffer.from(wide.base64,'base64')),png);assert.deepEqual(skinPngDimensions(png),{width:64,height:64});
 const legacy=png.slice();new DataView(legacy.buffer).setUint32(20,32);assert.equal(skinPngDimensions(legacy).height,32);
 const hd=png.slice();const view=new DataView(hd.buffer);view.setUint32(16,256);view.setUint32(20,256);assert.equal(skinPngDimensions(hd).width,256);
 assert.throws(()=>skinPngDimensions(new Uint8Array([60,104,116,109,108])),/PNG/);
 view.setUint32(20,48);assert.throws(()=>skinPngDimensions(hd),/皮肤须为/);
});
test('browser storage is exact-account scoped, verifies original bytes, and degrades to current-page storage',async()=>{
 const storage=memory(),store=new BrowserSkinStore(storage,'scope'),row=await readWebSkin(png,{model:'slim'});
 assert.equal(store.save(UUID,row),true);assert.equal(await new BrowserSkinStore(storage,'scope').load(OTHER),null);
 assert.equal((await new BrowserSkinStore(storage,'scope').load(UUID)).sha256,row.sha256);
 const wrong={...row,sha256:'a'.repeat(64)};storage.setItem(store.key(UUID),JSON.stringify(wrong));
 await assert.rejects(new BrowserSkinStore(storage,'scope').load(UUID),/校验失败/);
 const blocked=new BrowserSkinStore({setItem(){throw Error('quota');}},'scope');assert.equal(blocked.save(UUID,row),false);assert.equal(await blocked.load(UUID),row);
});
test('uploaded PNG renders with the selected standard skin rig and restores after refresh without game actions',async()=>{
 const storage=memory(),local=new PaperBundledAppearanceSelection({bundles:[],storage,scope:'scope',decodeSkin:async()=>{}}),h=harness();local.attach(h.players,h.entity);
 const result=await local.upload(h.players,h.entity,uploadFile,'slim');assert.equal(result.saved,true);h.players.tick(0);await settle();
 assert.equal(h.players.stats().rendered,1);assert.equal(h.players.stats().assets[0].texture,'slim');
 assert.equal(h.players.actors.get(UUID).actor.playerObject.skin.modelType,'slim');assert.equal(h.players.states.get(UUID).available,false);
 h.players.clear();const refreshed=new PaperBundledAppearanceSelection({bundles:[],storage,scope:'scope'});refreshed.attach(h.players,h.entity);await waitForRendered(h.players,10);
 assert.equal(h.players.stats().rendered,1);assert.equal(h.players.stats().assets[0].sha256,result.sha256);
 refreshed.decodeSkin=async()=>{};await refreshed.upload(h.players,h.entity,uploadFile,'wide');h.players.tick(20);await settle();assert.equal(h.players.stats().assets[0].texture,'wide');h.players.clear();
});
test('a delayed file read cannot apply to a new identity or resurrect a disconnected actor',async()=>{
 const storage=memory(),local=new PaperBundledAppearanceSelection({bundles:[],storage,scope:'scope',decodeSkin:async()=>{}}),h=harness();let resolve;
 const pending=local.upload(h.players,h.entity,{...uploadFile,arrayBuffer:()=>new Promise(r=>{resolve=r;})},'wide');
 local.clear();h.players.clear();resolve(png.slice().buffer);await assert.rejects(pending,/观战玩家已变化/);assert.equal(h.players.states.size,0);assert.equal(storage.rows.size,0);
 h.entity.uuid=OTHER;local.attach(h.players,h.entity);await settle();assert.equal(h.players.selection(OTHER).selected,'server');h.players.clear();
});
test('a PNG decode failure preserves the previous appearance and is not saved',async()=>{
 const storage=memory(),local=new PaperBundledAppearanceSelection({bundles:[],storage,scope:'scope',decodeSkin:async()=>{throw Error('invalid PNG decoder result');}}),h=harness();
 local.attach(h.players,h.entity);await assert.rejects(local.upload(h.players,h.entity,uploadFile,'wide'),/invalid PNG/);
 assert.equal(h.players.selection(UUID).selected,'server');assert.equal(storage.rows.size,0);h.players.clear();
});
test('upload control is disabled before an identity; failures survive periodic UI refresh and are cleaned up',async()=>{
 const document=new Document(),window=new Element('window',document);let calls=0;
 const ui=installAppearanceSettings({document,window,onUpload:async()=>{calls++;throw Error('invalid PNG');}});
 const file=document.querySelector('input'),snapshot={available:true,selected:'server',subject:'player',choices:[{id:'server',label:'跟随服务器'}],status:'ready'};
 assert.equal(file.disabled,true);ui.update(snapshot);assert.equal(file.disabled,false);file.files=[uploadFile];file.dispatch('change');await settle();
 ui.update(snapshot);assert.equal(calls,1);assert.match(document.querySelector('output').textContent,/invalid PNG/);
 ui.dispose();file.dispatch('change');assert.equal(calls,1);
});
