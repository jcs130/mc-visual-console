import { EventEmitter } from 'node:events';
import { prepareNativeWorldPreviewHost } from '../tools/native-world-preview-host.mjs';
import { vanillaWireItem } from './vanilla-activity.mjs';
import { paperObservedLocomotion } from './paper-observed-motion.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const PAPER_OBSERVATION_MODE = 'paper_server_observation';
const PLAY = new Set(['map_chunk', 'unload_chunk', 'block_change', 'multi_block_change', 'tile_entity_data',
  'spawn_entity', 'spawn_entity_experience_orb', 'entity_metadata', 'entity_equipment', 'entity_destroy',
  'entity_teleport', 'entity_head_rotation', 'entity_velocity', 'entity_update_attributes', 'entity_status',
  'animation', 'hurt_animation', 'collect', 'entity_effect', 'remove_entity_effect', 'world_particles',
  'sound_effect', 'named_sound_effect', 'entity_sound_effect', 'stop_sound']);
const point = value => value && ['x', 'y', 'z'].every(k => Number.isFinite(value[k]));

/** An observation facade, NOT a Mineflayer client. All pose and packet input
 * comes from the authenticated Paper source. It has no socket/login/actions.
 * The existing renderer's attachment contract uses the legacy argument "bot". */
export class PaperObservedPlayer extends EventEmitter {
  constructor({ playerUuid, name, registry, registrySha256, decodePacket, scope = 'owner', now = Date.now }) {
    super();
    if (!UUID.test(playerUuid ?? '') || !/^\.?[A-Za-z0-9_]{1,16}$/.test(name ?? '') || !registry
      || !/^[a-f0-9]{64}$/.test(registrySha256 ?? '') || typeof decodePacket !== 'function' || !['owner','scene'].includes(scope)) throw Error('PAPER_OBSERVATION_CONFIGURATION');
    this.uuid = playerUuid.toLowerCase(); this.username = name; this.version = '1.21.1'; this.registry = registry;
    this.decodePacket = decodePacket; this.registrySha256 = registrySha256; this.scope = scope; this.now = now;
    this._client = new EventEmitter(); this._client.uuid = this.uuid; this._client.username = name;
    this._client.state = 'observation'; this._client.write = () => { throw Error('PAPER_OBSERVATION_READ_ONLY'); };
    this.players = {}; this.entities = {}; this.game = {}; this.settings = {}; this.entity = null;
    this.events = new EventEmitter(); this.generation = null; this.wireSequence = 0; this.sequence = 0; this.closed = false;
    this.inventorySignature=null;this.inventoryRows=null;this.lastPresentationAt=-Infinity;
    this.swingSequence=0;this.attackProgress=0;this.swing=null;
    this.resolveItemStack = wire => { const item = vanillaWireItem(wire, registry); return item?.snbt ? { available: true, item } : { available: false, reason: 'PAPER_ITEM_COMPONENTS_UNAVAILABLE' }; };
    this.resolveEffect = id => { const name = registry.effects?.[id]?.name; return name ? 'minecraft:' + name.replace(/[A-Z]/g,(c,i)=>(i?'_':'')+c.toLowerCase()) : null; };
  }
  feed(name, params) { this.events.emit('packet', { name, params, sequence: ++this.sequence, registrySha256: this.registrySha256 }); }
  ingest(receipt) {
    if (this.closed) throw Error('PAPER_OBSERVATION_CLOSED');
    const p = receipt?.player;
    if (receipt?.available !== true || receipt.uuid?.toLowerCase() !== this.uuid || p?.uuid?.toLowerCase() !== this.uuid
      || p.name !== this.username || !UUID.test(receipt.generation ?? '') || !point(p.position) || !point(p.velocity)
      || ![p.yawDegrees,p.pitchDegrees,p.eyeHeight].every(Number.isFinite) || !Number.isSafeInteger(p.entityId)
      || !UUID.test(p.world?.uuid ?? '') || !/^minecraft:[a-z0-9_/-]+$/.test(p.world.name ?? '')
      || !Number.isInteger(p.world.minY) || !Number.isInteger(p.world.height) || p.world.height < 16 || p.world.height > 4096
      || !Array.isArray(receipt.packets) || receipt.packets.length > 4096) throw Error('PAPER_OBSERVATION_IDENTITY_OR_STATE');
    const changed = this.generation !== receipt.generation || this.game.worldUuid !== p.world.uuid || this.entity?.id !== p.entityId;
    const previous=this.latest,inventorySignature=JSON.stringify(p.inventory??null);
    const sourceTick=Number.isSafeInteger(p.serverTick)&&p.serverTick>=0;
    if(!changed&&sourceTick&&Number.isSafeInteger(previous?.serverTick)&&p.serverTick<previous.serverTick)throw Error('PAPER_OBSERVATION_TICK_REGRESSED');
    const newTick=changed||!sourceTick||p.serverTick!==previous?.serverTick;
    if(newTick){
      this.locomotion=paperObservedLocomotion(this.motionPrevious,p,changed);
      this.motionPrevious={uuid:p.uuid,entityId:p.entityId,world:{uuid:p.world.uuid},position:{...p.position},serverTick:p.serverTick,observedAt:p.observedAt};
    }
    const inventoryChanged=changed||inventorySignature!==this.inventorySignature;
    if(inventoryChanged){this.inventorySignature=inventorySignature;this.inventoryRows=null;}
    if(changed){this.swingSequence=0;this.attackProgress=0;this.swing=null;}
    // The observed swing progress, not unrelated chunk/entity packet sequence,
    // owns the action token. Otherwise a running attack restarts every sample.
    const attack=Number.isFinite(p.attackAnim)?p.attackAnim:0;
    if(attack>0){
      if(this.attackProgress<=0||attack+.2<this.attackProgress)this.swingSequence++;
      this.swing={hand:'mainhand',sequence:this.swingSequence,startedAt:p.observedAt-attack*300,durationTicks:6};
    }else this.swing=null;
    this.attackProgress=attack;this.latest = structuredClone(p);
    this.entity = { id: p.entityId, uuid: this.uuid, username: this.username, position: { ...p.position }, velocity: { ...p.velocity },
      yaw: Math.PI - p.yawDegrees * Math.PI / 180, pitch: -p.pitchDegrees * Math.PI / 180, eyeHeight: p.eyeHeight,
      bodyYaw: Math.PI - p.bodyYaw * Math.PI / 180, headYaw: Math.PI - p.headYaw * Math.PI / 180,
      onGround: p.onGround, crouching: p.sneaking, isInWater: p.inWater, sprinting:p.sprinting, flying:p.flying,isValid: true, attributes: {} };
    this.health = p.health; this.food = p.food; this.experience = { level: p.experienceLevel, progress: p.experienceProgress };
    this.quickBarSlot = p.selectedHotbarSlot; this.game = { dimension: p.world.name, worldUuid: p.world.uuid };
    // No forged skin profile. An unavailable skin remains unavailable; an
    // operator's audited appearance catalog can supply original models.
    this.player = this.players[this.username] = { username: this.username, uuid: this.uuid,
      ...(p.hasCustomTextures === true ? { skinData: { unresolved: true } } : {}) };
    if (changed) {
      this.generation = receipt.generation; this.wireSequence = 0;
      if (!Array.isArray(receipt.configurationPackets) || receipt.configurationPackets.length > 128) throw Error('PAPER_OBSERVATION_REGISTRIES_MISSING');
      for (const data of receipt.configurationPackets) {
        const packet = this.decode(data, 'configuration');
        if (packet.name === 'registry_data') this._client.emit('registry_data', packet.params);
      }
      this.feed('respawn', { worldState: { name: p.world.name, dimension: p.world.name, minY: p.world.minY, height: p.world.height,
        ...(/^-?\d{1,20}$/.test(p.world.hashedSeed ?? '') ? { hashedSeed: BigInt(p.world.hashedSeed) } : {}) } });
      this.emit('spawn');
    }
    for (const row of receipt.packets) {
      if (!Number.isSafeInteger(row.sequence) || row.sequence < 1) throw Error('PAPER_OBSERVATION_SEQUENCE');
      if (row.sequence <= this.wireSequence) continue; // HTTP retry: observation, never an action.
      if (row.sequence !== this.wireSequence + 1) throw Error('PAPER_OBSERVATION_SEQUENCE');
      const packet = this.decode(row.data, 'play');
      if (!PLAY.has(packet.name)) throw Error('PAPER_OBSERVATION_PACKET_NOT_ALLOWED');
      this.feed(packet.name, packet.params); this._client.emit(packet.name, packet.params); this.wireSequence = row.sequence;
    }
    this.feed('update_time', { age: BigInt(p.gameTime), time: BigInt(p.dayTime) });
    // Repeated HTTP samples of one Paper tick still carry ordered world packets,
    // but must not invent extra movement ticks or zero-speed gait samples.
    if(newTick)this.emit('physicsTick');
    // Keep the existing low-frequency HUD/inventory path; only actual changes
    // bypass it. Faster pose delivery must not resend 46 SNBT slots at 20Hz.
    const urgent=changed||inventoryChanged||p.selectedHotbarSlot!==previous?.selectedHotbarSlot||p.health!==previous?.health||p.food!==previous?.food;
    if(urgent||this.now()-this.lastPresentationAt>=200){this.lastPresentationAt=this.now();this.events.emit('presentation');}
    return { changed, after: this.wireSequence, generation: this.generation };
  }
  decode(data, state) {
    if (typeof data !== 'string' || data.length > 3 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw Error('PAPER_OBSERVATION_PACKET_LIMIT');
    const bytes = Buffer.from(data, 'base64');
    if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw Error('PAPER_OBSERVATION_PACKET_LIMIT');
    const packet = this.decodePacket(bytes, state);
    if (!packet || typeof packet.name !== 'string' || !packet.params) throw Error('PAPER_OBSERVATION_PACKET_INVALID');
    return packet;
  }
  presentation() {
    const p = this.latest; if (!p) return null;
    const rows = this.inventoryRows??(Array.isArray(p.inventory) && p.inventory.length === 46 ? p.inventory.map(({slot,item}) => {
      if (!Number.isInteger(slot) || slot < 0 || slot > 45 || item && (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(item.name ?? '')
        || !Number.isInteger(item.count) || item.count < 1 || typeof item.snbt !== 'string' || item.snbt.length > 65536)) throw Error('PAPER_INVENTORY_INVALID');
      return { slot, item: item ? { ...item } : null };
    }) : null);
    this.inventoryRows=rows;
    const equipment = rows ? { source: PAPER_OBSERVATION_MODE, playerUuid: this.uuid, entityId: p.entityId,
      mainHand: rows[36 + p.selectedHotbarSlot]?.item ?? null, offHand: rows[45]?.item ?? null,
      head: rows[5]?.item ?? null, chest: rows[6]?.item ?? null, legs: rows[7]?.item ?? null, feet: rows[8]?.item ?? null } : null;
    const self = { playerUuid: this.uuid, health: p.health, maxHealth: p.maxHealth, armor: p.armor, food: p.food,
      experienceLevel: p.experienceLevel, experienceProgress: p.experienceProgress, mainArm: p.mainArm,
      crouching: p.sneaking, sprinting: p.sprinting, flying: p.flying, inWater: p.inWater,
      spinAttack: p.spinAttack === true, swinging: p.attackAnim > 0,
      airSupply: p.airSupply, maxAirSupply: p.maxAirSupply, pose: p.pose,
      oxygen: Number.isFinite(p.airSupply) && p.maxAirSupply > 0 ? Math.max(0, Math.min(20, p.airSupply * 20 / p.maxAirSupply)) : null,
      bodyYaw: Math.PI - p.bodyYaw * Math.PI / 180, headYaw: Math.PI - p.headYaw * Math.PI / 180,
      usingItem: p.usingItem, useItemRemainingTicks: p.useItemRemainingTicks, attackAnim: p.attackAnim,
      equipment, handAnimation:this.handState(),locomotion:this.locomotion };
    return { schemaVersion: 1, playerUuid: this.uuid, profile: 'vanilla_1.21.1', self,
      inventory: this.scope === 'owner' && rows ? { playerUuid: this.uuid, windowId: 0, selectedHotbarSlot: p.selectedHotbarSlot,
        inventoryStart: 9, hotbarStart: 36, offhandSlot: 45, slots: rows, carried: null } : null,
      nativeMenu: null, renderRegistries: p.renderRegistries?.source === 'server_builtin_registries' ? p.renderRegistries : null,
      nativeState: { available: true, source: PAPER_OBSERVATION_MODE } };
  }
  handState() {
    const p=this.latest;if(!p)return null;
    return {source:PAPER_OBSERVATION_MODE,playerUuid:this.uuid,entityId:p.entityId,sampledAt:p.observedAt,
      // Paper omits activeHand when the body is not using an item. Undefined
      // invalidates the entire strict presentation copy (including inventory,
      // health capacity, armor and gait). Unknown/idle is explicitly null;
      // never invent a main-hand action or relax the shared identity validator.
      mainArm:p.mainArm,usingItem:p.usingItem,activeHand:p.activeHand??null,crouching:p.sneaking,spinAttack:p.spinAttack===true,
      use:p.usingItem&&['eat','drink'].includes(p.useItemAnimation)&&Number.isInteger(p.useItemDurationTicks)&&p.useItemDurationTicks>0
        ?{source:'paper_use_item_state',hand:p.activeHand,name:p.activeItemName,kind:p.useItemAnimation,
          durationTicks:p.useItemDurationTicks,startedAt:p.observedAt-(p.useItemDurationTicks-p.useItemRemainingTicks)*50}:null,
      swing:this.swing&&{...this.swing}};
  }
  motionSample() {
    const p=this.latest;
    return Number.isSafeInteger(p?.serverTick)&&p.serverTick>=0&&Number.isFinite(p.observedAt)
      ?{tick:p.serverTick,sampledAt:p.observedAt}:null;
  }
  close() { if (this.closed) return; this.closed = true; this.entity = null; this.latest = null; this.emit('end'); this.events.removeAllListeners(); this._client.removeAllListeners(); this.removeAllListeners(); }
}

export async function preparePaperObservation(options) {
  const prepared = await prepareNativeWorldPreviewHost({ ...options, port: options.port ?? 0 });
  return { attach({ playerUuid, name, registry, decodePacket, simplifyNBT, scope = 'owner' }) {
    const observed = new PaperObservedPlayer({ playerUuid, name, registry, registrySha256: prepared.registrySha256, decodePacket, scope });
    const host = prepared.attach({ bot: observed, nativeStream: observed, simplifyNBT, expectedUsername: name,
      resolveDimension: p => ({ name: p.name, minY: p.minY, height: p.height }), sourceMode: PAPER_OBSERVATION_MODE,
      getPresentationState: () => { const value = observed.presentation(); return value && { ...value, serverItemPackId: prepared.serverItemPackId }; } });
    return { observed, host, ingest: row => observed.ingest(row), get url() { return host.url; },
      async listen() { return host.listen(); }, async close() { try { await host.close(); } finally { observed.close(); } } };
  } };
}
