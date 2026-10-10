import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PaperYsmPlayers,applyPaperYsmAnimation} from '../../src/modern-viewer/paper-ysm.js';
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
