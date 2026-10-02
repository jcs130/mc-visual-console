import assert from "node:assert/strict";
import test from "node:test";
import { rendererEntityEquipment } from "../src/modern-viewer/renderer-equipment.js";

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
