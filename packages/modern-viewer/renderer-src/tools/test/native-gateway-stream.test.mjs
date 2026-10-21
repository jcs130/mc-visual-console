import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {serialize} from 'node:v8';
import {deflateRawSync} from 'node:zlib';
import {decodeGatewayPacket,loadGatewayItemRegistry,nativeGatewayItem,observeNativeGateway,NATIVE_GATEWAY_CHANNEL} from '../../host/native-gateway-stream.mjs';
import {nativeVisible} from '../../host/native-mineflayer.mjs';
const hash='c'.repeat(64),items=loadGatewayItemRegistry('minecraft:air\t0\ncreate:andesite_casing\t2401\nfarmersdelight:rice\t1002\n');
const frame=(name,params,sequence=1,registrySha256=hash)=>Buffer.concat([Buffer.from('MCNP'),deflateRawSync(serialize({schemaVersion:1,minecraftVersion:'1.21.1',registrySha256,sequence,name,params}))]);
const item=(id,count)=>({itemId:id,itemCount:count,components:[],removeComponents:[]});
const bot=uuid=>{const b=new EventEmitter();b._client=new EventEmitter();b._client.uuid=uuid;b.registry={};b.quickBarSlot=0;return b;};
test('native frame retains buffers and rejects an unrelated registry or invalid framing',()=>{
 const bytes=frame('map_chunk',{chunkData:Buffer.from([1,2,3])});assert(Buffer.isBuffer(decodeGatewayPacket(bytes,hash).params.chunkData));
 assert.throws(()=>decodeGatewayPacket(bytes,'d'.repeat(64)),/REGISTRY_OR_SCHEMA/);assert.throws(()=>decodeGatewayPacket(Buffer.from('fake'),hash),/WIRE_INVALID/);
});
test('native item identities and name components never use vanilla proxy IDs',()=>{
 const wire=item(2401,3);wire.components=[{type:'custom_name',data:{type:'string',value:'大背包'}}];
 const result=nativeGatewayItem(wire,items,{});assert(result.available);assert.equal(result.item.name,'create:andesite_casing');assert.match(result.item.snbt,/大背包/);
 assert.equal(nativeGatewayItem(item(200000,1),items,{}).available,false);
});
test('unsupported mod component retains identity and reports missing rendering codec',()=>{
 const wire=item(2401,1);wire.components=[{type:'irons_spellbooks:spell_container',data:{}}];
 const result=nativeGatewayItem(wire,items,{});assert.equal(result.available,false);assert.equal(result.item.name,'create:andesite_casing');assert(!result.item.snbt);assert.match(result.reason,/CODEC_UNAVAILABLE/);
});

test('native enchantments, stored books and potions use original connection tables, with no vanilla fallback',()=>{
 const tables=new Map([
  ['minecraft:enchantment',new Map([[0,'mod:magic_edge'],[1,'minecraft:sharpness']])],
  ['minecraft:potion',new Map([[3,'minecraft:healing']])],
  ['minecraft:mob_effect',new Map([[2,'farmersdelight:comfort']])]
 ]);
 const fakeVanilla={enchantments:{0:{name:'aqua_affinity'}}};
 for(const [type,tooltip] of [['enchantments','showTooltip'],['stored_enchantments','showInTooltip']]){
  const wire=item(2401,1);wire.components=[{type,data:{enchantments:[{id:0,level:3},{id:1,level:2}],[tooltip]:true}}];
  const before=structuredClone(wire),result=nativeGatewayItem(wire,items,fakeVanilla,tables);
  assert(result.available);assert.match(result.item.snbt,/"mod:magic_edge":3/);assert.match(result.item.snbt,/"minecraft:sharpness":2/);
  assert(!result.item.snbt.includes('aqua_affinity'));assert.deepEqual(wire,before);
  assert.deepEqual(result.item.resolvedComponents[type],[{id:'mod:magic_edge',level:3},{id:'minecraft:sharpness',level:2}]);
  assert.equal(nativeGatewayItem(wire,items,fakeVanilla).available,false);
 }
 const wire=item(2401,1);wire.components=[{type:'potion_contents',data:{potionId:3,customColor:0x123456,customEffects:[{id:2,details:{amplifier:1,duration:400,ambient:false,showParticles:true,showIcon:true,hiddenEffect:null}}]}}];
 const result=nativeGatewayItem(wire,items,fakeVanilla,tables);assert(result.available);
 assert.match(result.item.snbt,/potion:"minecraft:healing"/);assert.match(result.item.snbt,/id:"farmersdelight:comfort"/);
 assert.equal(result.item.resolvedComponents.potion_contents.effects[0].id,'farmersdelight:comfort');
});

test('completed tables arrive before login and remain account-local across respawn',()=>{
 const body=bot('a'),other=bot('b'),stream=observeNativeGateway(body,{registrySha256:hash,items}),second=observeNativeGateway(other,{registrySha256:hash,items});let sequence=0;
 const send=(name,params)=>body._client.emit('custom_payload',{channel:NATIVE_GATEWAY_CHANNEL,data:frame(name,params,++sequence)});
 send('native_registries',{source:'same_connection_neoforge_frozen_registry',registries:{'minecraft:enchantment':[{id:0,name:'mod:edge'}]}});
 const wire=item(2401,1);wire.components=[{type:'stored_enchantments',data:{enchantments:[{id:0,level:2}],showInTooltip:false}}];
 send('login',{entityId:1});send('window_items',{windowId:0,stateId:1,items:[wire]});
 assert.match(stream.inventory().inventory.slots[0].item.snbt,/mod:edge/);
 assert.equal(second.resolveItemStack(wire).available,false);
 send('respawn',{});assert.equal(stream.inventory().available,false);assert(stream.resolveItemStack(wire).available);
 stream.close();second.close();
});
test('maid owner UUID preserves the original typed int-array component and other custom codecs remain explicit',()=>{
 const registry=loadGatewayItemRegistry('touhou_little_maid:smart_slab_init\t9\n');
 const wire=item(9,1);wire.components=[{type:'touhou_little_maid:init_maid_owner',data:'174bd1e7-fad4-3319-91e6-d495fc2ac20b'}];
 const result=nativeGatewayItem(wire,registry,{});assert(result.available);
 assert.match(result.item.snbt,/"touhou_little_maid:init_maid_owner":\[I;390844903,-86756583,-1847143275,-64306677\]/);
 wire.components[0].data='unknown';assert.equal(nativeGatewayItem(wire,registry,{}).available,false);
});
test('private inventory, slot updates, disconnect and ordered packets belong to one connection',()=>{
 const left=bot('a'),right=bot('b'),a=observeNativeGateway(left,{registrySha256:hash,items}),b=observeNativeGateway(right,{registrySha256:hash,items});
 left._client.emit('custom_payload',{channel:NATIVE_GATEWAY_CHANNEL,data:frame('window_items',{windowId:0,stateId:1,items:[item(1002,4)],carriedItem:{itemCount:0}})});
 assert.equal(a.inventory().inventory.slots[0].item.name,'farmersdelight:rice');assert.equal(b.inventory().available,false);
 left._client.emit('custom_payload',{channel:NATIVE_GATEWAY_CHANNEL,data:frame('set_slot',{windowId:0,stateId:2,slot:0,item:item(2401,2)},2)});
 assert.equal(a.inventory().inventory.slots[0].item.count,2);assert.equal(a.inventory().inventory.stateId,2);
 left._client.emit('custom_payload',{channel:NATIVE_GATEWAY_CHANNEL,data:frame('update_time',{},4)});
 assert.match(a.health().error,/SEQUENCE_GAP/);assert.equal(a.inventory().available,false);
 a.close();right.emit('end');b.close();assert.equal(right._client.listenerCount('custom_payload'),0);
});
test('registry rejects duplicate IDs and names',()=>{
 assert.throws(()=>loadGatewayItemRegistry('a:x\t1\na:y\t1'),/REGISTRY_INVALID/);
 assert.throws(()=>loadGatewayItemRegistry('a:x\t1\na:x\t2'),/REGISTRY_INVALID/);
});
test('native menu IDs and negative player-inventory slots keep their exact layouts',()=>{
 const body=bot('a'),stream=observeNativeGateway(body,{registrySha256:hash,items});let sequence=0;
 const send=(name,params)=>body._client.emit('custom_payload',{channel:NATIVE_GATEWAY_CHANNEL,data:frame(name,params,++sequence)});
 send('native_registries',{source:'same_connection_neoforge_frozen_registry',registries:{'minecraft:menu':[{id:500,name:'minecraft:generic_9x1'},{id:501,name:'custom:workbench'}]}});
 send('window_items',{windowId:0,stateId:1,items:Array.from({length:46},()=>({itemCount:0})),carriedItem:{itemCount:0}});
 send('set_slot',{windowId:-2,stateId:2,slot:0,item:item(1002,4)});
 assert.equal(stream.inventory().inventory.slots[36].item.name,'farmersdelight:rice');
 send('open_window',{windowId:2,inventoryType:500});
 body.currentWindow={id:2,type:'minecraft:generic_9x1',inventoryStart:9,slots:Array(45)};
 const contents=Array.from({length:45},()=>({itemCount:0}));contents[36]=item(2401,3);
 send('window_items',{windowId:2,stateId:3,items:contents,carriedItem:{itemCount:0}});
 assert.equal(stream.presentation().nativeMenu.menuType,'minecraft:generic_9x1');
 assert.equal(stream.inventory().inventory.slots[36].item.name,'create:andesite_casing');
 send('open_window',{windowId:3,inventoryType:501});body.currentWindow=null;
 send('window_items',{windowId:3,stateId:4,items:[item(1002,1)],carriedItem:{itemCount:0}});
 assert.equal(stream.inventory().inventory,null);assert.equal(stream.inventory().playerInventoryFresh,false);
 assert.equal(stream.inventory().menu.slots[0].item.name,'farmersdelight:rice');stream.close();
});
test('native visibility refuses occluded and unloaded cells',()=>{
 const air={canOcclude:false,occlusionBoxes:[]},solid={canOcclude:true,occlusionBoxes:[[0,0,0,1,1,1]]};
 const world={states:new Map([[0,air],[1,solid]]),stateIdAt:p=>p.x===1?1:0};
 assert.equal(nativeVisible(world,{x:.5,y:1.5,z:.5},{x:3.5,y:1.5,z:.5}),false);
 world.stateIdAt=()=>0;assert.equal(nativeVisible(world,{x:.5,y:1.5,z:.5},{x:3.5,y:1.5,z:.5}),true);
 world.stateIdAt=()=>null;assert.equal(nativeVisible(world,{x:.5,y:1.5,z:.5},{x:3.5,y:1.5,z:.5}),false);
});

test('locked cooking-pot proxy preserves the real native 45-slot layout and two observed progress fields',()=>{
 const body=bot('a'),stream=observeNativeGateway(body,{registrySha256:hash,items,
  nativeMenuLayouts:new Map([['farmersdelight:cooking_pot',{proxyType:'minecraft:generic_9x1',slots:45,inventoryStart:9}]]),
  simplifyNBT:tag=>tag.value});let sequence=0;
 const send=(name,params)=>body._client.emit('custom_payload',{channel:NATIVE_GATEWAY_CHANNEL,data:frame(name,params,++sequence)});
 send('native_registries',{source:'same_connection_neoforge_frozen_registry',registries:{'minecraft:menu':[{id:91,name:'farmersdelight:cooking_pot'}]}});
 send('window_items',{windowId:0,stateId:1,items:Array.from({length:46},()=>({itemCount:0}))});
 send('open_window',{windowId:4,inventoryType:91,windowTitle:{type:'string',value:'我的烹饪锅'}});
 body.currentWindow={id:4,type:'minecraft:generic_9x1',inventoryStart:9,slots:Array(45)};
 const rows=Array.from({length:45},()=>({itemCount:0}));rows[0]=item(1002,2);rows[36]=item(2401,3);
 send('window_items',{windowId:4,stateId:2,items:rows});
 assert.equal(stream.presentation().nativeMenu.menuType,'farmersdelight:cooking_pot');assert.equal(stream.presentation().nativeMenu.titleComponent,'我的烹饪锅');
 assert.equal(stream.inventory().inventory.slots[36].item.name,'create:andesite_casing');
 assert.equal(stream.presentation().nativeMenu.dataValues,null);
 send('craft_progress_bar',{windowId:4,property:0,value:40});assert.equal(stream.presentation().nativeMenu.dataValues,null);
 send('craft_progress_bar',{windowId:99,property:1,value:999});assert.equal(stream.presentation().nativeMenu.dataValues,null);
 send('craft_progress_bar',{windowId:4,property:1,value:200});assert.deepEqual(stream.presentation().nativeMenu.dataValues,[40,200]);
 send('close_window',{windowId:4});assert.equal(stream.presentation().nativeMenu,null);
 send('open_window',{windowId:4,inventoryType:91});send('window_items',{windowId:4,stateId:3,items:rows});
 assert.equal(stream.presentation().nativeMenu.dataValues,null);stream.close();
});
