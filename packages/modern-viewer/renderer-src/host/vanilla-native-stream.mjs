import { EventEmitter } from 'node:events';
import { vanillaItemStack } from './vanilla-item-stack.mjs';

const PACKETS = new Set(['login', 'respawn', 'map_chunk', 'unload_chunk', 'block_change', 'multi_block_change',
  'tile_entity_data', 'update_time', 'spawn_entity', 'entity_metadata', 'entity_equipment', 'entity_destroy',
  'rel_entity_move', 'entity_move_look', 'entity_look', 'entity_teleport', 'entity_head_rotation',
  'entity_velocity', 'entity_status', 'animation', 'hurt_animation']);

/** Vanilla-only: preserve actual decoded packets from the existing action connection.
 * A mod/proxy transport must supply its own native stream and registry instead. */
export function observeVanillaNativeStream(bot, registrySha256, version = '1.21.1') {
  if (version !== '1.21.1' || !/^[a-f0-9]{64}$/.test(registrySha256)) throw Error('VANILLA_STREAM_CONFIG_INVALID');
  const events = new EventEmitter();
  let sequence = 0, closed = false;
  const receive = (params, meta) => {
    if (closed || meta.state !== 'play' || !PACKETS.has(meta.name)) return;
    if (bot.version !== version) { events.emit('unavailable', Error('VANILLA_STREAM_VERSION_MISMATCH')); return; }
    events.emit('packet', { name: meta.name, params, sequence: ++sequence, registrySha256 });
  };
  bot._client.on('packet', receive);
  return { events, close() { closed = true; bot._client.off('packet', receive); events.removeAllListeners(); } };
}

/** Vanilla inventory only. Mod/proxy connections must use their native adapter. */
export function vanillaPlayerPresentation(bot) {
  const uuid = bot._client?.uuid;
  if (bot.version !== '1.21.1' || !uuid || !Array.isArray(bot.inventory?.slots)) return null;
  const componentFailures = [];
  const slots = bot.inventory.slots.map((item, slot) => {
    if (!item) return { slot, item: null };
    const serialized = vanillaItemStack(item, bot.registry);
    if (serialized.reason) componentFailures.push({ slot, reason: serialized.reason });
    return { slot, item: serialized.item };
  });
  return { schemaVersion: 1, playerUuid: uuid,
    inventory: { playerUuid: uuid, windowId: 0, selectedHotbarSlot: bot.quickBarSlot,
      hotbarStart: 36, offhandSlot: 45, slots },
    nativeState: { available: true, source: 'same_player_vanilla_inventory',
      componentsAvailable: componentFailures.length === 0, componentFailures } };
}
