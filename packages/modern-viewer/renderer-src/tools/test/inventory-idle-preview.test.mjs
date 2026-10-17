import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';
import { AgentVisualState } from '../../src/modern-viewer/agent-visual-state.js';

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
  const visualState = new AgentVisualState({ now: () => now });
  const context = createContext({
    latestPosition: { pos: { x: 1, y: 64, z: 1 } },
    document: { body: { dataset: {} }, head: { append() {} }, createElement: () => ({}),
      getElementById: (id) => ({ 'corti-inventory-toggle': button, 'corti-menu': menu }[id] || null),
      querySelector: () => null },
    window: { localStorage: { getItem: () => null }, addEventListener: (name, listener) => keys.set(name, listener) },
    socket: { on: (name, listener) => events.set(name, listener) },
    agentVisualization: { snapshot: () => visualState.snapshot() },
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
  runInContext('cortiRenderCrafting = function(parent, container) { parent.crafting = container; };', context);
  const inventory = [{ name: 'diamond_sword' }];
  const subject = { playerUuid: '00000000-0000-3000-8000-000000000001', playerName: 'Player', entityId: 3 };
  events.get('avatarState')({ inventory, entity: { id: subject.entityId, uuid: subject.playerUuid } });
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
  const operation = (id = 1, windowId = 0, override = {}) => {
    const frame = { schemaVersion: 1, available: true, subject, epoch: 'actual-connection', sequence: id,
      ttlMs: 3500, input: { operations: [{ id, kind: 'inventory', slot: 9, windowId, remainingMs: 3200 }] }, ...override };
    visualState.accept(frame); emit('agentVisualization', frame);
  };
  return { emit, preview, advance, menu, button, close, key, label, body, inventory, timers, operation, subject };
}

test('a real container remains displayed while the same player moves; a close receipt still closes it', () => {
  const h = browser();
  h.emit('containerState', { id: 6, type: 'inventory', title: '真实窗口', slots: [] });
  h.emit('position', { pos: { x: 8, y: 65, z: 8 } });
  assert.equal(h.menu.hidden, false);
  assert.equal(h.menu.dataset.inventorySource, 'container');
  h.emit('containerState', null);
  assert.equal(h.menu.hidden, true);
});

test('an actual window-0 click opens the same player inventory once and expires without replaying it', () => {
  const h = browser();
  h.operation();
  assert.equal(h.menu.hidden, false);
  assert.equal(h.menu.dataset.inventorySource, 'operation');
  assert.equal(h.label.textContent, '物品操作已发送 · 只读');
  assert.equal(h.body.inventory, h.inventory);
  h.advance(2400);
  assert.equal(h.menu.hidden, true);
  h.operation(1);
  assert.equal(h.menu.hidden, true, 'replayed transport frames do not reopen the menu');
  h.operation(2);
  assert.equal(h.menu.hidden, false, 'a new actual click opens a new preview');
});

test('a craft closed before the first draw remains briefly as its actual closed slot snapshot', () => {
  const h = browser(), crafting = { id: 5, type: 'minecraft:crafting', title: '合成', slots: [{ name: 'oak_boat' }] };
  h.emit('containerState', crafting);
  h.emit('containerState', null);
  assert.equal(h.menu.hidden, false);
  assert.equal(h.menu.dataset.inventorySource, 'closed-crafting');
  assert.equal(h.label.textContent, '刚才的合成窗口 · 已关闭 · 只读');
  assert.equal(h.body.crafting, crafting, 'only actual received slots are retained');
  h.advance(2399);
  assert.equal(h.menu.hidden, false);
  h.advance(1);
  assert.equal(h.menu.hidden, true);
});

test('manual inventory and a newer real window supersede the closed crafting preview', () => {
  const h = browser();
  h.emit('containerState', { id: 5, type: 'crafting_table', slots: [] });
  h.emit('containerState', null);
  h.button.click();
  assert.equal(h.menu.dataset.inventorySource, 'manual');
  h.advance(5000);
  assert.equal(h.menu.hidden, false);
  h.emit('containerState', { id: 6, type: 'inventory', slots: [] });
  assert.equal(h.menu.dataset.inventorySource, 'container');
});

for (const event of ['disconnect', 'viewerReset']) test(`${event} clears closed crafting snapshots and their timer`, () => {
  const h = browser();
  h.emit('containerState', { id: 5, type: 'crafting', slots: [] });
  h.emit('containerState', null);
  h.emit(event);
  assert.equal(h.menu.hidden, true);
  assert.equal(h.timers.size, 0);
  h.advance(5000);
  assert.equal(h.menu.hidden, true);
});

test('another player or a workbench click without a real container snapshot does not invent an inventory screen', () => {
  const h = browser();
  h.operation(1, 0, { subject: { ...h.subject, entityId: 7 } });
  assert.equal(h.menu.hidden, true);
  h.operation(2, 4);
  assert.equal(h.menu.hidden, true);
  h.emit('containerState', { id: 4, type: 'inventory', title: '真实窗口', slots: [] });
  assert.equal(h.menu.hidden, false);
  assert.equal(h.menu.dataset.inventorySource, 'container');
});

for (const event of ['disconnect', 'viewerReset']) test(`${event} clears a persistent game container`, () => {
  const h = browser();
  h.emit('containerState', { id: 6, type: 'inventory', title: '交易', slots: [] });
  assert.equal(h.menu.hidden, false);
  h.emit(event);
  assert.equal(h.menu.hidden, true);
  h.emit('avatarState', { inventory: h.inventory });
  assert.equal(h.menu.hidden, true);
});

test('explicit browser dismissal persists across updates to the same real window', () => {
  const h = browser();
  h.emit('containerState', { id: 6, type: 'inventory', title: '交易', slots: [] });
  h.emit('position', { pos: { x: 1.1, y: 64, z: 1 }, yaw: 2 });
  assert.equal(h.menu.hidden, false);
  h.emit('position', { pos: { x: 1.4, y: 64, z: 1 } });
  assert.equal(h.menu.hidden, false);
  h.close.click();
  assert.equal(h.menu.hidden, true);
  h.emit('containerState', { id: 6, type: 'inventory', title: '交易', slots: [] });
  assert.equal(h.menu.hidden, true, 'same stale window must stay dismissed');
});

test('server closed state and observer subject changes clear copied windows', () => {
  const h = browser();
  const subject = { attached: true, playerUuid: 'a', entityId: 1, worldUuid: 'w', playerName: 'A', windowOpen: true };
  h.emit('viewerSession', subject);
  h.emit('containerState', { id: 6, type: 'inventory', slots: [] });
  h.emit('viewerSession', { ...subject, windowOpen: false });
  assert.equal(h.menu.hidden, true);
  h.emit('containerState', { id: 7, type: 'inventory', slots: [] });
  h.emit('viewerSession', { ...subject, playerUuid: 'b', playerName: 'B' });
  assert.equal(h.menu.hidden, true);
});

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
