import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

const panelSource = readFileSync(new URL('../minecraft-viewer-service-panel.js', import.meta.url), 'utf8');
const presetSource = readFileSync(new URL('../presets/qiandengji-guild.js', import.meta.url), 'utf8');
const eventsSource = readFileSync(new URL('../minecraft-viewer-events.js', import.meta.url), 'utf8');

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.handlers = new Map();
    this.hidden = false; this.textContent = ''; this.style = { setProperty() {} };
    const classes = new Set();
    this.classList = { add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)), contains: name => classes.has(name) };
  }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  addEventListener(name, fn) { this.handlers.set(name, fn); }
  setAttribute() {}
  querySelector() { return new Element(); }
  get firstElementChild() { return this.children[0]; }
  remove() { this.parent.children = this.parent.children.filter(node => node !== this); }
  allText() { return [this.textContent, ...this.children.map(node => node.allText())].filter(Boolean).join(' '); }
}
function browser({ preset = true, feed = false } = {}) {
  let now = 1791096720000;
  let counter = 0;
  const timers = new Map();
  const handlers = new Map();
  const lifecycle = new Map();
  const elements = Object.fromEntries(['corti-event-feed', 'corti-game-title', 'corti-actionbar', 'corti-boss-bars'].map(id => [id, new Element()]));
  const body = new Element('body');
  const document = { head: new Element('head'), body, createElement: tag => new Element(tag),
    getElementById: id => elements[id] || body.children.find(node => node.id === id) || null };
  class Clock extends Date { constructor(value = now) { super(value); } static now() { return now; } }
  const context = createContext({ Date: Clock, document,
    window: { addEventListener: (name, fn) => lifecycle.set(name, fn) },
    socket: { on(name, fn) { const list = handlers.get(name) || []; list.push(fn); handlers.set(name, list); } },
    performance: { now: () => now },
    setTimeout(fn, delay) { const id = ++counter; timers.set(id, { at: now + delay, fn }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  runInContext((preset ? presetSource : '') + '\n' + panelSource + (feed ? '\n' + eventsSource : ''), context);
  const emit = (name, value) => { for (const fn of handlers.get(name) || []) fn(value); };
  const say = (text, kind = 'system') => {
    if (feed) emit('gameMessage', { kind, text });
    else return context.MinecraftViewerDocuments.consumeMessage({ kind, text });
  };
  const advance = ms => {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
  };
  return { api: context.MinecraftViewerDocuments, root: body.children[0], body, say, emit, advance,
    lifecycle, timers, feed: elements['corti-event-feed'] };
}
// Received system lines from a guild CLI snapshot. IDs and title wording change per board.
const board = [
  '冒险者认证：钻石 · 声望 563 · 已完成 62 单；已达最高认证',
  '正在进行：边界巡礼 [0/1]',
  '【今日 · 2026-10-04 · 动态委托】',
  'db_20261004_seed_day 留种到明天 · 给公会交付 16 粒小麦种子。 · 声望+6 / 绿宝石×2 [今日已完成]',
  'db_20261004_paper_day 补一叠纸 · 给公会交付 12 张纸，让大家记录旅途。 · 声望+6 / 绿宝石×2 [可接]',
  'db_20261004_pumpkin_day 南瓜上桌 · 给公会交付 4 个南瓜。 · 声望+6 / 绿宝石×2 [今日已完成]',
  '【冒险者公会 · 常驻委托】',
  '【今日公会看板 · 2026-10-04 · 主考维度：感知、语言】',
  'gem_offer 星辰之晶 · 向公会交付 1 颗钻石 · 声望+15 / 绿宝石×5 [规划|今日已完成]',
  'lantern_riddle 千灯灯谜 · 谜：腹中灯火，悬于门庭——把它交给公会 · 声望+15 / 绿宝石×5 [语言|今日已完成]',
];

test('received guild text renders a complete dynamic board before feed limiting', () => {
  const view = browser({ feed: true });
  for (const line of board) view.say(line);
  assert.equal(view.root.hidden, false);
  assert.equal(view.root.dataset.compact, 'false');
  assert.equal(view.feed.children.length, 0);
  const snapshot = view.api.state();
  assert.equal(snapshot.sections.flatMap(section => section.rows).length, 5);
  assert.equal(snapshot.summary.title, '边界巡礼');
  assert.match(snapshot.summary.status, /0\/1/);
  assert.match(view.root.allText(), /补一叠纸/);
  assert.match(view.root.allText(), /12 张纸/);
  assert.doesNotMatch(view.root.allText(), /db_20261004_paper_day/);
  for (let i = 0; i < 4; i++) view.say(`普通系统消息 ${i}`);
  assert.equal(view.feed.children.length, 2);
});

test('board times out to its current commission and viewer can reopen it', () => {
  const view = browser();
  board.forEach(line => view.say(line));
  view.advance(18_000);
  assert.equal(view.root.dataset.compact, 'true');
  assert.equal(view.api.state().summary.title, '边界巡礼');
  const button = view.root.children[0].children[1];
  button.handlers.get('click')();
  assert.equal(view.root.dataset.compact, 'false');
});

test('combat and real game windows reduce the document without losing its content', () => {
  const view = browser();
  board.forEach(line => view.say(line));
  view.emit('entityDamage', { isSelf: false });
  assert.equal(view.root.dataset.compact, 'false');
  view.emit('entityDamage', { isSelf: true });
  assert.equal(view.root.dataset.combat, 'true');
  assert.equal(view.root.dataset.compact, 'true');
  view.advance(5000);
  assert.equal(view.root.dataset.compact, 'false');
  view.emit('containerState', { id: 8 });
  assert.equal(view.root.dataset.compact, 'true');
  view.emit('containerState', null);
  assert.equal(view.root.dataset.compact, 'false');
  assert.equal(view.api.state().sections.flatMap(section => section.rows).length, 5);
});

test('only an expanded document hides the skill panel and collapse or combat restores it', () => {
  const view = browser();
  const hidden = () => view.body.classList.contains('mc-viewer-document-expanded');
  board.forEach(line => view.say(line));
  assert.equal(hidden(), true);
  view.emit('tacticalAttack', { id: 3 });
  assert.equal(hidden(), false);
  view.advance(5000);
  assert.equal(hidden(), true);
  view.emit('containerState', { id: 2 });
  assert.equal(hidden(), false);
  view.emit('containerState', null);
  assert.equal(hidden(), true);
  view.advance(13_000);
  assert.equal(hidden(), false);
  view.root.children[0].children[1].handlers.get('click')();
  assert.equal(hidden(), true);
  view.root.children[0].children[1].handlers.get('click')();
  assert.equal(hidden(), false);
});

for (const lifecycle of ['viewerReset', 'disconnect', 'pagehide']) test(`${lifecycle} clears received data and cancels timers`, () => {
  const view = browser();
  board.forEach(line => view.say(line));
  if (lifecycle === 'pagehide') view.lifecycle.get(lifecycle)();
  else view.emit(lifecycle);
  assert.equal(view.root.hidden, true);
  assert.equal(view.api.state(), null);
  assert.equal(view.timers.size, 0);
  assert.equal(view.body.classList.contains('mc-viewer-document-expanded'), false);
  assert.equal(view.say(board[4]), false);
});

test('a fresh page and the generic bundle have no fabricated guild data', () => {
  const fresh = browser();
  assert.equal(fresh.root.hidden, true);
  assert.equal(fresh.api.state(), null);
  const generic = browser({ preset: false });
  for (const line of board) assert.equal(generic.say(line), false);
  assert.equal(generic.api.state(), null);
  assert.equal(generic.root.hidden, true);
});

test('another host can supply its own normalized document without this preset', () => {
  const view = browser({ preset: false });
  view.emit('documentState', { schemaVersion: 1, id: 'example:journal', title: '调查记录',
    observedAt: 1791096720000, sections: [{ title: '路线', rows: [{ title: '小溪', body: '沿岸寻找桥梁' }] }],
    summary: { title: '正在调查小溪', status: '1/3' } });
  assert.match(view.root.allText(), /沿岸寻找桥梁/);
  assert.equal(view.root.dataset.compact, 'false');
  view.emit('documentState', null);
  assert.equal(view.root.hidden, true);
  assert.equal(view.body.classList.contains('mc-viewer-document-expanded'), false);
});

test('new board snapshots replace prior entries and dynamic IDs are not hard-coded', () => {
  const view = browser();
  board.forEach(line => view.say(line));
  view.advance(1000);
  view.say('【今日 · 2026-10-05 · 动态委托】');
  view.say('db_20261005_newwork 一篮苹果 · 带来 3 个苹果 · 声望+9 / 绿宝石×4 [可接]');
  view.say('db_20261005_newwork 一篮苹果 · 带来 3 个苹果 · 声望+9 / 绿宝石×4 [进行中]');
  view.say('正在进行：一篮苹果 [2/3]');
  const snapshot = view.api.state();
  assert.equal(snapshot.sections.flatMap(section => section.rows).length, 1);
  assert.equal(snapshot.summary.body, '带来 3 个苹果');
  assert.equal(snapshot.summary.status, '进行中 · 2/3');
  assert.equal(snapshot.sections[0].rows[0].status, '进行中 · 2/3');
  assert.equal(snapshot.sections[0].rows[0].detail, '声望+9 / 绿宝石×4');
});

test('a confirmed active status updates a matching offer while retaining its description and reward', () => {
  const view = browser();
  board.forEach(line => view.say(line));
  view.say('正在进行：补一叠纸 [0/12]');
  const offer = view.api.state().sections.flatMap(section => section.rows)
    .find(entry => entry.id === 'db_20261004_paper_day');
  assert.equal(offer.status, '进行中 · 0/12');
  assert.equal(offer.body, '给公会交付 12 张纸，让大家记录旅途。');
  assert.equal(offer.detail, '声望+6 / 绿宝石×2');
  assert.equal(view.api.state().summary.body, offer.body);
  assert.equal(view.api.state().summary.detail, offer.detail);
});

test('a repeated board keeps known active progress on its matching row and omits empty sections', () => {
  const view = browser();
  board.forEach(line => view.say(line));
  view.say('正在进行：补一叠纸 [3/12]');
  view.advance(1000);
  board.filter(line => line !== board[0] && line !== board[1]).forEach(line => view.say(line));
  const rows = view.api.state().sections.flatMap(section => section.rows);
  assert.equal(rows.find(entry => entry.id === 'db_20261004_paper_day').status, '进行中 · 3/12');
  assert.equal(view.root.children.filter(node => node.tagName === 'SECTION').length, 2);
  assert.doesNotMatch(view.root.allText(), /只读/);
});

test('chat and whispers do not impersonate server guild data or update the card', () => {
  const view = browser();
  for (const kind of ['chat', 'whisper', 'title']) for (const line of board) assert.equal(view.say(line, kind), false);
  assert.equal(view.api.state(), null);
});

test('documents remain text-only and reject malformed snapshots without replacing current facts', () => {
  const view = browser({ preset: false });
  assert.equal(view.api.set({ schemaVersion: 1, id: 'example:doc', title: '<img onerror=alert(1)>',
    observedAt: 1791096720000, sections: [{ title: '内容', rows: [{ title: '<script>', body: '<b>纯文字</b>' }] }] }), true);
  assert.match(view.root.allText(), /<img onerror/);
  assert.equal(view.api.set({ schemaVersion: 2, id: 'invalid' }), false);
  assert.equal(view.api.state().id, 'example:doc');
  assert.equal(view.root.children.some(element => element.tagName === 'IMG'), false);
});
