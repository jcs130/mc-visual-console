import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { installViewerConnectionStatus } from '../../src/modern-viewer/viewer-connection.js';

function fixture(ready = false) {
  const socket = new EventEmitter();
  socket.connected = false;
  let connects = 0, reloads = 0, resets = 0;
  socket.connect = () => connects++;
  const statuses = [], timers = new Map();
  let next = 0;
  const stop = installViewerConnectionStatus(socket, {
    setStatus: (...value) => statuses.push(value), isRendererReady: () => ready,
    reload: () => reloads++, onDisconnect: () => resets++,
    schedule(fn, delay) { const id = ++next; timers.set(id, { fn, delay }); return id; },
    cancel(id) { timers.delete(id); },
  });
  return { socket, statuses, timers, stop, setReady(value) { ready = value; },
    get connects() { return connects; }, get reloads() { return reloads; }, get resets() { return resets; },
    tick() { const [id, task] = timers.entries().next().value; timers.delete(id); task.fn(); },
  };
}

test('capacity rejection keeps its actual reason and reconnects after another viewer leaves', () => {
  const view = fixture();
  view.socket.connected = true; view.socket.emit('connect');
  view.socket.emit('viewerBusy');
  view.socket.connected = false; view.socket.emit('disconnect', 'io server disconnect');
  assert.match(view.statuses.at(-1)[0], /连接已满/);
  assert.equal(view.timers.size, 1);
  assert.equal([...view.timers.values()][0].delay, 3000);
  view.tick(); assert.equal(view.connects, 1);
  view.socket.connected = true; view.socket.emit('connect'); view.socket.emit('version', '1.20.6');
  assert.equal(view.timers.size, 0);
  assert.equal(view.reloads, 0);
  assert.match(view.statuses.at(-1)[0], /同步世界/);
  view.stop();
});

test('repeated rejection backs off and never reloads a previously rendered page before admission', () => {
  const view = fixture(true);
  view.socket.connected = true; view.socket.emit('connect'); view.socket.emit('version');
  for (const delay of [3000, 6000, 12000, 15000, 15000]) {
    view.socket.emit('viewerBusy'); view.socket.connected = false;
    view.socket.emit('disconnect', 'io server disconnect');
    assert.equal([...view.timers.values()][0].delay, delay);
    view.tick(); view.socket.connected = true; view.socket.emit('connect');
    assert.equal(view.reloads, 0);
  }
  view.socket.emit('version', '1.20.6');
  assert.equal(view.reloads, 1);
  view.socket.emit('version', '1.20.6'); assert.equal(view.reloads, 1);
  view.stop();
});

test('stream reset retries once; unload cancels retries and releases listeners', () => {
  const view = fixture(true);
  view.socket.emit('connect'); view.socket.emit('version');
  view.socket.emit('disconnect', 'io server disconnect');
  assert.equal(view.resets, 1);
  assert.equal([...view.timers.values()][0].delay, 350);
  view.socket.emit('disconnect', 'io server disconnect');
  assert.equal(view.timers.size, 1);
  view.stop();
  assert.equal(view.timers.size, 0);
  for (const event of ['connect', 'version', 'viewerBusy', 'disconnect', 'connect_error'])
    assert.equal(view.socket.listenerCount(event), 0);
});
