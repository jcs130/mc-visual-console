import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { AgentActivityHistory, normalizeAgentActivity } from '../../src/modern-viewer/agent-activity.js';
import { installAgentActivity } from '../../src/modern-viewer/agent-activity-ui.js';
import { createViewerAgentBridge, createViewerAgentHub, publishAgentActivity } from '../../host/viewer-agent.mjs';
import { Document, Element } from './fixtures/native-console-dom.mjs';
const row = (id, extra = {}) => ({ id, at: '2026-10-17T17:00:00Z', source: 'system2', kind: 'tool', title: '整理背包', status: 'started', ...extra });
test('bounded records redact structured secrets and authentication commands without changing tool identities', () => {
  const r = normalizeAgentActivity(row('call-1', { arguments: { api_key: 'private', headers: { Authorization: 'private' }, steps: [{ text: '/login password' }] }, text: '[console|PIN:1234] Bearer private-value' }));
  assert.equal(r.arguments.api_key, '[已隐藏]'); assert.equal(r.arguments.headers, '[已隐藏]');
  assert.doesNotMatch(JSON.stringify(r), /password|private|1234/); assert.equal(r.id, 'call-1');
  assert.equal(normalizeAgentActivity(row('bad', { kind: 'prompt' })), null);
});
test('tool call updates retain arguments and bounded history replaces one identity instead of duplicating rows', () => {
  const h = new AgentActivityHistory({ limit: 2 }); h.put(row('a', { arguments: { count: 2 } })); h.put(row('a', { status: 'accepted', result: { text: '任务#5已受理' } }));
  assert.equal(h.snapshot().length, 1); assert.deepEqual(h.snapshot()[0].arguments, { count: 2 });
  assert.equal(h.snapshot()[0].status, 'accepted'); h.put(row('b')); h.put(row('c')); assert.deepEqual(h.snapshot().map(r => r.id), ['b', 'c']);
});
test('trusted host activity uses incremental frames, drawing uploads cannot create it, and unsubscribe cleans listeners', () => {
  const bot = Object.assign(new EventEmitter(), { username: 'demo', uuid: '00000000-0000-0000-0000-000000000001',
    _client: { state: 'play', write() {} }, game: { gameMode: 'survival' }, entity: { id: 1, position: { x: 0, y: 64, z: 0 } }, controlState: {} });
  const bridge = createViewerAgentBridge(bot, { timers: false, hub: createViewerAgentHub() }); const socket = new EventEmitter(); socket.connected = true;
  const frames = []; socket.on('agentActivity', f => frames.push(f)); bridge.subscribeSocket(socket); const initial = frames.length;
  bridge.publish({ activity: row('forged') }); bridge.flush(); assert.equal(frames.length, initial);
  bot.emit('viewer:activity', row('actual')); bridge.flush(); assert.equal(frames.at(-1).records[0].id, 'actual');
  const count = frames.length; bridge.flush(); bridge.flush(); assert.equal(frames.length, count, 'no 10Hz history rebroadcast');
  bot.emit('viewer:activity', row('next')); bridge.flush(); assert.deepEqual(frames.at(-1).records.map(r => r.id), ['next']);
  bridge.dispose(); assert.equal(bot.listenerCount('viewer:activity'), 0);
});
test('UI distinguishes sources, preserves expansion, renders text safely and never invents unreturned reasoning', () => {
  const document = new Document(), window = new Element('window', document); const timers = new Map(); let id = 0;
  Object.assign(window, { setTimeout: f => { timers.set(++id, f); return id; }, clearTimeout: n => timers.delete(n), setInterval: () => ++id, clearInterval() {} });
  const socket = new EventEmitter(), ui = installAgentActivity({ document, window, socket });
  const send = records => { socket.emit('agentActivity', { schema: 'agent-activity-frame/v1', available: true, records }); ui.render(); };
  send([row('r', { kind: 'reasoning', text: '<script>actual thought</script>' }), row('s1', { source: 'system1', kind: 'decision', text: 'retreat' }), row('missing', { kind: 'reasoning' })]);
  const list = document.querySelector('.agent-activity-list'); assert.equal(list.children.length, 3);
  const first = list.children[0]; first.open = true;
  assert.notEqual(first.style.borderLeftColor, list.children[1].style.borderLeftColor);
  assert.match(first.textContent, /<script>actual thought/); assert.equal(first.querySelector('script'), null);
  assert.match(list.children[2].textContent, /未返回可展示/);
  send([row('r', { kind: 'reasoning', text: 'updated actual text' })]); assert.equal(list.children[0], first); assert.equal(first.open, true);
  ui.dispose(); assert.equal(socket.listenerCount('agentActivity'), 0);
});
test('actual host records published before viewer attachment survive bootstrap without replaying actions', () => {
  const bot = Object.assign(new EventEmitter(), { username: 'demo', uuid: '00000000-0000-0000-0000-000000000002',
    _client: { state: 'play', write() {} }, game: { gameMode: 'survival' }, entity: { id: 2, position: { x: 0, y: 64, z: 0 } }, controlState: {} });
  publishAgentActivity(bot, row('before-viewer')); const bridge = createViewerAgentBridge(bot, { timers: false, hub: createViewerAgentHub() });
  const socket = new EventEmitter(); socket.connected = true; const frames = []; socket.on('agentActivity', f => frames.push(f)); bridge.subscribeSocket(socket);
  assert.equal(frames.at(-1).records[0].id, 'before-viewer'); bridge.dispose();
});
