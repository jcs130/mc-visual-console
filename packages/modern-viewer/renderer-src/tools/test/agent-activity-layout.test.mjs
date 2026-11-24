import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { installAgentActivity } from '../../src/modern-viewer/agent-activity-ui.js';

class El {
  constructor(tag) { this.tagName = tag; this.id = ''; this.className = ''; this.textContent = ''; this.hidden = false; this.children = []; this.parentElement = null; this.attrs = new Map(); this.dataset = {}; this.style = {}; }
  get firstElementChild() { return this.children[0] ?? null; }
  detach() { if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); }
  append(...nodes) { for (const n of nodes) { n.detach(); n.parentElement = this; this.children.push(n); } this.notify?.(); }
  prepend(n) { n.detach(); n.parentElement = this; this.children.unshift(n); }
  remove() { this.detach(); this.parentElement = null; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); } hasAttribute(k) { return this.attrs.has(k); }
  replaceChildren() { this.children = []; }
}
function dom({ layout = false } = {}) {
  const body = new El('body'), head = new El('head'), observers = [];
  if (layout) body.setAttribute('data-viewer-layout', 'obs');
  body.notify = () => { for (const fn of observers) fn(); };
  const find = (id, n = body) => { for (const c of n.children) { if (c.id === id) return c; const d = find(id, c); if (d) return d; } return null; };
  const document = { body, head, createElement: tag => new El(tag), getElementById: id => find(id), querySelector: () => null };
  const window = { setTimeout: () => 1, clearTimeout() {}, setInterval: () => 2, clearInterval() {}, addEventListener() {}, removeEventListener() {},
    MutationObserver: class { constructor(fn) { this.fn = fn; } observe() { observers.push(this.fn); } disconnect() { observers.splice(observers.indexOf(this.fn), 1); } } };
  return { document, window, body, find };
}

test('first-person HUD stacks 服务器读数 above 思考与工具 in one right column, including stats that arrive later', () => {
  const { document, window, body, find } = dom();
  const ui = installAgentActivity({ document, window, socket: new EventEmitter() });
  const column = find('corti-right-column');
  assert.equal(column.parentElement, body); assert.deepEqual(column.children.map(c => c.id), ['agent-activity']);
  const stats = new El('aside'); stats.id = 'corti-server-stats'; body.append(stats); // host HUD script appends to <body>
  assert.deepEqual(column.children.map(c => c.id), ['corti-server-stats', 'agent-activity']);
  const css = document.head.children[0].textContent;
  assert.match(css, /#corti-right-column\{position:fixed;top:64px;right:14px;z-index:35;display:flex;flex-direction:column/);
  assert.match(css, /#corti-right-column>\*\{pointer-events:auto;position:static!important;top:auto!important;right:auto!important;width:100%!important/);
  assert.match(css, /max-height:calc\(100vh - 200px\);overflow-y:auto/);
  for (const [w, h] of [[1280, 800], [1920, 1080]]) {
    const width = Math.min(360, w - 28);
    assert.ok(w - 14 - width > w / 2 + 182, `${w}px: column stays right of the centred hotbar/boss bar`);
    assert.ok(64 + (h - 200) <= h - 136, `${h}px: column ends above hotbar and vitals`);
  }
  ui.dispose(); assert.deepEqual(column.children.map(c => c.id), ['corti-server-stats'], 'stats remain visible after dispose');
});

test('OBS/explicit layouts keep their own placement and are not docked', () => {
  const { document, window, find } = dom({ layout: true });
  installAgentActivity({ document, window, socket: new EventEmitter() });
  assert.equal(find('corti-right-column'), null);
});
