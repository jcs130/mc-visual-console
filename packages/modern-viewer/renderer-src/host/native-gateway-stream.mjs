// The same player's ORIGINAL packets, captured before a compatibility gateway
// projects them. Never decode these IDs with Mineflayer's vanilla registry.
import {EventEmitter} from 'node:events';
import {deserialize} from 'node:v8';
import {inflateRawSync} from 'node:zlib';
import {componentValue} from './vanilla-item-stack.mjs';
import {nativeStaticItemEvidence} from '../src/native-viewer/native-static-item-providers.js';
import {nativeRegistryComponent} from './native-registry-components.mjs';
import {twilightComponentSnbt,knownTwilightComponent} from './native-twilight-components.mjs';

export const NATIVE_GATEWAY_CHANNEL='mcviewer:native_packet';
export const NATIVE_GATEWAY_NAMES=new Set(['native_registries','login','respawn','map_chunk','unload_chunk','block_change','multi_block_change',
  'tile_entity_data','update_light','spawn_entity','entity_metadata','entity_equipment','entity_destroy','rel_entity_move',
  'entity_move_look','entity_look','entity_teleport','entity_head_rotation','entity_velocity','entity_status','animation',
  'hurt_animation','maid_animation','twilight_multipart','world_particles','window_items','set_slot','trade_list','open_window','close_window','craft_progress_bar',
  'update_time','game_state_change','held_item_slot','abilities','update_health','entity_update_attributes','entity_effect',
  'remove_entity_effect','collect','sound_effect','named_sound_effect','entity_sound_effect','stop_sound']);
const RESOURCE=/^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const MENU_DATA_COUNTS=new Map([['farmersdelight:cooking_pot',2],['minecraft:furnace',4],['minecraft:blast_furnace',4],['minecraft:smoker',4]]);
const copy=value=>structuredClone(value);
export function decodeGatewayPacket(wire,hash){
  if(!Buffer.isBuffer(wire)||wire.length<5||wire.length>1048576||wire.subarray(0,4).toString()!=='MCNP')throw Error('NATIVE_GATEWAY_WIRE_INVALID');
  const p=deserialize(inflateRawSync(wire.subarray(4),{maxOutputLength:16*1048576}));
  if(p?.schemaVersion!==1||p.minecraftVersion!=='1.21.1'||p.registrySha256!==hash||!Number.isSafeInteger(p.sequence)||p.sequence<1||
    !NATIVE_GATEWAY_NAMES.has(p.name)||!p.params||typeof p.params!=='object')throw Error('NATIVE_GATEWAY_REGISTRY_OR_SCHEMA_MISMATCH');
  return p;
}
export function loadGatewayItemRegistry(text){
  const items=new Map(),names=new Set();
  for(const line of text.trim().split('\n')){
    const [name,number,extra]=line.trim().split('\t'),id=Number(number);
    if(extra!==undefined||!RESOURCE.test(name)||!/^\d+$/.test(number)||!Number.isSafeInteger(id)||id>1048575||items.has(id)||names.has(name))throw Error('NATIVE_GATEWAY_ITEM_REGISTRY_INVALID');
    items.set(id,name);names.add(name);
  }
  return items;
}
export function nativeGatewayItem(wire,items,vanillaRegistry,registries,{twilightComponents=false,depth=0,budget={items:0}}={}){
  if(depth>8||++budget.items>128)return {available:false,reason:'NATIVE_ITEM_RECURSION_LIMIT'};
  if(wire?.itemCount===0)return {available:true,item:null};
  const name=items.get(wire?.itemId),count=wire?.itemCount;
  if(!name||!Number.isInteger(count)||count<1||count>2147483647)return {available:false,reason:'NATIVE_ITEM_ID_OR_COUNT_INVALID'};
  const evidence=nativeStaticItemEvidence(name),base={name,count,nativeId:wire.itemId};
  if(evidence){const prefix=evidence.itemClass==='net.minecraft.world.item.BlockItem'?'block.':'item.';base.descriptionId=prefix+name.replace(':','.');}
  else if(/^touhou_little_maid:smart_slab_(init|has_maid)$/.test(name))base.descriptionId='item.'+name.replace(':','.');
  else if(twilightComponents&&['twilightforest:greater_potion_flask','twilightforest:brittle_potion_flask','twilightforest:ore_meter',
    ...['goggles','vest','wings','boots','gloves','belt'].map(s=>'twilightforest:travellers_'+s)].includes(name))base.descriptionId='item.'+name.replace(':','.');
  else if(twilightComponents&&name==='twilightforest:mason_jar')base.descriptionId='block.twilightforest.mason_jar';
  try{
    if(!Array.isArray(wire.components)||!Array.isArray(wire.removeComponents)||wire.components.length+wire.removeComponents.length>128)throw Error('NATIVE_ITEM_COMPONENTS_NOT_OBSERVED');
    const patch=new Map(),resolved={};
    for(const row of wire.components){
      if(row?.type==='touhou_little_maid:init_maid_owner'&&name==='touhou_little_maid:smart_slab_init'){
        if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(row.data)||patch.has(row.type))throw Error('NATIVE_MAID_OWNER_COMPONENT_INVALID');
        const bytes=Buffer.from(row.data.replaceAll('-',''),'hex');patch.set(row.type,'[I;'+[0,4,8,12].map(i=>bytes.readInt32BE(i)).join(',')+']');continue;
      }
      if(row?.type==='touhou_little_maid:maid_info'&&name==='touhou_little_maid:smart_slab_has_maid'){
        if(row.data?.type!=='compound'||patch.has(row.type))throw Error('NATIVE_MAID_INFO_COMPONENT_INVALID');
        // The pinned TLM item uses vanilla CustomData.STREAM_CODEC. Preserve
        // the entire typed compound, including her UUID, owner and inventory.
        patch.set(row.type,componentValue('custom_data',row.data,vanillaRegistry));continue;
      }
      if(twilightComponents&&knownTwilightComponent(row?.type)){
        if(patch.has(row.type))throw Error('NATIVE_ITEM_COMPONENT_PATCH_INVALID');
        patch.set(row.type,twilightComponentSnbt(row.type,row.data,{registries,vanillaRegistry,
          resolveItem:child=>nativeGatewayItem(child,items,vanillaRegistry,registries,{twilightComponents,depth:depth+1,budget})}));continue;
      }
      if(typeof row?.type!=='string'||row.type.includes(':'))throw Error('NATIVE_ITEM_COMPONENT_CODEC_UNAVAILABLE:'+String(row?.type).slice(0,80));
      const key='minecraft:'+row.type;if(!RESOURCE.test(key)||patch.has(key))throw Error('NATIVE_ITEM_COMPONENT_PATCH_INVALID');
      if(row.type==='container'){
        // 1.21.1 ItemContainerContents STREAM_CODEC is an indexed Slot list;
        // its persistent codec omits empty cells and retains their slot index.
        // Resolve recursive stacks through THIS connection's native registry.
        if(!row.data||Object.keys(row.data).join(',')!=='contents'||!Array.isArray(row.data.contents)||row.data.contents.length>256)throw Error('NATIVE_CONTAINER_COMPONENT_INVALID');
        const contents=[];
        for(let slot=0;slot<row.data.contents.length;slot++){
          const child=nativeGatewayItem(row.data.contents[slot],items,vanillaRegistry,registries,{twilightComponents,depth:depth+1,budget});
          if(!child.available)throw Error(child.reason||'NATIVE_CONTAINER_CHILD_UNAVAILABLE');
          if(child.item)contents.push('{slot:'+slot+',item:'+child.item.snbt+'}');
        }
        patch.set(key,'['+contents.join(',')+']');continue;
      }
      const native=nativeRegistryComponent(row.type,row.data,registries);
      if(native){patch.set(key,native.snbt);resolved[row.type]=native.summary;continue;}
      patch.set(key,componentValue(row.type,row.data,vanillaRegistry));
    }
    for(const row of wire.removeComponents){
      if(twilightComponents&&knownTwilightComponent(typeof row==='string'?row:row?.type)){
        const type=typeof row==='string'?row:row.type;if(patch.has(type)||patch.has('!'+type))throw Error('NATIVE_ITEM_COMPONENT_PATCH_INVALID');
        patch.set('!'+type,'{}');continue;
      }
      const type=typeof row==='string'?row:row?.type,key='minecraft:'+type;
      if(typeof type!=='string'||type.includes(':')||!RESOURCE.test(key)||patch.has(key)||patch.has('!'+key))throw Error('NATIVE_ITEM_COMPONENT_PATCH_INVALID');
      patch.set('!'+key,'{}');
    }
    const components=[...patch].map(([key,value])=>JSON.stringify(key)+':'+value).join(',');
    const snbt=`{id:${JSON.stringify(name)},count:${count}${components?',components:{'+components+'}':''}}`;
    if(Buffer.byteLength(snbt)>65536)throw Error('NATIVE_ITEM_STACK_TOO_LARGE');
    return {available:true,item:{...base,snbt,...(Object.keys(resolved).length?{resolvedComponents:resolved}:{})}};
  }catch(error){return {available:false,item:base,reason:error.message};}
}
export function observeNativeGateway(bot,{registrySha256,items,now=Date.now,nativeMenuLayouts=new Map(),simplifyNBT,twilightComponents=false,blockRegistry=null}){
  if(!/^[a-f0-9]{64}$/.test(registrySha256)||!(items instanceof Map))throw Error('NATIVE_GATEWAY_CONFIG_INVALID');
  const events=new EventEmitter(),registries=new Map();let sequence=0,error=null,closed=false,disposed=false,inventory=null,menu=null,observedAt=null,inventoryFresh=false;
  if(blockRegistry instanceof Map)registries.set('minecraft:block',new Map(blockRegistry));
  const resolveItemStack=wire=>nativeGatewayItem(wire,items,bot.registry,registries,{twilightComponents});
  const reset=()=>{inventory=null;menu=null;observedAt=null;inventoryFresh=false;};
  const inventorySlot=slot=>!Number.isInteger(slot)||slot<0?null:slot<9?slot+36:slot<36?slot:slot<40?44-slot:slot===40?45:null;
  const syncPlayerSlots=()=>{
    const w=bot.currentWindow,nativeType=registries.get('minecraft:menu')?.get(menu?.nativeMenuType);
    const nativeLayout=nativeMenuLayouts.get(nativeType);
    if(!inventory||!menu?.items||!w||w.id!==menu.windowId)return;
    const start=nativeLayout&&w.type===nativeLayout.proxyType&&menu.items.length===nativeLayout.slots?nativeLayout.inventoryStart:
      w.type===nativeType&&nativeType?.startsWith('minecraft:')?w.inventoryStart:null;
    if(!Number.isInteger(start)||start+36!==menu.items.length||w.slots.length!==menu.items.length)return;
    for(let i=0;i<36;i++)inventory.items[i+9]=copy(menu.items[start+i]);
    inventory.observedAt=now();inventoryFresh=true;
  };
  const receive=packet=>{
    if(packet.channel!==NATIVE_GATEWAY_CHANNEL||closed||error)return;
    try{
      const body=decodeGatewayPacket(packet.data,registrySha256);
      if(body.sequence!==sequence+1)throw Error('NATIVE_GATEWAY_SEQUENCE_GAP');sequence=body.sequence;
      const p=body.params;
      if(body.name==='native_registries'){
        if(p.source!=='same_connection_neoforge_frozen_registry'||!p.registries||Object.keys(p.registries).length>16)throw Error('NATIVE_GATEWAY_REGISTRY_INVALID');
        for(const [name,rows] of Object.entries(p.registries)){
          if(!RESOURCE.test(name)||!Array.isArray(rows)||rows.length>8192)throw Error('NATIVE_GATEWAY_REGISTRY_INVALID');
          const values=new Map(),names=new Set();for(const row of rows){if(!Number.isInteger(row?.id)||row.id<0||row.id>65535||!RESOURCE.test(row.name)||values.has(row.id)||names.has(row.name))throw Error('NATIVE_GATEWAY_REGISTRY_INVALID');values.set(row.id,row.name);names.add(row.name);}registries.set(name,values);
        }
      }
      if(['login','respawn'].includes(body.name))reset();
      if(body.name==='window_items'){
        if(!Number.isInteger(p.windowId)||!Array.isArray(p.items)||p.items.length>1024)throw Error('NATIVE_GATEWAY_WINDOW_INVALID');
        const state={windowId:p.windowId,stateId:p.stateId,items:copy(p.items),carried:copy(p.carriedItem),observedAt:now()};
        if(p.windowId===0){inventory=state;inventoryFresh=true;}else{menu={...menu,...state};syncPlayerSlots();}observedAt=now();
      }
      if(body.name==='open_window'){menu={windowId:p.windowId,nativeMenuType:p.inventoryType,menuType:registries.get('minecraft:menu')?.get(p.inventoryType)??null,
        title:copy(p.windowTitle),titleComponent:p.windowTitle&&simplifyNBT?copy(simplifyNBT(p.windowTitle)):null,items:null,stateId:null,properties:new Map()};inventoryFresh=false;}
      if(body.name==='craft_progress_bar'&&menu?.windowId===p.windowId){
        if(!Number.isInteger(p.property)||p.property<0||p.property>=32||!Number.isInteger(p.value)||p.value < -2147483648||p.value>2147483647)throw Error('NATIVE_GATEWAY_MENU_PROPERTY_INVALID');
        menu.properties??=new Map();menu.properties.set(p.property,p.value);observedAt=now();
      }
      if(body.name==='close_window'&&menu?.windowId===p.windowId)menu=null;
      if(body.name==='set_slot'){
        const target=p.windowId===0||p.windowId===-2?inventory:menu?.windowId===p.windowId?menu:null;
        const slot=p.windowId===-2?inventorySlot(p.slot):p.slot;
        if(target?.items&&Number.isInteger(slot)&&slot>=0&&slot<target.items.length){target.items[slot]=copy(p.item);target.stateId=p.stateId;target.observedAt=now();observedAt=now();if(target===menu)syncPlayerSlots();}
        else if(p.windowId===-1&&p.slot===-1){if(menu)menu.carried=copy(p.item);else if(inventory)inventory.carried=copy(p.item);}
      }
      events.emit('packet',body);events.emit('presentation');
    }catch(e){error=e.message;reset();events.emit('unavailable',e);}
  };
  const onEnd=()=>{closed=true;reset();events.emit('unavailable',Error('NATIVE_GATEWAY_CONNECTION_CLOSED'));};
  bot._client.on('custom_payload',receive);bot.on('end',onEnd);
  const serialize=state=>{
    if(!state||!Array.isArray(state.items))return null;
    const count=MENU_DATA_COUNTS.get(state.menuType),properties=state.properties??new Map();
    const dataValues=count&&Array.from({length:count},(_,i)=>i).every(i=>properties.has(i))?Array.from({length:count},(_,i)=>properties.get(i)):null;
    return {windowId:state.windowId,stateId:state.stateId,observedAt:state.observedAt,
      ...(state.windowId!==0?{nativeMenuType:state.nativeMenuType,menuType:state.menuType??null,title:state.title??null,titleComponent:state.titleComponent??null}:{}),
      slots:state.items.map((wire,slot)=>({slot,...resolveItemStack(wire),...(state.menuType==='twilightforest:uncrafting'?{
        role:slot===0?'input':slot===1?'result':slot<11?'uncrafting_preview':slot<20?'assembly':'player_inventory',
        ...(slot>=2&&slot<11?{note:'Recipe preview; not yet acquired. Server validates pickup and experience cost.'}:{})}:{} )})),carried:state.carried?resolveItemStack(state.carried):null,
      ...(state.windowId!==0?{dataValues,properties:[...properties].sort(([a],[b])=>a-b).map(([id,value])=>({id,value}))}:{})};
  };
  return {events,resolveItemStack,
    health:()=>({available:!closed&&!error&&sequence>0,closed,error,packets:sequence,registrySha256,
      registryCounts:Object.fromEntries([...registries].map(([key,value])=>[key,value.size]))}),
    inventory:()=>({available:!closed&&!error&&(inventoryFresh||Array.isArray(menu?.items)),playerUuid:bot._client.uuid??null,observedAt,
      playerInventoryFresh:inventoryFresh,inventory:inventoryFresh?serialize(inventory):null,menu:serialize(menu),
      ...(inventory&&!inventoryFresh?{lastObservedInventory:serialize(inventory),inventoryReason:'PLAYER_INVENTORY_LAYOUT_NOT_CONFIRMED'}:{})}),
    presentation:()=>{
      const uuid=bot._client.uuid;if(!uuid||closed||error)return null;
      const inv=serialize(inventory),current=serialize(menu),failures=[];
      const slots=value=>value?.slots.map(row=>{if(!row.available)failures.push({slot:row.slot,reason:row.reason});return {slot:row.slot,item:row.item??null,...(!row.available?{available:false,reason:row.reason}:{})};});
      return {schemaVersion:1,playerUuid:uuid,profile:'native_gateway_1.21.1',
        self:{playerUuid:uuid,...(['left','right'].includes(bot.settings?.mainHand)?{mainArm:bot.settings.mainHand}:{}),
          ...(typeof bot.usingHeldItem==='boolean'?{usingItem:bot.usingHeldItem}:{})},
        inventory:inventoryFresh&&inv?{playerUuid:uuid,windowId:0,slots:slots(inv),hotbarStart:36,inventoryStart:9,offhandSlot:45,selectedHotbarSlot:bot.quickBarSlot}:null,
        nativeMenu:current&&{playerUuid:uuid,windowId:current.windowId,stateId:current.stateId,menuType:typeof menu.menuType==='string'?menu.menuType:null,
          nativeMenuTypeId:menu.nativeMenuType,title:null,titleComponent:current.titleComponent,slots:slots(current),dataValues:current.dataValues,properties:current.properties,carried:current.carried?.available?current.carried.item:null},
        nativeState:{available:true,source:'same_connection_original_before_projection',itemComponentFailures:failures,observedAt},
        skills:null,entityRenderStates:[],contraptionRenderStates:[]};
    },
    close(){if(disposed)return;disposed=true;closed=true;reset();bot._client.off('custom_payload',receive);bot.off('end',onEnd);events.removeAllListeners();}
  };
}
