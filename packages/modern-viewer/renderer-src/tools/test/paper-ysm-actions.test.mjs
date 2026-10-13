import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {compilePaperMolang} from '../../src/modern-viewer/paper-ysm-molang.js';
import {compilePaperYsmClip,samplePaperYsmClip,PaperYsmAnimation} from '../../src/modern-viewer/paper-ysm-animation.js';
import {PaperYsmPlayers} from '../../src/modern-viewer/paper-ysm.js';
import {createPaperHeldItem,resolvePaperHeldModel,PaperYsmHeldItems,paperYsmItemMount} from '../../src/modern-viewer/paper-ysm-items.js';
const context=()=>({variables:Object.create(null),queries:{'query.anim_time':.25,'ysm.head_pitch':30},random:()=>.5});
const model=()=>{const bones=new Map(['Root','Head','RightArm','LeftArm','RightHandLocator','LeftHandLocator'].map(n=>[n,new THREE.Group()]));const initial=new Map([...bones].map(([n,b])=>[n,{position:b.position.clone(),rotation:b.rotation.clone()}]));return {bones,initial,reset(){for(const[n,b]of bones){b.position.copy(initial.get(n).position);b.rotation.copy(initial.get(n).rotation);b.scale.setScalar(1);}}};};

test('fresh body water selects swim or tread, grounded wading stays walking and transitions remain continuous',()=>{
  const m=model(),main={format_version:'1.8.0',animations:Object.fromEntries(['idle','walk','jump','swim','swim_stand'].map(name=>[name,{loop:true,bones:{Root:{position:[name==='swim'?16:0,0,0]}}}]))};
  const c=new PaperYsmAnimation(m,main),water={inWater:true,onGround:false,horizontalSpeed:2};
  assert.equal(c.apply({motion:{onGround:true}},1000).base,'idle');
  assert.equal(c.apply({motion:water},1100).base,'swim');assert.equal(m.bones.get('Root').position.x,0);
  c.apply({motion:water},1155);c.apply({motion:water},1210);
  assert.ok(Math.abs(m.bones.get('Root').position.x-.5)<1e-8,'fixed transition origin, not the previous blended frame');
  c.apply({motion:water},1320);assert.equal(m.bones.get('Root').position.x,1);
  assert.equal(c.apply({motion:{...water,horizontalSpeed:0}},1400).base,'swim_stand');
  assert.equal(m.bones.get('Root').position.x,1,'no snap on tread transition');
  assert.equal(c.apply({motion:{...water,onGround:true}},1700).base,'walk');
  assert.equal(c.apply({motion:{onGround:false}},2000).base,'jump','unknown water is not a swimming claim');
});

test('own-body water never leaks through a reused ID, changed epoch, stale packet or missing boolean',()=>{
  const uuid='00000000-0000-3000-8000-000000000001',entity={id:7,uuid,pos:{x:0,y:62,z:0}},players=new PaperYsmPlayers({entity:()=>entity});
  const binding={schemaVersion:1,source:'freesia_worker',playerUuid:uuid,entityId:7,epoch:'a',available:true};players.state(binding);
  players.bodyMotion({entity,inWater:true,onGround:false,verticalSpeed:.2,horizontalSpeed:.23,sprinting:true,health:18,maxHealth:24},1000);
  assert.equal(players.motionFor(uuid,entity,1100).inWater,true);
  assert.equal(players.motionFor(uuid,entity,1100).verticalSpeed,4,'blocks/tick converted to YSM metres/second');
  assert.equal(players.motionFor(uuid,entity,1100).health,18);
  assert.equal(players.motionFor(uuid,entity,1100).maxHealth,24);
  for(let now=1101;now<1200;now+=16){assert.ok(Math.abs(players.motionFor(uuid,entity,now).horizontalSpeed-4.6)<1e-8);assert.equal(players.motionFor(uuid,entity,now).sprinting,true);}
  players.bodyMotion({entity,inWater:false,onGround:true},1200);
  assert.equal(players.motionFor(uuid,entity,1201).inWater,false);
  assert.equal(players.motionFor(uuid,entity,1900).inWater,undefined);
  assert.equal(players.motionFor(uuid,entity,1900).health,undefined);
  players.bodyMotion({entity:{...entity,id:8},inWater:true},1901);
  assert.equal(players.motionFor(uuid,entity,1902).inWater,undefined);
  players.bodyMotion({entity,inWater:true},2000);players.state({...binding,epoch:'b'});
  assert.equal(players.motionFor(uuid,entity,2001).inWater,undefined);
  players.bodyMotion({entity,inWater:null},2100);assert.equal(players.motionFor(uuid,entity,2101).inWater,undefined);
  players.clear();
});
test('bounded Molang arithmetic, degrees, aliases, optional ternary and original combo variables',()=>{
  const c=context();assert.ok(Math.abs(compilePaperMolang('math.sin(q.anim_time*360)')(c)-1)<1e-8);
  assert.equal(compilePaperMolang('v.qh=1; v.qh==1?15;')(c),15);
  assert.equal(compilePaperMolang('v.qh==2?15;')(c),0);
  assert.equal(compilePaperMolang('v.qh2=v.qh; v.qh=!v.jump?v.qh2+1+(v.qh2>=2?-v.qh2);')(c),2);
  assert.equal(compilePaperMolang('v.qh=!v.jump?v.qh2+1+(v.qh2>=2?-v.qh2);')(c),2);
  assert.equal(compilePaperMolang('math.clamp(ysm.head_pitch,-20,20)')(c),20);
});
test('Molang cannot execute host code or silently guess an unknown native query',()=>{
  for(const source of ['globalThis.process.exit()','v.a[0]=1','math.constructor(1)','v.a.__proto__=1','while(1)','return fetch(1)','v.x="x"', '('.repeat(100)+'1'+')'.repeat(100)])assert.throws(()=>compilePaperMolang(source),/YSM_MOLANG/);
  assert.throws(()=>compilePaperMolang('query.unavailable')(context()),/INPUT_UNAVAILABLE/);
  assert.throws(()=>compilePaperMolang('1/0')(context()),/VALUE_INVALID/);
});

test('roaming paths are inert flat variables and optional foreign queries retain short-circuit semantics',()=>{
  const c=context();
  assert.equal(compilePaperMolang('v.roaming.umbrella=1; v.roaming.umbrella')(c),1);
  assert.equal(c.variables['variable.roaming.umbrella'],1);
  assert.equal(Object.hasOwn(c.variables,'variable.roaming'),false);
  assert.equal(compilePaperMolang('0 && tlm.is_sitting')(c),0);
  assert.throws(()=>compilePaperMolang('tlm.is_sitting')(c),/INPUT_UNAVAILABLE/);
  for(const value of ['v.roaming.__proto__','v.roaming.constructor','v.roaming.prototype'])assert.throws(()=>compilePaperMolang(value),/UNSUPPORTED/);
});

test('shared clips ignore absent optional bones and keep known channels when a timeline query is unavailable',()=>{
  const m=model(),main={format_version:'1.8.0',animations:{
    pre_parallel0:{loop:'hold_on_last_frame',animation_length:1000,bones:{Root:{position:[0,16,0]},RemovedProp:{scale:0}},timeline:{0:'query.health'}},
    idle:{bones:{Head:{rotation:['ysm.has_offhand?30:10',0,0]}}}
  }};
  const state=new PaperYsmAnimation(m,main).apply({motion:{onGround:true,equipment:[null,{name:'torch'}]}},1000);
  assert.deepEqual(state.ignoredBones,['RemovedProp']);assert.equal(m.bones.get('Root').position.y,-1);
  assert.ok(Math.abs(m.bones.get('Head').rotation.x-Math.PI/6)<1e-10);
  assert.deepEqual(state.errors,['YSM_MOLANG_INPUT_UNAVAILABLE:query.health']);
  assert.equal(state.completeEntityParityVerified,false);
  const clip=compilePaperYsmClip(main,'pre_parallel0',m.bones);
  assert.throws(()=>samplePaperYsmClip(clip,0,context()),/INPUT_UNAVAILABLE/);
  const known=new PaperYsmAnimation(m,main).apply({motion:{onGround:true,health:18,maxHealth:20}},1000);
  assert.deepEqual(known.errors,[]);
});
test('original pre/post discontinuity, Catmull-Rom curve and timeline trigger once per action',()=>{
  const m=model(),d={format_version:'1.8.0',animations:{swing:{animation_length:2,bones:{RightArm:{position:{0:[0,0,0],1:{pre:[16,0,0],post:[32,0,0],lerp_mode:'catmullrom'},2:[48,0,0]}}},timeline:{0:'v.count=v.count+1;',1:'v.count=v.count+1;'}}}};
  const c=context(),clip=compilePaperYsmClip(d,'swing',m.bones),cursor={cycle:-1,time:-1};
  const half=samplePaperYsmClip(clip,.5,c,cursor).get('RightArm').position[0];assert.equal(half,6);
  assert.equal(c.variables['variable.count'],1);samplePaperYsmClip(clip,.6,c,cursor);assert.equal(c.variables['variable.count'],1);
  assert.equal(samplePaperYsmClip(clip,1,c,cursor).get('RightArm').position[0],32);assert.equal(c.variables['variable.count'],2);
});
test('locomotion uses live state; original arm action overlays do not stop the legs or restart every frame',()=>{
  const m=model(),main={format_version:'1.8.0',animations:Object.fromEntries(['idle','walk','run','jump','sneak','sneaking'].map(name=>[name,{animation_length:1,loop:true,bones:{Root:{position:{0:[0,0,0],1:[16,0,0]}},RightArm:{rotation:[10,0,0]}}}]))};
  main.animations.swing_hand={animation_length:.375,bones:{RightArm:{rotation:[90,0,0]}}};
  const arm={format_version:'1.8.0',animations:{'hold_mainhand:sword':{loop:'hold_on_last_frame',animation_length:1,bones:{RightArm:{rotation:[30,0,0]}}},'swing:sword':{animation_length:1.5,bones:{RightArm:{rotation:[70,0,0]}}}}};
  const controller=new PaperYsmAnimation(m,main,{arm});
  const motion={horizontalSpeed:4,onGround:true,equipment:[{name:'diamond_sword'}],swing:{sequence:1,hand:'mainhand',ageSeconds:.2}};
  assert.deepEqual(controller.apply({motion},1000).clips,['walk','hold_mainhand:sword','swing:sword']);
  controller.apply({motion},1250);assert.equal(m.bones.get('Root').position.x,.25);assert.ok(Math.abs(m.bones.get('RightArm').rotation.x-70*Math.PI/180)<1e-10);
  assert.equal(controller.apply({motion:{horizontalSpeed:0,onGround:true}},1500).base,'idle');
  assert.equal(controller.apply({motion:{...motion,sprinting:true}},1600).base,'run');
  assert.equal(controller.apply({motion:{onGround:false}},1700).base,'jump');
  assert.equal(controller.apply({motion:{onGround:true,crouching:true,horizontalSpeed:0}},1800).base,'sneaking');
  assert.equal(controller.apply({motion:{onGround:true,crouching:true,horizontalSpeed:1}},1900).base,'sneak');
});

test('native parallel rotations add; terminal sword timelines clear variables after a skipped frame',()=>{
  const m=model(),main={format_version:'1.8.0',animations:{
    pre_parallel0:{bones:{RightArm:{rotation:[10,0,0]}}},idle:{bones:{RightArm:{rotation:[20,0,0]}}},
    parallel0:{bones:{RightArm:{rotation:[30,0,0]}}},swing_hand:{animation_length:1,timeline:{0:'v.combo=1;',1:'v.combo=0;'},bones:{LeftArm:{rotation:[40,0,0]}}}
  }};
  const controller=new PaperYsmAnimation(m,main);
  controller.apply({motion:{swing:{sequence:1,ageSeconds:.1}}},1000);
  assert.ok(Math.abs(m.bones.get('RightArm').rotation.x-50*Math.PI/180)<1e-10);assert.equal(controller.variables['variable.combo'],1);
  controller.apply({motion:{swing:{sequence:1,ageSeconds:1.5}}},2500);assert.equal(controller.variables['variable.combo'],0);
});
test('an unavailable optional layer cannot freeze a valid walking clip',()=>{
  const main={format_version:'1.8.0',animations:{walk:{loop:true,animation_length:1,bones:{Root:{position:[0,16,0]}}},parallel0:{loop:true,bones:{Head:{rotation:['ysm.unavailable()',0,0]}}}}};
  const m=model(),controller=new PaperYsmAnimation(m,main);const state=controller.apply({motion:{horizontalSpeed:4}},1000);
  assert.equal(state.base,'walk');assert.ok(state.errors.length);assert.equal(m.bones.get('Root').position.y,-1);
});
const itemModels={
  'item/sword':{parent:'item/handheld',textures:{layer0:'item/sword'}},
  'item/handheld':{parent:'item/generated',display:{thirdperson_righthand:{rotation:[0,-90,55],translation:[0,4,.5],scale:[.85,.85,.85]}}},
  'item/generated':{parent:'builtin/generated'},'item/stone':{parent:'block/stone'},
  'block/stone':{textures:{all:'block/stone'},elements:[{from:[0,0,0],to:[16,16,16],faces:{north:{texture:'#all'},south:{texture:'#all'}}}]}
};
const itemOptions={textureLoader:async()=>new THREE.Texture({width:2,height:2}),readPixels:async()=>({width:2,height:2,pixels:new Uint8Array([255,255,255,255,0,0,0,0,255,255,255,255,255,255,255,255])})};

test('original centred block vertices stay at the grip, with only one Java centre translation',async()=>{
  const block=await createPaperHeldItem(itemModels,{name:'stone'},'right',itemOptions);
  const center=new THREE.Box3().setFromObject(block.root).getCenter(new THREE.Vector3());
  assert.ok(center.distanceTo(new THREE.Vector3(0,-.0625,-.1))<1e-6);
  for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
    const forward=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0),yaw);
    assert.ok(forward.distanceTo(new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)))<1e-8);
    const transform=paperYsmItemMount({translation:[3,4,5]},'right');
    const left=paperYsmItemMount({translation:[3,4,5]},'left');
    const rightOrigin=new THREE.Vector3().applyMatrix4(transform),leftOrigin=new THREE.Vector3().applyMatrix4(left);
    assert.ok(Math.abs(rightOrigin.x+leftOrigin.x)<1e-8);
  }
  block.dispose();
});
test('held geometry uses inherited original transforms and alpha edge extrusion, not a GUI plane',async()=>{
  assert.equal(resolvePaperHeldModel(itemModels,'item/sword').generated,true);
  const sword=await createPaperHeldItem(itemModels,{name:'sword'},'right',itemOptions),block=await createPaperHeldItem(itemModels,{name:'stone'},'left',itemOptions);
  assert.equal(sword.root.children.length,1);assert.equal(block.root.children.length,1);
  assert.ok(sword.root.children[0].geometry.getAttribute('position').count>8);
  assert.equal(sword.root.userData.sourceModels.at(-1),'item/sword');assert.notEqual(sword.root.scale.x,1);
  sword.dispose();block.dispose();
  await assert.rejects(()=>createPaperHeldItem(itemModels,{name:'unknown'},'right',itemOptions),/UNAVAILABLE/);
});
test('equipment changes, left-handed players and late loads cannot leave duplicate or stale items',async()=>{
  const m=model(),held=new PaperYsmHeldItems(m,itemModels,itemOptions);
  held.apply([{name:'sword'},null],'left');await new Promise(r=>setTimeout(r,0));
  assert.equal(held.stats().left.status,'ready');assert.equal(m.bones.get('LeftHandLocator').children.length,1);
  held.apply([null,{name:'stone'}],'left');await new Promise(r=>setTimeout(r,0));
  assert.equal(m.bones.get('LeftHandLocator').children.length,0);assert.equal(held.stats().right.name,'stone');
  held.dispose();assert.equal(m.bones.get('RightHandLocator').children.length,0);
});
test('motion identity/epoch, delayed actions and teardown preserve player nametags',()=>{
  const uuid='00000000-0000-3000-8000-000000000001',row={schemaVersion:1,source:'freesia_worker',epoch:'a',playerUuid:uuid,entityId:7,available:true};
  const players=new PaperYsmPlayers({entity:()=>({uuid}),rendered:()=>null});players.state(row);
  const event={...row,source:'same_connection_java_protocol',sequence:1,horizontalSpeed:4,swing:{sequence:1,ageSeconds:.1,hand:'mainhand'}};
  players.motion({...event,epoch:'b'},1000);assert.equal(players.motions.size,0);
  players.motion(event,1000);players.motion({...event,sequence:0},1050);assert.equal(players.motions.get(uuid).at,1000);
  assert.ok(Math.abs(players.motionFor(uuid,{},1200).swing.ageSeconds-.3)<1e-10);
  const parent=new THREE.Group(),skin=new THREE.Group(),tag=new THREE.Group(),body=new THREE.Group();skin.name='mesh';tag.name='nametag';skin.add(tag,body);parent.add(skin);
  const hidden=new Map();tag.position.y=2;players.hideVanilla(parent,null,hidden,new THREE.Vector3(0,2.42,0));assert.equal(tag.visible,true);assert.equal(body.visible,false);assert.equal(skin.visible,true);assert.ok(Math.abs(tag.position.y-2.42)<1e-10);
  players.actors.set(uuid,{actor:{dispose(){}},rendered:parent,hidden});players.remove(uuid);assert.equal(tag.position.y,2);assert.equal(body.visible,true);
  players.clear();assert.equal(players.motions.size,0);
});
