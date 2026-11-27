import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../minecraft-viewer-interactions.js', import.meta.url), 'utf8');

test('holds a fast local presentation, labels a finished step as replay, and clears on observer reset', () => {
  let now = 1000, id = 0;
  const timers = new Map();
  const advance = ms => {
    const target = now + ms;
    while (true) {
      const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > target) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].fn();
    }
    now = target;
  };
  function node() {
    return {
      children: [], style: {}, dataset: {}, textContent: '', hidden: false,
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      setAttribute() {},
      get text() { return this.textContent + this.children.map(child => child.text).join(' '); },
    };
  }
  const document = { body: node(), createElement: node };
  const socket = new EventEmitter();
  vm.runInNewContext(source + '\ncortiInstallInteractionView(socket);', {
    document, socket, window: { addEventListener() {} }, performance: { now: () => now },
    setTimeout(fn, ms) { timers.set(++id, { at: now + ms, fn }); return id; },
    clearTimeout(key) { timers.delete(key); },
  });
  const act = { id: 7, kind: 'rename', phase: 'active', title: '铁砧', name: '<石桥>', item: '命名牌', remainingMs: 9000 };
  socket.emit('viewerInteraction', act);
  const [panel] = document.body.children;
  assert.match(panel.text, /正在操作/);
  advance(40);
  socket.emit('viewerInteraction', { ...act, phase: 'confirmed', result: '<石桥>', remainingMs: 2300 });
  assert.match(panel.text, /刚才的操作/);
  assert.match(panel.text, /<石桥>/);
  advance(609);
  assert.equal(panel.dataset.phase, 'active');
  advance(1);
  assert.equal(panel.dataset.phase, 'confirmed');
  socket.emit('viewerReset');
  assert.equal(panel.hidden, true);
  assert.equal(timers.size, 0);
  assert.equal(panel.text, '');
});
