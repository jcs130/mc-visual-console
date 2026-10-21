import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';
import {loadServerItemPack} from '../../host/server-item-pack.mjs';import {ServerItemIcons} from '../../src/native-viewer/server-item-icons.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('an explicit server catalog binds immutable original bytes and rejects changed assets',async t=>{
  const root=await fs.mkdtemp(path.join(tmpdir(),'server-items-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const bytes=await fs.readFile(new URL('../../../asset-packs/qiandengji-items-1.20.6/icons/focus_wand.png',import.meta.url));
  const catalog={schemaVersion:1,id:'fixture-server',minecraftVersion:'1.21.1',items:[{baseId:'minecraft:blaze_rod',customModelData:731004,icon:'focus.png'}],assets:{'focus.png':{sha256:hash(bytes),bytes:bytes.length}}};
  const file=path.join(root,'catalog.json'),json=Buffer.from(JSON.stringify(catalog));await fs.writeFile(file,json);await fs.writeFile(path.join(root,'focus.png'),bytes);
  const loaded=await loadServerItemPack(file,hash(json));assert.deepEqual(loaded.assets.get('focus.png'),bytes);assert.equal(loaded.metadata.id,'fixture-server');
  await fs.writeFile(path.join(root,'focus.png'),Buffer.from('wrong'));await assert.rejects(loadServerItemPack(file,hash(json)),/ASSET_HASH_MISMATCH/);
  assert.equal((await loadServerItemPack('')).metadata.available,false);
});
test('browser never loads a server resource without current activation and never borrows an icon for another model',async()=>{
  const bytes=new Uint8Array([1,2,3]),catalog={available:true,schemaVersion:1,id:'fixture-server',minecraftVersion:'1.21.1',catalogSha256:'a'.repeat(64),
    items:[{baseId:'minecraft:blaze_rod',customModelData:731004,icon:'focus.png'}],assets:{'focus.png':{sha256:hash(bytes),bytes:3}}};
  const requests=[],revoked=[];let changes=0;
  const icons=new ServerItemIcons({fetchResource:async url=>{requests.push(url);return {ok:true,json:async()=>catalog,arrayBuffer:async()=>bytes.buffer};},
    createUrl:()=> 'blob:exact',revokeUrl:url=>revoked.push(url),onChange:()=>changes++});
  const item={name:'minecraft:blaze_rod',count:1,snbt:'{id:"minecraft:blaze_rod",count:1,components:{"minecraft:custom_model_data":731004}}'};
  assert.equal(icons.resolve(item),null);assert.deepEqual(requests,[]);
  icons.setPack('fixture-server');
  for(let i=0;i<1000&&!icons.catalog;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.ok(icons.catalog);assert.ok(icons.selector(item));icons.resolve(item);
  for(let i=0;i<1000&&(!changes||icons.reason(item)==='loading');i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(icons.packReason,undefined);assert.notEqual(icons.reason(item),'loading');
  assert.equal(icons.resolve(item).verified,true);assert.equal(icons.resolve(item).source,'explicit_server_pack:fixture-server');
  assert.equal(icons.resolve({...item,snbt:item.snbt.replace('731004','731099')}),null);
  icons.setPack(null);assert.deepEqual(revoked,['blob:exact']);assert.equal(icons.resolve(item),null);icons.dispose();
});
