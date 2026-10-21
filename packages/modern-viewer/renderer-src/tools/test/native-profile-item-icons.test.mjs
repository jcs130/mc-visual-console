import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import * as THREE from 'three';
import {NativeAssetReader} from '../../src/native-viewer/model-loader.js';
import {prepareNativeProfileItemIcon} from '../../src/native-viewer/native-profile-item-icons.js';
import {ServerItemIcons} from '../../src/native-viewer/server-item-icons.js';import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const directory=new URL('../../../asset-packs/vanilla-1.21.1/',import.meta.url);
async function reader(){const manifest=JSON.parse(await fs.readFile(new URL('native-assets.json',directory),'utf8'));return new NativeAssetReader(manifest,p=>fs.readFile(new URL(p,directory)));}
const hash='8dcc6eb40f3bada41e4339888d6d207437598bdbd175c2e731191d5a9a42d3c8';
test('profile GUI uses both exact exported 1.21.1 skull layers and original template transform',async()=>{
  const source=await reader(),plan=await prepareNativeProfileItemIcon(source,hash);
  assert.equal(plan.faces.length,12);assert.equal(plan.faces.filter(f=>f.part==='hat').length,6);
  assert.deepEqual(plan.transform,{rotation:[30,45,0],translation:[0,3/16,0],scale:[1,1,1]});
  assert.equal(Math.min(...plan.faces.filter(f=>f.part==='head').flatMap(f=>f.position).filter((_,i)=>i%3===1)),-.5);
  assert.ok(plan.renderFaces.length>0&&plan.renderFaces.length<12);
  source.manifest.clientJarSha256='wrong';await assert.rejects(prepareNativeProfileItemIcon(source,hash),/SOURCE_UNVERIFIED/);
});
test('a server head is rendered from hash-verified skin bytes only for its exact observed profile',async()=>{
  const source=await reader(),bytes=await source.bytes('assets/minecraft/textures/entity/player/wide/steve.png');let renders=0,disposed=0;
  const catalog={available:true,id:'server',minecraftVersion:'1.21.1',items:[{baseId:'minecraft:player_head',profileTextureHash:hash,icon:'head.png'}],assets:{'head.png':{bytes:bytes.length,sha256:sha(bytes)}}};
  const icons=new ServerItemIcons({reader:source,fetchResource:async()=>({ok:true,json:async()=>catalog,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}),
    createUrl:()=> 'blob:head',revokeUrl:()=>{},profileRendererOptions:{loadTexture:async()=>new THREE.Texture({width:64,height:64}),
      createRenderer:()=>({clear(){},render(scene){renders++;assert.equal(scene.children[0].userData.nativeItem,'minecraft:player_head');},dispose(){disposed++;}}),encode:async()=>new Blob(['png'],{type:'image/png'})}});
  const texture=Buffer.from(JSON.stringify({textures:{SKIN:{url:'http://textures.minecraft.net/texture/'+hash}}})).toString('base64');
  const item={name:'minecraft:player_head',count:1,snbt:`{id:"minecraft:player_head",count:1,components:{"minecraft:profile":{name:"",properties:[{name:"textures",value:"${texture}"}]}}}`};
  assert.equal(icons.selector(item),null);icons.setPack('server');while(!icons.catalog)await new Promise(r=>setImmediate(r));
  icons.resolve(item);for(let i=0;i<1000&&icons.reason(item)==='loading';i++)await new Promise(r=>setTimeout(r,1));
  assert.equal(icons.reason(item),null);assert.equal(icons.resolve(item).kind,'native-profile-head-gui');assert.equal(renders,1);
  assert.equal(icons.selector({...item,snbt:'{id:"minecraft:player_head",count:1}'}),null,'no guessed default head');icons.dispose();assert.equal(disposed,1);
});
