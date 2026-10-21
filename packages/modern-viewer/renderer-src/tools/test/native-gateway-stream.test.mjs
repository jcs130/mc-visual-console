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
