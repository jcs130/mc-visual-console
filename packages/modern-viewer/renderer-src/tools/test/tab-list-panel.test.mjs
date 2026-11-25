import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

const source = readFileSync(new URL('../minecraft-viewer-presentation.js', import.meta.url), 'utf8');

function browser() {
  class Element {
    children = []; dataset = {}; textContent = ''; hidden = false; attributes = {};
    style = { cssText: '', display: '', setProperty() {}, removeProperty() {} };
    classList = { toggle() {} };
    setAttribute(k, v) { this.attributes[k] = v; }
    append(...e) { this.children.push(...e); }
    replaceChildren() { this.children = []; }
  }
  const body = new Element();
  const events = new Map();
  const ctx = createContext({
    document: { body, createElement: () => new Element(), querySelectorAll: () => [], getElementById: () => null },
    socket: { on: (name, handler) => events.set(name, handler) },
    Date, localStorage: { getItem: () => null, setItem() {} }, setTimeout() {}, setInterval() {},
  });
  runInContext(source, ctx);
  return { body, display: state => events.get('serverDisplayState')(state) };
}

test('tab header and footer render as one read-only panel and hide when empty', () => {
  const b = browser();
  b.display({ tabHeader: '§6Welcome\n在线 3', tabFooter: 'ping 120ms', scoreboards: [] });
  const panel = b.body.children.find(el => el.id === 'corti-tab-list');
  assert.ok(panel, 'panel added to body');
  assert.equal(panel.attributes['aria-label'], '玩家列表页眉页脚');
  assert.match(panel.textContent, /Welcome/);
  assert.match(panel.textContent, /────/);
  assert.match(panel.textContent, /ping 120ms/);
  assert.equal(panel.hidden, false);
  b.display({ tabHeader: '', tabFooter: '' });
  assert.equal(panel.hidden, true);
  assert.equal(panel.style.display, 'none');
  assert.equal(b.body.children.filter(el => el.id === 'corti-tab-list').length, 1, 'panel reused');
});

test('a missing tab section does not break the sidebar path', () => {
  const b = browser();
  assert.doesNotThrow(() => b.display({ scoreboards: [{ slot: 'sidebar', title: 'x', rows: [] }] }));
});
