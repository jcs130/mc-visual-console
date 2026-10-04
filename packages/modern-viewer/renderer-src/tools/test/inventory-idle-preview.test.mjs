import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

const source = readFileSync(new URL('../minecraft-viewer-panels.js', import.meta.url), 'utf8');

function browser() {
  const events = new Map();
  const keys = new Map();
  const button = { addEventListener: (_name, listener) => { button.click = listener; } };
  const close = { addEventListener: (_name, listener) => { close.click = listener; } };
  const title = { textContent: '' };
  const label = { textContent: '' };
  const body = { replaceChildren() {} };
  const menu = { hidden: true, dataset: {}, querySelector(selector) {
    return { '[data-menu-close]': close, '[data-menu-title]': title,
      '[data-menu-source]': label, '[data-menu-body]': body }[selector] || null;
  } };
  let now = 0;
  let sequence = 0;
  const timers = new Map();
  const context = createContext({
    document: { head: { append() {} }, createElement: () => ({}),
      getElementById: (id) => ({ 'corti-inventory-toggle': button, 'corti-menu': menu }[id] || null),
      querySelector: () => null },
    window: { localStorage: { getItem: () => null }, addEventListener: (name, listener) => keys.set(name, listener) },
    socket: { on: (name, listener) => events.set(name, listener) },
    performance: { now: () => now },
    setInterval() {},
    setTimeout(callback, delay) {
      const id = ++sequence;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  });
  runInContext(source, context);
  runInContext('cortiRenderInventory = function(parent, inventory) { parent.inventory = inventory; };', context);
  const inventory = [{ name: 'diamond_sword' }];
  events.get('avatarState')({ inventory });
  const emit = (name, value) => events.get(name)?.(value);
  const preview = () => emit('inventoryPreview', { open: true, ttlMs: 2400, source: 'idle' });
  const advance = (ms) => {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= now) {
      timers.delete(id);
      timer.callback();
    }
  };
  const key = (code) => keys.get('keydown')({ code, preventDefault() {} });
  return { emit, preview, advance, menu, button, close, key, label, body, inventory, timers };
}

test('idle preview is read-only, uses existing avatar inventory and expires after 2.4 seconds', () => {
  const h = browser();
  h.preview();
  assert.equal(h.menu.hidden, false);
  assert.equal(h.menu.dataset.inventorySource, 'idle');
  assert.equal(h.label.textContent, '待机预览 · 只读');
  assert.equal(h.body.inventory, h.inventory);
  h.advance(2399);
  assert.equal(h.menu.hidden, false);
  h.advance(1);
  assert.equal(h.menu.hidden, true);
  assert.equal(h.timers.size, 0);
  h.emit('inventoryPreview', { open: true, ttlMs: 60000 });
  h.advance(2400);
  assert.equal(h.menu.hidden, true);
});

for (const control of ['button', 'keyboard']) test(`manual ${control} owns the menu after idle preview`, () => {
  const h = browser();
  h.preview();
  if (control === 'button') h.button.click();
  else h.key('KeyE');
  assert.equal(h.menu.dataset.inventorySource, 'manual');
  assert.equal(h.label.textContent, '玩家物品 · 只读');
  h.advance(5000);
  h.emit('inventoryPreview', { open: false });
  h.preview();
  assert.equal(h.menu.hidden, false);
  h.emit('entityDamage', { isSelf: true });
  assert.equal(h.menu.hidden, false);
});

for (const control of ['Escape', 'close']) test(`${control} cancels idle preview and its timeout`, () => {
  const h = browser();
  h.preview();
  if (control === 'Escape') h.key('Escape');
  else h.close.click();
  assert.equal(h.menu.hidden, true);
  assert.equal(h.timers.size, 0);
});

test('real game windows take priority and do not revive the idle preview when closed', () => {
  const h = browser();
  h.preview();
  h.emit('containerState', { id: 6, type: 'inventory', title: '真实窗口', slots: [] });
  assert.equal(h.menu.dataset.inventorySource, 'container');
  assert.equal(h.label.textContent, '游戏窗口 · 只读');
  h.preview();
  h.advance(3000);
  assert.equal(h.menu.hidden, false);
  h.emit('containerState', null);
  assert.equal(h.menu.hidden, true);
});

for (const [event, value] of [
  ['entityDamage', { isSelf: true }], ['tacticalAttack', { id: 9 }],
  ['combatFeedback', { damage: 2 }], ['rangedUse', { phase: 'draw' }],
  ['disconnect', undefined], ['viewerReset', undefined],
]) test(`${event} cancels the idle preview`, () => {
  const h = browser();
  h.preview();
  h.emit(event, value);
  assert.equal(h.menu.hidden, true);
  h.advance(5000);
  assert.equal(h.menu.hidden, true);
});

test('recent combat suppresses idle preview while another entity being hurt does not', () => {
  const h = browser();
  h.emit('entityDamage', { isSelf: false });
  h.preview();
  assert.equal(h.menu.hidden, false);
  h.emit('rangedUse', { phase: 'release' });
  h.preview();
  assert.equal(h.menu.hidden, true);
  h.advance(5000);
  h.preview();
  assert.equal(h.menu.hidden, false);
});
