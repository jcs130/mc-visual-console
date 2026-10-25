import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {publicSpectatorEvent,publicSpectatorStatus} from '../../host/spectator-public.mjs';
import {SpectatorFanout} from '../../host/spectator-fanout.mjs';
import {parseNativeItemStack,publicNativeItemStack} from '../../src/native-viewer/native-item-stack.js';
const uuid='11111111-1111-4111-8111-111111111111';
const secret='PRIVATE_BOOK_PASSWORD';
const item={name:'minecraft:written_book',count:1,snbt:`{id:"minecraft:written_book",count:1,components:{"minecraft:custom_model_data":120,"minecraft:written_book_content":{pages:["${secret}"]},"minecraft:custom_data":{token:"${secret}"}}}`};
const presentation={schemaVersion:1,playerUuid:uuid,available:true,self:{playerUuid:uuid,armor:17,health:23,equipment:{source:'paper_server_observation',playerUuid:uuid,entityId:2,mainHand:item}},inventory:{playerUuid:uuid,selectedHotbarSlot:2,slots:[{slot:38,item}]},nativeMenu:{title:secret},gameMessages:[{text:'/login '+secret},{text:'我们去试炼塔吧',seq:2,kind:'chat'}],agentPlayback:{secret}};
const snapshot={type:'snapshot',epoch:1,terrainSequence:1,groups:[],presentation};
test('public visual items retain exact typed appearance components but no book text or custom private contents',()=>{
 const projected=publicNativeItemStack(item),stack=parseNativeItemStack(projected);
 assert.equal(stack.components['minecraft:custom_model_data'],120);assert.ok(!JSON.stringify(projected).includes(secret));
 assert.ok(item.snbt.includes(secret),'source is immutable');
});

test('public custom items keep their visible names and typed model tags without clickable commands',()=>{
 const name=JSON.stringify({text:'大背包',color:'gold',clickEvent:{action:'run_command',value:'/login secret-test'}});
 const stack={name:'minecraft:player_head',count:1,snbt:`{id:"minecraft:player_head",count:1,components:{"minecraft:custom_name":${JSON.stringify(name)},"minecraft:damage":3,"minecraft:dyed_color":{rgb:16711680,show_in_tooltip:0b},"minecraft:enchantment_glint_override":1b}}`};
 const projected=publicNativeItemStack(stack),parsed=parseNativeItemStack(projected);
 assert.deepEqual(JSON.parse(parsed.components['minecraft:custom_name']),{text:'大背包',color:'gold'});
 assert.ok(projected.snbt.includes('0b'));assert.ok(projected.snbt.includes('1b'));assert.ok(!projected.snbt.includes('secret-test'));
});
test('every presentation path including a delta/status loses private state; unknown events are never public',()=>{
 for(const type of ['snapshot','snapshot_compact','frame','presentation']){
  const out=publicSpectatorEvent({...snapshot,type,private:secret});assert.equal(out.presentation.self.armor,17);assert.equal(out.presentation.inventory.slots[0].item.name,item.name);assert.equal(out.presentation.gameMessages[0].text,'我们去试炼塔吧');assert.ok(!JSON.stringify(out).includes(secret));
 }
 const delta=publicSpectatorEvent({type:'snapshot_delta',epoch:1,baseSequence:1,terrainSequence:2,set:{presentation,private:secret},drop:['private']});
 assert.equal(delta.set.presentation.inventory.selectedHotbarSlot,2);assert.deepEqual(delta.drop,[]);assert.ok(!JSON.stringify(delta).includes(secret));
 assert.ok(!JSON.stringify(publicSpectatorStatus({presentation,agent:{secret},password:secret})).includes(secret));
 for(const type of ['agent_visual','chat','command','future_event'])assert.equal(publicSpectatorEvent({type,secret}),null);
});
function response(){const res=new EventEmitter();res.values=[];res.writeHead=()=>{};res.flushHeaders=()=>{};res.write=b=>{res.values.push(JSON.parse(b.toString().slice(6)));return true;};res.destroy=()=>{res.destroyed=true;res.emit('close');};return res;}
test('one upstream gives owner HUD and safe guest live/replay bytes; scope revocation closes only that viewer',async t=>{
 let upstream,opened=0;const hub=new SpectatorFanout({playerUuid:uuid,projectPublic:publicSpectatorEvent,open:s=>{upstream=s;opened++;}});t.after(()=>hub.close());
 const owner=response(),guest=response(),late=response();hub.subscribe({id:1},owner);hub.subscribe({id:2},guest,{scope:'scene'});
 const send=v=>upstream.write(Buffer.from('data: '+JSON.stringify(v)+'\n\n'));
 send({type:'identity',playerUuid:uuid});send(snapshot);send({type:'agent_visual',epoch:1,secret});
 hub.subscribe({id:3},late,{scope:'scene'});assert.equal(opened,1);
 assert.ok(JSON.stringify(owner.values).includes(secret));assert.ok(!JSON.stringify(guest.values).includes(secret));assert.ok(!JSON.stringify(late.values).includes(secret));
 assert.equal(late.values[1].presentation.self.health,23);
 await hub.check(req=>({scope:req.id===1?'scene':'scene'}));assert.equal(owner.destroyed,true);assert.ok(!guest.destroyed);
});

test('late guest receives changed inventory before a thin movement frame, without replaying old inventory',t=>{
 let upstream;const hub=new SpectatorFanout({playerUuid:uuid,projectPublic:publicSpectatorEvent,open:s=>{upstream=s;}});t.after(()=>hub.close());
 hub.subscribe({},response());const send=value=>upstream.write(Buffer.from('data: '+JSON.stringify(value)+'\n\n'));
 send({type:'identity',playerUuid:uuid});send(snapshot);
 const changed=structuredClone(presentation);changed.inventory.selectedHotbarSlot=5;
 send({type:'presentation',epoch:1,presentation:changed});
 send({type:'frame',epoch:1,selfPlayer:{uuid,position:{x:1,y:64,z:2}}});
 const late=response();hub.subscribe({},late,{scope:'scene'});
 assert.equal(late.values.at(-2).presentation.inventory.selectedHotbarSlot,5);
 assert.equal(late.values.at(-1).type,'frame');assert.ok(!('presentation' in late.values.at(-1)));
});
