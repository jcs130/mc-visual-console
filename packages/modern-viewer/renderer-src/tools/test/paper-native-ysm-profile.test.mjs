import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PaperYsmPlayers,paperYsmAvailabilityText} from '../../src/modern-viewer/paper-ysm.js';
import {SERVER_YSM_PROFILES} from '../../src/modern-viewer/server-ysm-profile.js';

const uuid='01234567-89ab-cdef-0123-456789abcdef';
const row={schemaVersion:1,source:'ysm_native_backend',...SERVER_YSM_PROFILES.ysm_native_backend,
  playerUuid:uuid,entityId:7,epoch:'native-epoch',available:true,renderAvailable:true,modelId:'original',texture:'white',assetSha256:'a'.repeat(64)};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const entity={id:7,uuid,pos:{x:0,y:64,z:0}},rendered=new THREE.Group(),skin=new THREE.Group(),mesh=new THREE.Group(),actors=[];
 mesh.name='mesh';mesh.add(skin);rendered.add(mesh);
 const players=new PaperYsmPlayers({entity:id=>id===entity.id?entity:null,rendered:()=>rendered,createActor:async()=>{
  const actor={root:new THREE.Group(),assetInfo:{modelId:'original'},animate(){},dispose(){this.root.removeFromParent();}};actors.push(actor);return actor;
 }});
 return {entity,skin,players,actors};
}
test('browser accepts a native source only with its complete pinned profile',()=>{
 const {players}=harness();
 for(const patch of [{jarSha256:'0'.repeat(64)},{protocolVersion:'2.4.0'},{ysmVersion:'2.4.1'}])players.state({...row,...patch});
 assert.equal(players.states.size,0);players.state(row);assert.equal(players.states.get(uuid),row);players.clear();
});
test('a native server assignment mounts only its matching asset profile on the real body',async()=>{
 for(const version of ['2.4.1','2.6.5']){
  const h=harness();h.players.state(row);
  h.players.asset({schemaVersion:1,format:'ysm-bedrock-original',ysmVersion:version,modelId:row.modelId,assetSha256:row.assetSha256,files:{},textures:{white:'texture.png'}});
  h.players.tick(0);await settle();
  assert.equal(h.actors.length,version==='2.6.5'?1:0);assert.equal(h.skin.visible,version!=='2.6.5');
  h.entity.uuid='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';h.players.tick(1);assert.equal(h.players.stats().rendered,0);assert.equal(h.skin.visible,true);h.players.clear();
 }
});
test('encrypted and disabled originals explain availability without inventing a replacement',()=>{
 assert.match(paperYsmAvailabilityText({...row,renderAvailable:false,renderReason:'YSM_ENCRYPTED_SOURCE_REQUIRED'}),/加密原包仅原生客户端/);
 assert.match(paperYsmAvailabilityText({...row,available:false,reason:'YSM_NATIVE_ATTACHMENT_UNINITIALIZED'}),/等待服务器确认/);
 assert.match(paperYsmAvailabilityText({...row,available:false,reason:'YSM_MODEL_DISABLED'}),/已停用 YSM/);
});
