import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PaperYsmPlayers,applyPaperYsmAnimation,createPaperYsmActor,paperYsmHeadAnchor,paperYsmAvailabilityText} from '../../src/modern-viewer/paper-ysm.js';

test('YSM status distinguishes the live worker waiting for a player binding from missing original assets',()=>{
 const uuid='822d173a-7181-3b9b-be60-804f29b24ecc';
 const waiting={schemaVersion:1,source:'freesia_worker',playerUuid:uuid,entityId:16212,available:false,renderAvailable:false,workerConnected:true,stateStatus:'awaiting_model_state',reason:'YSM_WORKER_STATE_UNAVAILABLE',renderReason:'YSM_WORKER_STATE_UNAVAILABLE'};
 assert.equal(paperYsmAvailabilityText(waiting),'模型服务已连接，等待当前角色的 YSM 模型状态');
 assert.equal(paperYsmAvailabilityText({...waiting,stateStatus:'worker_offline',workerConnected:false}),'YSM 模型服务暂未连接');
 assert.equal(paperYsmAvailabilityText({...waiting,stateStatus:'awaiting_initial_poll',workerConnected:undefined}),'等待模型服务返回当前角色的 YSM 模型状态');
 assert.equal(paperYsmAvailabilityText({...waiting,available:true,renderReason:'YSM_ASSET_PENDING'}),'等待原始 YSM 模型资源');
 assert.equal(paperYsmAvailabilityText({...waiting,available:true,renderAvailable:true}),'');
 const players=new PaperYsmPlayers({entity:()=>({id:16212,uuid}),rendered:()=>new THREE.Group()});
 players.state(waiting);
 assert.match(players.selection(uuid).status,/等待当前角色的 YSM 模型状态/);
 assert.doesNotMatch(players.selection(uuid).status,/缺少可公开原始资源/);
 players.clear();
});
test('sleep anchors to the confirmed bed in all directions and recovery resets every root transform',async()=>{
 const encode=value=>({base64:Buffer.from(JSON.stringify(value)).toString('base64')});
 const bundle={modelId:'sleep-test',model:'m',animation:'a',textures:{main:'t'},files:{
  'ysm.json':encode({spec:2,properties:{free:true}}),m:encode({format_version:'1.12.0','minecraft:geometry':[{description:{texture_width:16,texture_height:16},bones:[{name:'Head',pivot:[0,24,0],cubes:[{origin:[-4,20,-4],size:[8,8,8],uv:[0,0]}]}]}]}),
  a:encode({format_version:'1.8.0',animations:{idle:{loop:true,bones:{}},sleep:{loop:true,bones:{}}}}),t:{base64:''}}};
 const actor=await createPaperYsmActor(bundle,'main',{loadTexture:async()=>new THREE.Texture()});
 const parent=new THREE.Group();parent.position.set(-6,65,12);parent.rotation.y=.8;parent.add(actor.root);
 for(const bedFacing of ['north','south','east','west']){
  actor.animate({renderedYaw:.8,motion:{pose:'sleeping',sleepState:{sleeping:true,bedFacing,bedPosition:{x:-5,y:64,z:10}}}},1000);
  const head=actor.headAnchor();assert.ok(Math.abs(head.x+4.5)<1e-8);assert.ok(Math.abs(head.z-10.5)<1e-8);
  const direction=new THREE.Vector3(0,1,0).applyQuaternion(actor.root.getWorldQuaternion(new THREE.Quaternion()));
  const expected={north:[0,0,-1],south:[0,0,1],west:[-1,0,0],east:[1,0,0]}[bedFacing];
  assert.ok(direction.distanceTo(new THREE.Vector3(...expected))<1e-8);
  // Neutral authored head faces local -Z. The full living-entity sleep
  // transform must turn that face upward, independent of the bed heading.
  // A yaw + sideways roll alone passes the bed-axis check but leaves it wrong.
  const face=new THREE.Vector3(0,0,-1).transformDirection(actor.model.bones.get('Head').matrixWorld);
  assert.ok(face.y>.999999,'sleep must preserve face-up orientation');
  assert.equal(actor.animationState.base,'sleep');
 }
 actor.animate({motion:{bodyState:{source:'server',pose:'downed',canAct:false}}},1100);assert.equal(actor.root.rotation.x,Math.PI/2);
 actor.animate({motion:{onGround:true,bodyState:{source:'server',pose:'standing',canAct:true},sleepState:{sleeping:false}}},1200);
 assert.deepEqual(actor.root.rotation.toArray().slice(0,3),[0,0,0]);assert.deepEqual(actor.root.position.toArray(),[0,0,0]);
 actor.dispose();
});

test('nametag follows the animated head and ignores hidden bind-pose props',()=>{
 const root=new THREE.Group(),head=new THREE.Group(),prop=new THREE.Group();head.name='Head';root.add(head,prop);
 head.position.y=1.6;head.add(new THREE.Mesh(new THREE.BoxGeometry(.8,.8,.8)));prop.position.y=8;
 prop.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1)));
 const folded=new THREE.Group();folded.position.y=20;folded.scale.setScalar(0);folded.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1)));head.add(folded);
 const model={bones:new Map([['Head',head]])};root.position.set(50,64,10);root.rotation.y=1;
 assert.ok(Math.abs(paperYsmHeadAnchor(model,root).y-66.22)<1e-8);
 head.position.y=.5;assert.ok(Math.abs(paperYsmHeadAnchor(model,root).y-65.12)<1e-8);
 root.traverse(p=>p.geometry?.dispose());
});

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

test('YSM smoothing is reversible sampling, with original geometry and GPU upload stable between frames',async()=>{
 const encode=value=>({base64:Buffer.from(JSON.stringify(value)).toString('base64')}),texture=new THREE.Texture();
 const bundle={modelId:'sampling-test',assetSha256:'test',model:'m.json',animation:'a.json',textures:{main:'t.png'},files:{
  'ysm.json':encode({spec:2,properties:{free:true}}),'m.json':encode({format_version:'1.12.0','minecraft:geometry':[{description:{texture_width:16,texture_height:16},bones:[{name:'Root',pivot:[0,0,0],cubes:[{origin:[0,0,0],size:[1,1,1],uv:[0,0]}]}]}]}),
  'a.json':encode({format_version:'1.8.0',animations:{idle:{loop:true,bones:{}}}}),'t.png':{base64:'original'}}};
 const actor=await createPaperYsmActor(bundle,'main',{loadTexture:async()=>texture});
 let mesh;actor.model.root.traverse(part=>{if(part.isMesh)mesh??=part;});const before=mesh.geometry.getAttribute('position').array.slice();
 const policy={avatarSampling:'smooth',anisotropy:4,shadows:false};actor.setPresentation(policy);
 assert.equal(texture.magFilter,THREE.NearestFilter);assert.equal(texture.minFilter,THREE.NearestMipmapLinearFilter);assert.equal(texture.generateMipmaps,true);
 const version=texture.version;for(let i=0;i<120;i++)actor.setPresentation(policy);assert.equal(texture.version,version,'no repeated texture uploads');
 actor.setPresentation({avatarSampling:'original',anisotropy:1,shadows:false});assert.equal(texture.magFilter,THREE.NearestFilter);assert.equal(texture.generateMipmaps,false);
 assert.deepEqual(mesh.geometry.getAttribute('position').array,before);actor.dispose();
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
