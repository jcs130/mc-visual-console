import { EventEmitter } from 'node:events';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { observeVanillaNativeStream, vanillaPlayerPresentation, vanillaAttributeValue } from '../../host/vanilla-native-stream.mjs';
import { nativeItemIconEligible } from '../../src/native-viewer/native-item-icons.js';

test('vanilla HUD follows actual received attribute modifiers and locked registry defaults; malformed/modded inputs stay unknown',()=>{
  const require=createRequire(import.meta.url),bot={version:'1.21.1',registry:require('minecraft-data')('1.21.1'),entity:{attributes:{}}};
  assert.equal(vanillaAttributeValue(bot,'max_health'),20);assert.equal(vanillaAttributeValue(bot,'armor'),0);
  bot.entity.attributes['generic.armor']={value:0,modifiers:[{amount:6,operation:0}]};assert.equal(vanillaAttributeValue(bot,'armor'),6);
  bot.entity.attributes['generic.max_health']={value:20,modifiers:[{amount:4,operation:0},{amount:.5,operation:1},{amount:.1,operation:2}]};
  assert.ok(Math.abs(vanillaAttributeValue(bot,'max_health')-39.6)<1e-10);
  bot.entity.attributes['generic.max_health'].modifiers.push({amount:1,operation:99});assert.equal(vanillaAttributeValue(bot,'max_health'),null);
  assert.equal(vanillaAttributeValue({...bot,version:'modded'},'armor'),null);assert.equal(vanillaAttributeValue({...bot,registry:{}},'armor'),null);
});

test('vanilla effects and Boss bars preserve actual observed facts and clear when the body has none',()=>{
  const require=createRequire(import.meta.url),bot={version:'1.21.1',_client:{uuid:'own'},registry:require('minecraft-data')('1.21.1'),inventory:{slots:[]},
    entity:{effects:{3:{id:3,amplifier:1,duration:400}}},bossBars:[{entityUUID:'boss',title:{toString:()=>'<Boss>'},health:.5,color:'purple',dividers:6}]};
  let view=vanillaPlayerPresentation(bot);assert.equal(view.profile,'vanilla_1.21.1');assert.deepEqual(view.effects,[{name:'minecraft:mining_fatigue',amplifier:1,duration:400}]);
  assert.equal(view.bossBars[0].title,'<Boss>');assert.equal(view.bossBars[0].health,.5);
  bot.entity.effects={};bot.bossBars=[];view=vanillaPlayerPresentation(bot);assert.deepEqual(view.effects,[]);assert.deepEqual(view.bossBars,[]);
});

test('actual Prismarine decoder legacy Damage NBT cannot hide the authoritative 1.21.1 component patch', () => {
  const require = createRequire(import.meta.url), registry = require('minecraft-data')('1.21.1');
  const Item = require('prismarine-item')('1.21.1');
  const item = Item.fromNotch({ itemId: registry.itemsByName.wooden_pickaxe.id, itemCount: 1,
    components: [{ type: 'damage', data: 12 }], removeComponents: [] });
  // prismarine-item 1.18.0 initializes legacy Damage=0 in the constructor even
  // for this server-decoded modern stack. Its wire codec uses components=12.
  assert.equal(item.nbt.value.Damage.value, 0);
  const state = vanillaPlayerPresentation({ version: '1.21.1', _client: { uuid: 'player-a' }, registry,
    inventory: { slots: [item] } });
  assert.equal(state.nativeState.componentsAvailable, true);
  assert.match(state.inventory.slots[0].item.snbt, /"minecraft:damage":12/);
  assert.equal(nativeItemIconEligible(state.inventory.slots[0].item), true);
});

test('confirmed vanilla stacks are eligible for their original item icons', () => {
  const names = ['wooden_pickaxe', 'wooden_axe', 'bone', 'arrow', 'chicken', 'birch_planks'];
  const bot = { version: '1.21.1', _client: { uuid: 'player-a' }, quickBarSlot: 0,
    registry: { blocksByName: { birch_planks: {} } }, inventory: { slots: names.map((name, index) => ({
      name, count: index + 1, components: index === 0 ? [{ type: 'damage', data: 12 }] : [], removedComponents: [] })) } };
  const state = vanillaPlayerPresentation(bot);
  for (const { item } of state.inventory.slots) assert.equal(nativeItemIconEligible(item), true, item.name);
  assert.equal(state.nativeState.componentsAvailable, true);
  assert.equal(state.inventory.slots[0].item.descriptionId, 'item.minecraft.wooden_pickaxe');
  assert.equal(state.inventory.slots[5].item.descriptionId, 'block.minecraft.birch_planks');
});

test('unknown or malformed components are never stripped to manufacture a default icon', () => {
  const items = [
    { name: 'wooden_pickaxe', count: 1 },
    { name: 'wooden_pickaxe', count: 1, components: [{ type: 'future_visual', data: 1 }], removedComponents: [] },
    { name: 'wooden_pickaxe', count: 1, components: [{ type: 'damage', data: NaN }], removedComponents: [] },
  ];
  const state = vanillaPlayerPresentation({ version: '1.21.1', _client: { uuid: 'player-a' },
    inventory: { slots: items } });
  for (const { item } of state.inventory.slots) assert.equal(nativeItemIconEligible(item), false);
  assert.equal(state.nativeState.componentsAvailable, false);
  assert.equal(state.nativeState.componentFailures.length, 3);
});

test('component removal and nonvisual scalar patches survive the vanilla projection', () => {
  const state = vanillaPlayerPresentation({ version: '1.21.1', _client: { uuid: 'player-a' },
    inventory: { slots: [{ name: 'wooden_pickaxe', count: 1,
      components: [{ type: 'damage', data: 12 }, { type: 'repair_cost', data: 1 }], removedComponents: ['custom_name'] }] } });
  const item = state.inventory.slots[0].item;
  assert.match(item.snbt, /"minecraft:damage":12/);
  assert.match(item.snbt, /"minecraft:repair_cost":1/);
  assert.match(item.snbt, /"!minecraft:custom_name":\{\}/);
  assert.equal(nativeItemIconEligible(item), true);
});

test('visual overrides, conflicting patches and invalid data never borrow a generic icon', () => {
  const stacks = [
    { components: [{ type: 'custom_model_data', data: 7 }], removedComponents: [] },
    { components: [{ type: 'damage', data: 1 }], removedComponents: ['damage'] },
    { components: [{ type: 'max_damage', data: 0 }], removedComponents: [] },
    { components: [], removedComponents: [], nbt: { type: 'compound', value: {} } },
  ].map(patch => ({ name: 'wooden_pickaxe', count: 1, ...patch }));
  const state = vanillaPlayerPresentation({ version: '1.21.1', _client: { uuid: 'player-a' }, inventory: { slots: stacks } });
  for (const { item } of state.inventory.slots) assert.equal(nativeItemIconEligible(item), false);
  assert.equal(state.nativeState.componentFailures.length, 3); // custom_model_data is preserved, renderer rejects it.
  assert.match(state.inventory.slots[0].item.snbt, /"minecraft:custom_model_data":7/);
});

test('observes the same action connection, preserving native bytes and contiguous sequence', () => {
  const bot = { version: '1.21.1', _client: new EventEmitter() }, hash = 'a'.repeat(64);
  const stream = observeVanillaNativeStream(bot, hash), received = [];
  stream.events.on('packet', p => received.push(p));
  bot._client.emit('packet', {}, { name: 'login', state: 'login' });
  const chunk = { x: 1, z: 2, chunkData: Buffer.from([1, 2, 3]) };
  bot._client.emit('packet', {}, { name: 'login', state: 'play' });
  bot._client.emit('packet', {}, { name: 'keep_alive', state: 'play' });
  bot._client.emit('packet', chunk, { name: 'map_chunk', state: 'play' });
  assert.deepEqual(received.map(p => p.sequence), [1, 2]);
  assert.equal(received[1].params, chunk);
  assert.equal(received[1].registrySha256, hash);
  stream.close();
  assert.equal(bot._client.listenerCount('packet'), 0);
});

test('vanilla inventory belongs to this body and does not invent item components', () => {
  const bot = { version: '1.21.1', _client: { uuid: 'player-a' }, quickBarSlot: 2,
    inventory: { slots: [null, { name: 'oak_planks', count: 18 }] } };
  const state = vanillaPlayerPresentation(bot);
  assert.equal(state.playerUuid, 'player-a');
  assert.equal(state.inventory.selectedHotbarSlot, 2);
  assert.deepEqual(state.inventory.slots[1], { slot: 1, item: { name: 'minecraft:oak_planks', count: 18 } });
  assert.equal(state.nativeState.componentsAvailable, false);
  assert.equal(vanillaPlayerPresentation({ ...bot, version: '1.20.6' }), null);
  assert.equal(vanillaPlayerPresentation({ ...bot, _client: {} }), null);
});
