import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('oxygen appears above mana without changing vital height or moving food/hearts', async () => {
  const node = () => ({ children: [], style: {}, dataset: {}, classList: { toggle() {} },
    append(child) { this.children.push(child); child.remove = () => this.children.splice(this.children.indexOf(child), 1); },
    get lastElementChild() { return this.children.at(-1); }, replaceChildren() { this.children = []; } });
  const elements = new Map();
  const root = { querySelector(selector) { if (!elements.has(selector)) elements.set(selector, node()); return elements.get(selector); } };
  const context = { document: { getElementById: () => root, createElement: node }, cortiDurability: () => null,
    cortiItemIconUrl: () => '', cortiHeadKey: () => '', cortiAppendHeadFace() {}, cortiAppendEnchantmentGlint() {}, cortiAppendDurability() {} };
  runInNewContext(await readFile(new URL('../minecraft-viewer-hud.js', import.meta.url), 'utf8'), context);
  for (const maxHealth of [20, 40, 80]) {
    const state = { health: maxHealth, maxHealth, food: 20, hotbar: [] };
    context.renderCortiSurvivalHud({ ...state, inWater: false, oxygen: 20 });
    const dryHeight = elements.get('.corti-vitals').style.height;
    const dryHearts = elements.get('[data-corti-hearts]').style.height;
    for (const oxygen of [19, 10, 1, 20]) {
      context.renderCortiSurvivalHud({ ...state, inWater: true, oxygen });
      assert.equal(elements.get('.corti-vitals').style.height, dryHeight);
      assert.equal(elements.get('[data-corti-hearts]').style.height, dryHearts);
      assert.equal(elements.get('[data-corti-food]').children.length, 10);
      assert.equal(elements.get('[data-corti-air]').children.length, oxygen < 20 ? 10 : 0);
    }
  }
});
