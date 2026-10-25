import test from 'node:test';
import assert from 'node:assert/strict';
import { PaperObservedPlayer, PAPER_OBSERVATION_MODE } from '../../host/paper-observation.mjs';
import { createNativeSession } from '../../src/native-viewer/native-session.js';
import { nativePresentationView } from '../../src/native-viewer/native-ui-adapter.js';
import { selectNativeHeldItems } from '../../src/native-viewer/native-held-items.js';
import { validatedSource } from '../../host/spectator-protocol.mjs';
const uuid='01234567-89ab-3def-8123-456789abcdef',world='11111111-1111-3111-8111-111111111111',hash='a'.repeat(64);
const packet=name=>Buffer.from(JSON.stringify({name,params:{entityId:8}})).toString('base64');
function receipt(){return{available:true,uuid,generation:world,configurationPackets:[packet('registry_data')],packets:[],player:{uuid,name:'ObservedAgent',entityId:8,
 position:{x:1,y:64,z:2},velocity:{x:0,y:0,z:0},yawDegrees:0,pitchDegrees:0,eyeHeight:1.62,world:{uuid:world,name:'minecraft:overworld',minY:-64,height:384},
 gameTime:100,dayTime:6000,selectedHotbarSlot:0,mainArm:'right',health:20,maxHealth:20,usingItem:false,attackAnim:0,
 inventory:Array.from({length:46},(_,slot)=>({slot,item:slot===36?{name:'minecraft:diamond_sword',count:1,snbt:'{id:"minecraft:diamond_sword",count:1}'}:slot===9?{name:'minecraft:paper',count:1,snbt:'{private:"bag_only_secret"}'}:null}))}};}
function observer(scope='owner'){return new PaperObservedPlayer({playerUuid:uuid,name:'ObservedAgent',registry:{},registrySha256:hash,decodePacket:bytes=>JSON.parse(bytes),scope});}
test('Paper adapter has no game connection, action method or writable client',()=>{
 const o=observer();assert.equal(o._client.state,'observation');assert.equal(o.chat,undefined);assert.equal(o.connect,undefined);assert.equal(o.quit,undefined);
 assert.throws(()=>o._client.write('command'),/READ_ONLY/);o.close();
});
test('actual source identity, world and registries are required before any packet can establish a scene',()=>{
 const o=observer(),events=[];o.events.on('packet',p=>events.push(p));
 assert.throws(()=>o.ingest({...receipt(),uuid:world}),/IDENTITY/);assert.equal(events.length,0);
 assert.throws(()=>o.ingest({...receipt(),configurationPackets:undefined}),/REGISTRIES/);
 o.close();const next=observer();next.ingest(receipt());assert.equal(next.entity.id,8);assert.equal(next.entity.uuid,uuid);assert.equal(next.game.dimension,'minecraft:overworld');next.close();
});
test('native packets preserve ordered delivery while HTTP retries do not replay them',()=>{
 const o=observer(),events=[];o.events.on('packet',p=>events.push(p));const r=receipt();r.packets=[{sequence:1,data:packet('animation')}];
 o.ingest(r);o.ingest(r);assert.equal(events.filter(p=>p.name==='animation').length,1);
 assert.throws(()=>o.ingest({...r,packets:[{sequence:3,data:packet('animation')}]}),/SEQUENCE/);
 assert.throws(()=>o.ingest({...r,packets:[{sequence:2,data:packet('custom_payload')}]}),/NOT_ALLOWED/);o.close();
});
test('public scene contains only visible equipment, never a fabricated empty inventory or private bag',()=>{
 const o=observer('scene');o.ingest(receipt());const p=o.presentation();
 assert.equal(p.inventory,null);assert.ok(!JSON.stringify(p).includes('bag_only_secret'));
 assert.equal(p.self.equipment.mainHand.name,'minecraft:diamond_sword');
 const frame={...p,available:true,source:PAPER_OBSERVATION_MODE,self:{...p.self,uuid,entityId:8}};
 const held=selectNativeHeldItems(frame,uuid);assert.equal(held.hands.right.raw.name,'minecraft:diamond_sword');assert.equal(held.hands.left.raw,null);
 assert.throws(()=>selectNativeHeldItems({...frame,self:{...frame.self,equipment:{...frame.self.equipment,playerUuid:world}}},uuid),/BINDING/);o.close();
});
test('private inventory is exact and still obeys normal native HUD ownership',()=>{
 const o=observer();o.ingest(receipt());const p=o.presentation();assert.equal(p.inventory.slots.length,46);assert.match(p.inventory.slots[9].item.snbt,/bag_only_secret/);
 const frame={...p,available:true,source:PAPER_OBSERVATION_MODE,self:{...p.self,uuid,entityId:8}};
 assert.equal(nativePresentationView(frame,uuid).available,true);assert.equal(nativePresentationView(frame,world).available,false);o.close();
});
test('a passive Paper scene cannot substitute a different source mode, player or registry in the modern page',()=>{
 const session=createNativeSession(hash);session.receive({type:'identity',player:'ObservedAgent',playerUuid:uuid,entityId:8,minecraftVersion:'1.21.1',registrySha256:hash,mode:PAPER_OBSERVATION_MODE});
 const s={type:'snapshot',epoch:1,mode:PAPER_OBSERVATION_MODE,registrySha256:hash,selfPlayer:{uuid,name:'ObservedAgent'}};
 assert.equal(session.receive(s).kind,'snapshot');assert.throws(()=>session.receive({...s,mode:'numen_server_body'}),/MISMATCH/);
 const build={browserBundleSha256:'b'.repeat(64),consoleBundleSha256:'c'.repeat(64)};
 const status={schemaVersion:1,readOnly:true,mode:PAPER_OBSERVATION_MODE,identity:{confirmed:true,playerUuid:uuid},connection:{ended:false},viewer:{available:true,registrySha256:hash},build:{...build,viewerBuild:hash+':'+hash}};
 assert.equal(validatedSource(status,uuid,build).mode,PAPER_OBSERVATION_MODE);assert.throws(()=>validatedSource(status,world,build),/IDENTITY/);
});
test('a new world generation clears packet sequence and closed observations cannot resume',()=>{
 const o=observer(),r=receipt();r.packets=[{sequence:1,data:packet('animation')}];o.ingest(r);
 const next={...r,generation:'22222222-2222-3222-8222-222222222222'};assert.equal(o.ingest(next).changed,true);
 o.close();assert.equal(o.entity,null);assert.throws(()=>o.ingest(next),/CLOSED/);
});

test('actual biome hash, villager registries and oxygen are retained without exporting a raw world seed',()=>{
 const o=observer('scene'),events=[];o.events.on('packet',p=>events.push(p));const r=receipt();
 r.player.world.hashedSeed='-8429226360835412345';r.player.airSupply=150;r.player.maxAirSupply=300;
 r.player.renderRegistries={source:'server_builtin_registries',villagerTypes:[{id:2,name:'minecraft:plains'}],villagerProfessions:[{id:0,name:'minecraft:none'}]};
 o.ingest(r);assert.equal(events.find(p=>p.name==='respawn').params.worldState.hashedSeed,-8429226360835412345n);
 const p=o.presentation();assert.equal(p.self.oxygen,10);assert.deepEqual(p.renderRegistries,r.player.renderRegistries);assert.equal(p.self.spinAttack,false);
 assert.ok(!Object.hasOwn(r.player.world,'seed'));o.close();
});

test('20Hz poses retain fast hands/head; full inventory/HUD is sent only on changes',()=>{
 let now=100000,poses=0,presentations=0;
 const o=new PaperObservedPlayer({playerUuid:uuid,name:'ObservedAgent',registry:{},registrySha256:hash,decodePacket:bytes=>JSON.parse(bytes),now:()=>now});
 o.on('physicsTick',()=>poses++);o.events.on('presentation',()=>presentations++);
 for(let i=0;i<20;i++){
  const r=receipt();r.player.observedAt=now;r.player.bodyYaw=i*3;r.player.headYaw=i*4;
  r.player.attackAnim=i>=2&&i<7?(i-1)/6:0;r.player.sprinting=true;
  o.ingest(r);const p=o.presentation();
  assert.equal(p.self.handAnimation.sampledAt,now);assert.equal(o.entity.bodyYaw,Math.PI-i*3*Math.PI/180);
  now+=50;
 }
 assert.equal(poses,20);assert.equal(presentations,1);
 const changed=receipt();changed.player.observedAt=now;changed.player.inventory[9].item.count=2;
 o.ingest(changed);assert.equal(presentations,2);assert.equal(o.presentation().inventory.slots[9].item.count,2);
 changed.player.health=7;o.ingest(changed);assert.equal(presentations,3);
 changed.player.armor=12;o.ingest(changed);assert.equal(presentations,4);
 o.ingest(changed);assert.equal(presentations,4);o.close();
});

test('one observed attack keeps its action token across unrelated packets and advances only on a new swing',()=>{
 const o=observer(),r=receipt();r.player.observedAt=100000;r.player.attackAnim=.2;o.ingest(r);
 const first=o.handState().swing.sequence;
 const next=receipt();next.player.observedAt=100050;next.player.attackAnim=.4;next.packets=[{sequence:1,data:packet('animation')}];o.ingest(next);
 assert.equal(o.handState().swing.sequence,first);assert.equal(o.handState().swing.startedAt,99930);
 next.packets=[];next.player.attackAnim=0;o.ingest(next);assert.equal(o.handState().swing,null);
 next.player.attackAnim=.2;o.ingest(next);assert.equal(o.handState().swing.sequence,first+1);o.close();
});
