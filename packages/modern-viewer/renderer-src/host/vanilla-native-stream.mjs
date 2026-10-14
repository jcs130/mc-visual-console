import { EventEmitter } from 'node:events';
import { vanillaItemStack } from './vanilla-item-stack.mjs';
import { observeVanillaHands } from './vanilla-hand-state.mjs';
import { observeVanillaMenus } from './vanilla-menu-state.mjs';
import { observeVanillaActivity } from './vanilla-activity.mjs';

const PACKETS = new Set(['login', 'respawn', 'map_chunk', 'unload_chunk', 'block_change', 'multi_block_change',
  'tile_entity_data', 'update_time', 'spawn_entity', 'entity_metadata', 'entity_equipment', 'entity_destroy',
  'rel_entity_move', 'entity_move_look', 'entity_look', 'entity_teleport', 'entity_head_rotation',
  'entity_velocity', 'entity_status', 'animation', 'hurt_animation']);

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
  return { events, handState: () => hands.snapshot(), menuState: () => menus.snapshot(), activityState: () => activity.snapshot(), close() { closed = true; hands.close(); menus.close(); activity.close(); bot._client.off('packet', receive); events.removeAllListeners(); } };
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
    dataValues: menuState.dataValues, dataValuesSource: 'same_player_window_properties'
  } : null;
  return { schemaVersion: 1, playerUuid: uuid, nativeMenu,
    ...(hands?.playerUuid === uuid.toLowerCase() ? { self: { playerUuid: uuid.toLowerCase(), mainArm: hands.mainArm,
      usingItem: hands.usingItem, spinAttack: hands.spinAttack, crouching: hands.crouching, swinging: !!hands.swing,
      attackAnim: hands.swing ? Math.max(0, Math.min(1, (hands.sampledAt - hands.swing.startedAt) / (hands.swing.durationTicks * 50))) : 0,
      handAnimation: hands } } : {}),
    inventory: { playerUuid: uuid, windowId: 0, selectedHotbarSlot: bot.quickBarSlot,
      inventoryStart: 9, hotbarStart: 36, offhandSlot: 45, slots,
      carried: bot.inventory.selectedItem ? vanillaItemStack(bot.inventory.selectedItem, bot.registry).item : null },
    nativeState: { available: true, source: 'same_player_vanilla_inventory',
      componentsAvailable: componentFailures.length === 0, componentFailures } };
}
