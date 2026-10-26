import assert from "node:assert/strict";
import test from "node:test";
import { rendererEntityEquipment, installRendererEquipmentHandedness } from "../src/modern-viewer/renderer-equipment.js";

test("entity equipment uses the renderer registry for each named weapon", () => {
  const registry = { diamond_sword: { id: 7 }, bow: { id: 19 }, crossbow: { id: 21 } };
  const source = {
    id: 42,
    equipment: [
      { name: "minecraft:diamond_sword", type: 801, itemId: 801 },
      { name: "bow", type: 802, itemId: 802 },
      { name: "crossbow", type: 803, itemId: 803 },
      null,
    ],
  };
  const rendered = rendererEntityEquipment(source, registry);
  assert.deepEqual(rendered.equipment.map((item) => item?.itemId ?? null), [7, 19, 21, null]);
  assert.equal(source.equipment[0].itemId, 801);
  assert.equal(rendered.equipment[0].type, 801);
});

test("unknown registry IDs resolve by item name", () => {
  const entity = { equipment: [{ name: "minecraft:iron_axe", itemId: 999 }] };
  assert.equal(rendererEntityEquipment(entity, {}).equipment[0].itemId, "iron_axe");
});

test('mob bow, crossbow and melee equipment use actual main/off arms without rewriting packets', () => {
  const calls = [], marker = {}, entities = { addItemModel(...args) { assert.equal(this, entities); calls.push(args); return marker; } };
  const original = entities.addItemModel, restore = installRendererEquipmentHandedness(entities);
  assert.equal(installRendererEquipmentHandedness(entities), restore, 'install once per renderer');
  for (const name of ['skeleton', 'stray', 'bogged', 'zombie', 'husk', 'drowned', 'pillager']) {
    for (const weapon of ['bow', 'crossbow', 'iron_sword', 'iron_axe', 'trident']) for (const left of [false, true]) {
      const source = { name, metadata: Array(16), equipment: [{ name: weapon }, { name: 'shield' }] };
      source.metadata[15] = left ? 2 : 0;
      const before = structuredClone(source), entity = { originalEntity: source };
      assert.equal(entities.addItemModel(entity, 'left', source.equipment[0], false), marker);
      assert.equal(calls.at(-1)[1], left ? 'left' : 'right');
      entities.addItemModel(entity, 'right', source.equipment[1], false);
      assert.equal(calls.at(-1)[1], left ? 'right' : 'left');
      assert.deepEqual(source, before);
    }
  }
  for (const arm of ['left', 'right']) { entities.addItemModel({}, arm, null, true); assert.equal(calls.at(-1)[1], arm); }
  restore(); assert.equal(entities.addItemModel, original);
});

test('equipment wrapper preserves later extensions and the original error', () => {
  const failure = new Error('mesh failed'), entities = { addItemModel() { throw failure; } };
  const restore = installRendererEquipmentHandedness(entities);
  assert.throws(() => entities.addItemModel({}, 'left', {}, false), error => error === failure);
  const later = () => {}; entities.addItemModel = later; restore(); assert.equal(entities.addItemModel, later);
});
