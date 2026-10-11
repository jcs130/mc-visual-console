import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PaperYsmPlayers,applyPaperYsmAnimation,paperYsmStatus} from '../../src/modern-viewer/paper-ysm.js';
test('YSM original animation is sampled without eval; unknown Molang is explicitly unavailable',()=>{
 const bone=new THREE.Group(),initial={position:bone.position.clone(),rotation:bone.rotation.clone()};
 const model={bones:new Map([['head',bone]]),initial:new Map([['head',initial]]),reset(){bone.position.copy(initial.position);bone.rotation.copy(initial.rotation);}};
 const clip={format_version:'1.8.0',animations:{idle:{animation_length:2,loop:true,bones:{head:{position:{'0':[0,0,0],'2':[0,16,0]}}}}}};
 applyPaperYsmAnimation(model,clip,'idle',1,{});assert.equal(bone.position.y,-.5);
 clip.animations.idle.bones.head.position=['query.untrusted()',0,0];assert.throws(()=>applyPaperYsmAnimation(model,clip,'idle',0,{}),/MOLANG_UNSUPPORTED/);
 assert.throws(()=>applyPaperYsmAnimation(model,clip,'missing',0,{}),/CLIP_UNAVAILABLE/);
});
test('YSM state cannot mount onto a reused native entity ID or wrong UUID; resets release cache',()=>{
 const uuid='00000000-0000-3000-8000-000000000001',entity={id:3,uuid:'00000000-0000-3000-8000-000000000002'},rendered=new THREE.Group();
 const players=new PaperYsmPlayers({entity:()=>entity,rendered:()=>rendered});
 players.state({schemaVersion:1,source:'freesia_worker',playerUuid:uuid,entityId:3,available:true,renderAvailable:true,assetSha256:'a',modelId:'uploaded'});
 players.asset({schemaVersion:1,format:'ysm-bedrock-original',assetSha256:'a',modelId:'uploaded'});players.tick(0);
 assert.equal(players.stats().rendered,0);assert.equal(players.stats().pending,0);assert.equal(rendered.children.length,0);
 players.clear();assert.equal(players.stats().states,0);assert.equal(players.assets.size,0);
});

test('diagnostics keep missing server state separate from missing assets and recover on the next state',()=>{
 const players=new PaperYsmPlayers({entity:()=>null,rendered:()=>null});
 const row={schemaVersion:1,source:'freesia_worker',playerUuid:'00000000-0000-3000-8000-000000000001',entityId:7};
 players.state({...row,available:false,renderAvailable:false,reason:'YSM_WORKER_STATE_UNAVAILABLE',renderReason:'YSM_WORKER_STATE_UNAVAILABLE'});
 assert.equal(players.stats().serverUnavailable,1);
 assert.equal(players.stats().unavailable,0);
 assert.deepEqual(players.stats().unavailableReasons,['YSM_WORKER_STATE_UNAVAILABLE']);
 assert.equal(players.stats().failed,0);
 assert.match(paperYsmStatus(players.stats()),/YSM_WORKER_STATE_UNAVAILABLE/);
 players.state({...row,available:true,renderAvailable:false,renderReason:'YSM_ASSET_PENDING'});
 assert.equal(players.stats().serverUnavailable,0);
 assert.equal(players.stats().unavailable,1);
 assert.deepEqual(players.stats().unavailableReasons,['YSM_ASSET_PENDING']);
 assert.match(paperYsmStatus(players.stats()),/等待服务器.*模型资源/);
 players.remove(row.playerUuid);
 assert.equal(players.stats().serverUnavailable,0);
 assert.deepEqual(players.stats().unavailableReasons,[]);
 assert.equal(paperYsmStatus(players.stats()),'');
});

test('status text distinguishes unsupported state, unpublished source, transfer timeout and renderer failure',()=>{
 const base={failed:0,serverUnavailable:0,unavailable:0,pending:0,errors:[],unavailableReasons:[],animationUnavailable:[]};
 assert.match(paperYsmStatus({...base,serverUnavailable:1,unavailableReasons:['YSM_WORKER_STATE_UNSUPPORTED']}),/YSM_WORKER_STATE_UNSUPPORTED/);
 assert.match(paperYsmStatus({...base,unavailable:1,unavailableReasons:['YSM_SOURCE_NOT_REGISTERED']}),/公开原始资源/);
 assert.match(paperYsmStatus({...base,unavailable:1,unavailableReasons:['YSM_TRANSFER_TIMEOUT']}),/YSM_TRANSFER_TIMEOUT/);
 assert.match(paperYsmStatus({...base,failed:1,errors:['YSM_GEOMETRY_VALUE_BUDGET']}),/渲染失败.*YSM_GEOMETRY_VALUE_BUDGET/);
});
