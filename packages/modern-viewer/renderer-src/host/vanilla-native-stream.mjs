import { EventEmitter } from 'node:events';
import { vanillaItemStack,configureVanillaItemRegistries } from './vanilla-item-stack.mjs';
import { observeVanillaHands } from './vanilla-hand-state.mjs';
import { observeVanillaMenus } from './vanilla-menu-state.mjs';
import { observeVanillaActivity, vanillaWireItem } from './vanilla-activity.mjs';

// A vanilla client starts with the synchronized registry's attribute default;
// the server sends changed values/modifiers. Never use this on a mod adapter or
// replace a malformed received attribute with a default.
export function vanillaAttributeValue(bot, leaf) {
  if(bot.version!=='1.21.1')return null;
  const key=`minecraft:generic.${leaf}`, definition=bot.registry?.attributes?.[key];
  if(!definition || ![definition.default,definition.min,definition.max].every(Number.isFinite))return null;
  const attributes=bot.entity?.attributes??{},received=attributes[key]??attributes[`generic.${leaf}`]??attributes[`minecraft:${leaf}`];
  if(!received)return definition.default;
  if(!Number.isFinite(received.value) || !Array.isArray(received.modifiers??[]) || (received.modifiers??[]).some(m=>!Number.isFinite(m?.amount)||![0,1,2].includes(m.operation)))return null;
  const mods=received.modifiers??[],base=mods.filter(m=>m.operation===0).reduce((v,m)=>v+m.amount,received.value);
  const added=mods.filter(m=>m.operation===1).reduce((v,m)=>v+base*m.amount,base);
  const value=mods.filter(m=>m.operation===2).reduce((v,m)=>v*(1+m.amount),added);
  return Number.isFinite(value)?Math.max(definition.min,Math.min(definition.max,value)):null;
}

const PACKETS = new Set(['login', 'respawn', 'map_chunk', 'unload_chunk', 'block_change', 'multi_block_change',
  'tile_entity_data', 'update_time', 'spawn_entity', 'entity_metadata', 'entity_equipment', 'entity_destroy',
  'rel_entity_move', 'entity_move_look', 'entity_look', 'entity_teleport', 'entity_head_rotation',
  'entity_velocity', 'entity_status', 'animation', 'hurt_animation','collect','entity_effect','remove_entity_effect','spawn_entity_experience_orb',
  'sound_effect','named_sound_effect','entity_sound_effect','stop_sound','world_particles']);

/** Vanilla-only: preserve actual decoded packets from the existing action connection.
 * A mod/proxy transport must supply its own native stream and registry instead. */
export function observeVanillaNativeStream(bot, registrySha256, version = '1.21.1') {
  if (version !== '1.21.1' || !/^[a-f0-9]{64}$/.test(registrySha256)) throw Error('VANILLA_STREAM_CONFIG_INVALID');
  const events = new EventEmitter();
  const hands = observeVanillaHands(bot);
  const menus = observeVanillaMenus(bot, { onChange: () => events.emit('presentation') });
  const activity = observeVanillaActivity(bot, { onChange: () => events.emit('presentation') });
  let sequence = 0, closed = false;
  const receive = (params, meta) => {
    if (closed || meta.state !== 'play' || !PACKETS.has(meta.name)) return;
    if (bot.version !== version) { events.emit('unavailable', Error('VANILLA_STREAM_VERSION_MISMATCH')); return; }
    events.emit('packet', { name: meta.name, params, sequence: ++sequence, registrySha256 });
  };
  bot._client.on('packet', receive);
  const resolveItemStack=wire=>{
    if(bot.version!==version)return {available:false,reason:'VANILLA_ITEM_REGISTRY_VERSION_MISMATCH'};
    const item=vanillaWireItem(wire,bot.registry);
    return item?.snbt?{available:true,source:'same_player_vanilla_item_registry',minecraftVersion:version,registryId:wire.itemId,item}
      :{available:false,reason:'VANILLA_ITEM_COMPONENTS_OR_REGISTRY_UNAVAILABLE'};
  };
  const resolveEffect=id=>{
    const name=bot.version===version?bot.registry?.effects?.[id]?.name:null;
    return typeof name==='string'?`minecraft:${name.replace(/[A-Z]/g,(c,i)=>(i?'_':'')+c.toLowerCase())}`:null;
  };
  return { events, resolveItemStack, resolveEffect, configureItemRegistries:data=>configureVanillaItemRegistries(bot.registry,data),
    handState: () => hands.snapshot(), menuState: () => menus.snapshot(), activityState: () => activity.snapshot(), close() { closed = true; hands.close(); menus.close(); activity.close(); bot._client.off('packet', receive); events.removeAllListeners(); } };
}

/** Vanilla inventory only. Mod/proxy connections must use their native adapter. */
export function vanillaPlayerPresentation(bot, hands = null, menuState = null) {
  const uuid = bot._client?.uuid;
  if (bot.version !== '1.21.1' || !uuid || !Array.isArray(bot.inventory?.slots)) return null;
  const componentFailures = [];
  const slots = bot.inventory.slots.map((item, slot) => {
    if (!item) return { slot, item: null };
    const serialized = vanillaItemStack(item, bot.registry);
    if (serialized.reason) componentFailures.push({ slot, reason: serialized.reason });
    return { slot, item: serialized.item };
  });
  const menu = menuState?.window;
  const nativeMenu = menu && menu === bot.currentWindow ? {
    playerUuid: uuid, windowId: menu.id, stateId: menuState.stateId, menuType: menu.type,
    title: typeof menu.title === 'string' ? menu.title.slice(0, 512) : null,
    slots: menu.slots.map((item, slot) => ({ slot, item: item ? vanillaItemStack(item, bot.registry).item : null })),
    carried: menu.selectedItem ? vanillaItemStack(menu.selectedItem, bot.registry).item : null,
    dataValues: menuState.dataValues, properties: menuState.properties, dataValuesSource: 'same_player_window_properties'
  } : null;
  return { schemaVersion: 1, playerUuid: uuid, profile:'vanilla_1.21.1', nativeMenu,
    effects:Object.values(bot.entity?.effects??{}).slice(0,32).flatMap(effect=>{
      const name=bot.registry?.effects?.[effect.id]?.name;
      return typeof name==='string'&&Number.isInteger(effect.amplifier)&&Number.isInteger(effect.duration)
        ?[{name:'minecraft:'+name.replace(/[A-Z]/g,(letter,index)=>(index?'_':'')+letter.toLowerCase()),amplifier:effect.amplifier,duration:effect.duration}]:[];
    }),
    bossBars:Array.from(bot.bossBars??[]).slice(0,8).map(bar=>({uuid:bar.entityUUID,title:String(bar.title??'').slice(0,200),health:bar.health,color:bar.color,dividers:bar.dividers})),
    ...(hands?.playerUuid === uuid.toLowerCase() ? { self: { playerUuid: uuid.toLowerCase(), mainArm: hands.mainArm,
      maxHealth: vanillaAttributeValue(bot,'max_health'), armor: vanillaAttributeValue(bot,'armor'),
      attributeSource: 'same_player_vanilla_registry_and_attribute_packets',
      usingItem: hands.usingItem, spinAttack: hands.spinAttack, crouching: hands.crouching, swinging: !!hands.swing,
      attackAnim: hands.swing ? Math.max(0, Math.min(1, (hands.sampledAt - hands.swing.startedAt) / (hands.swing.durationTicks * 50))) : 0,
      handAnimation: hands } } : {}),
    inventory: { playerUuid: uuid, windowId: 0, selectedHotbarSlot: bot.quickBarSlot,
      inventoryStart: 9, hotbarStart: 36, offhandSlot: 45, slots,
      carried: bot.inventory.selectedItem ? vanillaItemStack(bot.inventory.selectedItem, bot.registry).item : null },
    nativeState: { available: true, source: 'same_player_vanilla_inventory',
      componentsAvailable: componentFailures.length === 0, componentFailures } };
}
