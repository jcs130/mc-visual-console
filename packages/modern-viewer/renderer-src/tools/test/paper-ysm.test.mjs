import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PaperYsmPlayers,applyPaperYsmAnimation,createPaperYsmActor} from '../../src/modern-viewer/paper-ysm.js';

test('uploaded YSM actors mount a complex original rig without dropping bones or cubes',async()=>{
 const cube={origin:[0,0,0],size:[1,1,-1],uv:[0,0]};
 const bones=Array.from({length:272},(_,i)=>({name:`rig_${i}`,pivot:[0,i/10,0],...(i?{parent:'rig_0'}:{cubes:Array(83).fill(cube)})}));
 const encode=value=>({base64:Buffer.from(JSON.stringify(value)).toString('base64')});
 const bundle={modelId:'uploaded-complex',assetSha256:'test',model:'model.json',animation:'animation.json',textures:{main:'texture.png'},files:{
   'ysm.json':encode({spec:2,properties:{free:true}}),'model.json':encode({format_version:'1.12.0','minecraft:geometry':[{description:{texture_width:128,texture_height:128},bones}]}),
   'animation.json':encode({format_version:'1.8.0',animations:{idle:{loop:true,bones:{}}}}),'texture.png':{base64:''}}};
 const actor=await createPaperYsmActor(bundle,'main',{loadTexture:async()=>new THREE.Texture()});
 assert.equal(actor.assetInfo.bones,272);assert.equal(actor.assetInfo.cubes,83);assert.equal(actor.model.bones.get('rig_271').parent.name,'rig_0');
 actor.animate({animation:'idle'},0);assert.equal(actor.assetInfo.completeEntityParityVerified,false);actor.dispose();
});
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
