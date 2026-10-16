import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Document, Element } from './fixtures/native-console-dom.mjs';
import { installAgentVisualization } from '../../src/modern-viewer/agent-visual-overlay.js';
import { installObsLayout, OBS_COMPONENTS } from '../../src/modern-viewer/obs-layout.js';
import { createViewerAgentBridge, createViewerAgentHub } from '../../host/viewer-agent.mjs';

function browser(bridgeOptions = {}) {
  let time = 0, next = 0; const frames = new Map(), intervals = new Map(), storage = new Map(), draws = [];
  const context = () => ({ save() {}, restore() {}, setTransform() {}, clearRect() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    stroke() { draws.push(['stroke', this.strokeStyle]); }, fill() { draws.push(['fill', this.fillStyle]); }, arc() {}, setLineDash() {},
    fillRect() {}, measureText: text => ({ width: text.length * 7 }), fillText() {}, translate(x, y) { draws.push(['translate', x, y]); } });
  class Dom extends Document {
    createElement(tag) {
      const element = super.createElement(tag);
      element.contains = child => child === element || element.children.some(el => el.contains?.(child));
      element.getClientRects = () => element.hidden ? [] : [element.getBoundingClientRect()];
      element.getBoundingClientRect = () => ({ left: 18, top: 280, right: 328, bottom: 450, width: 310, height: 170 });
      element.setPointerCapture = () => {}; element.select = () => {};
      if (tag === 'canvas') { const ctx = context(); element.getContext = () => ctx; element.width = 300; element.height = 150; }
      return element;
    }
    querySelector(selector) { if (selector === 'meta[name="viewer-style-nonce"]') return { content: 'test-nonce' }; return super.querySelector(selector); }
  }
  const document = new Dom(), window = new Element('window', document);
  Object.assign(window, { innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 2,
    performance: { now: () => time }, location: { search: '?obs=1&obsEdit=1', href: 'http://test/?obs=1&obsEdit=1' },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    getComputedStyle: el => ({ display: el.hidden ? 'none' : 'block' }), navigator: { clipboard: { async writeText(text) { window.copied = text; } } },
    requestAnimationFrame: callback => { const id = ++next; frames.set(id, callback); return id; }, cancelAnimationFrame: id => frames.delete(id),
    setInterval: callback => { const id = ++next; intervals.set(id, callback); return id; }, clearInterval: id => intervals.delete(id),
  });
  const layout = installObsLayout({ document, window });
  const socket = new EventEmitter(); socket.connected = true;
  const ui = installAgentVisualization({ socket, document, window, visible: id => layout.visible(id), project: p => ({ x: 600 + p.x * 5, y: 400 + p.z * 5 }) });
  const bot = new EventEmitter(); bot._client = new EventEmitter(); bot._client.state = 'play'; bot._client.write = () => {};
  bot.username = 'ag_demo'; bot.uuid = '00000000-0000-0000-0000-000000000001';
  bot.game = { gameMode: 'survival' }; bot.entity = { id: 1, position: { x: 0, y: 64, z: 0 }, yaw: 0, pitch: 0 };
  bot.controlState = { forward: true }; bot.entities = { 9: { position: { x: 5, y: 64, z: 8 } } };
  const bridge = createViewerAgentBridge(bot, { timers: false, now: () => time, hub: createViewerAgentHub(), ...bridgeOptions }); bridge.subscribeSocket(socket);
  const step = ms => { time += ms; const pending = [...frames]; frames.clear(); for (const [, callback] of pending) callback(time); };
  const byId = id => document.getElementById(id);
  const field = (key, prefix = 'obsField') => document.querySelectorAll('input').find(el => el.dataset[prefix] === key);
  return { document, window, layout, ui, bot, bridge, socket, draws, step, byId, field, frames, intervals,
    dispose() { bridge.dispose(); ui.dispose(); layout.dispose(); } };
}
const P = (x, z) => ({ x, y: 64, z });

test('different host decision sources produce distinct cards and target colors without inventing rejected routes', () => {
  const h = browser();
  try {
    h.bot.emit('viewer:decision', { id: 's1', source: 'system1', status: 'accepted', label: '接敌', from: P(0, 0), target: P(4, 8) });
    h.bot.emit('viewer:decision', { id: 's2', source: 'system2', status: 'accepted', label: '导航受理', from: P(0, 0), target: P(-4, 8) });
    h.bridge.flush(); h.step(40);
    const panel = h.byId('agent-decisions'), rows = panel.querySelector('.agent-decision-rows').children;
    assert.equal(panel.hidden, false); assert.match(panel.textContent, /系统一.*接敌.*系统二.*导航受理/s);
    assert.notEqual(rows[0].style.borderLeftColor, rows[1].style.borderLeftColor);
    for (const row of rows) assert.ok(h.draws.some(draw => draw[0] === 'stroke' && draw[1] === row.style.borderLeftColor));
    h.bot.emit('viewer:decision', { id: 'rejected', source: 'system1', status: 'rejected', label: '过期选择', from: P(0, 0), target: P(4, 8) });
    h.bridge.flush(); h.step(40); assert.match(panel.textContent, /未受理/);
    const check = h.document.querySelectorAll('input').find(el => el.getAttribute('aria-label') === '显示系统一与系统二的决策');
    check.checked = false; check.dispatch('change'); h.step(40); assert.equal(panel.hidden, true);
  } finally { h.dispose(); }
});

test('flight permission, coordinate route and real combined input stay distinct through the entire viewer', () => {
  let flight = { allowed: true, flying: false, mode: 'ground', expiresAtMs: 5000 };
  const h = browser({ getFlightState: () => flight });
  try {
    const panel = h.byId('agent-operations'), status = panel.querySelector('.agent-flight-status');
    assert.match(status.textContent, /尚未起飞/);
    flight = { ...flight, flying: true, mode: 'route', direction: { x: 0, y: 3, z: 0 } };
    h.bot.controlState = {}; h.bridge.flush();
    assert.match(status.textContent, /坐标飞行.*上升中/);
    const keys = panel.querySelector('.agent-control-keys').children;
    assert.ok([...keys].every(key => key.dataset.active === 'false'));
    flight.mode = 'input'; h.bot.controlState = { forward: true, jump: true, sprint: true }; h.bridge.flush();
    assert.match(status.textContent, /按键飞行/);
    assert.deepEqual([...keys].filter(key => key.dataset.active === 'true').map(key => key.textContent), ['前进', '上升', '加速']);
    h.bot.controlState = {}; flight = { allowed: false, flying: false }; h.bridge.flush();
    assert.match(status.textContent, /无飞行许可/); assert.equal(keys[4].textContent, '跳跃');
    h.step(3501); assert.equal(panel.hidden, true);
  } finally { h.dispose(); }
});
test('actual host packets reach the mounted overlay: route/candidate/gather colors, mouse and public summary', () => {
  const h = browser(); try {
    h.bridge.publish({ intent: { goal: '收集木材', summary: '<script>文字原样显示</script>' },
      route: { points: [P(0, 0), P(4, 8)] }, candidates: [{ id: 'alternate', points: [P(0, 0), P(-3, 8)] }] });
    h.bot._client.write('block_dig', { status: 0, location: P(4, 8) }); h.bridge.flush(); h.step(40);
    assert.equal(h.byId('agent-intent').hidden, false); assert.match(h.byId('agent-intent').textContent, /收集木材.*<script>/s);
    assert.equal(h.byId('agent-intent').querySelector('script'), null);
    assert.equal(h.byId('agent-route-map').hidden, false);
    assert.equal(h.byId('agent-operations').querySelector('.agent-recent-operations').dataset.role, 'gather');
    assert.equal(h.byId('agent-operations').querySelector('.agent-mouse').children[0].dataset.active, 'true');
    const pointer=h.byId('agent-pointer'),click=h.byId('agent-click-marker');
    assert.equal(pointer.hidden,false);assert.equal(pointer.dataset.source,'world');
    assert.equal(click.style.left,'620px');assert.equal(click.hidden,false);
    assert.notEqual(pointer.style.left,click.style.left,'pointer eases toward the exact click marker');
    for (const color of ['#4ee6b1', '#a6b7d4', '#ffbe55']) assert.ok(h.draws.some(row => row[0] === 'stroke' && row[1] === color));
    const check = h.document.querySelectorAll('input').find(el => el.getAttribute('aria-label') === '显示攻击、采集和交互标记');
    check.checked = false; check.dispatch('change'); h.step(40);
    assert.equal(h.byId('agent-action-markers').width, 1, 'hidden full-screen layers release backing storage');
    const cursorCheck=h.document.querySelectorAll('input').find(el=>el.getAttribute('aria-label')==='显示虚拟指针与点击反馈');
    cursorCheck.checked=false;cursorCheck.dispatch('change');h.step(40);assert.equal(pointer.hidden,true);assert.equal(click.hidden,true);
  } finally { h.dispose(); }
  assert.equal(h.frames.size, 0); assert.equal(h.intervals.size, 0); assert.equal(h.socket.listenerCount('agentVisualization'), 0);
});
test('OBS editor changes the new panels, preserves FOV/aspect, and exports a working bounded layout URL', async () => {
  const h = browser(); try {
    assert.equal(h.document.querySelector('[data-obs-layout-style]').nonce, 'test-nonce');
    assert.equal(h.document.querySelectorAll('button').filter(el => el.dataset.obsSelect).length, OBS_COMPONENTS.length);
    const fov = h.field('fov', 'obsCamera'); fov.value = '85'; fov.dispatch('change');
    const aspect = h.field('aspect', 'obsCamera'); aspect.value = String(4 / 3); aspect.dispatch('change');
    h.document.querySelectorAll('button').find(el => el.dataset.obsSelect === 'agentPresentation').dispatch('click');
    const scale = h.field('scale'); scale.value = '1.5'; scale.dispatch('input');
    const x = h.field('x'); x.value = '-12'; x.dispatch('input');
    assert.equal(h.layout.snapshot().components.agentPresentation.scale, 1.5);
    assert.equal(h.layout.camera().fov, 85); assert.equal(h.layout.camera().aspect, 4 / 3);
    assert.match(h.document.querySelector('[data-obs-layout-style]').textContent, /#agent-presentation\{translate:-12vw 0vh;scale:1.5;/);
    h.document.querySelectorAll('button').find(el => el.textContent === '复制布局链接').dispatch('click'); await Promise.resolve();
    const url = new URL(h.window.copied), value = JSON.parse(url.searchParams.get('obsLayout'));
    assert.equal(url.searchParams.has('obsEdit'), false); assert.equal(value.camera.fov, 85); assert.equal(value.components.agentPresentation.x, -12);
  } finally { h.dispose(); }
});
test('declarative animation advances; stale image callbacks cannot overwrite a replacement presentation', () => {
  const h = browser(); try {
    h.bridge.publish({ presentation: { id: 'anim', kind: 'scene', width: 300, height: 160, nodes: [
      { kind: 'circle', x: 10, y: 30, radius: 5, motion: { dx: 40, dy: 0, periodMs: 1000 } }] } });
    h.bridge.flush(); h.step(40); h.step(500);
    assert.ok(h.draws.filter(row => row[0] === 'translate').at(-1)[1] > 30);
    h.bridge.publish({ presentation: { id: 'image', kind: 'image', src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' } });
    h.bridge.flush(); const oldImage = h.byId('agent-presentation').querySelector('img'); assert.ok(oldImage.src.startsWith('data:image/gif'));
    h.bridge.publish({ presentation: { id: 'replacement', kind: 'card', text: '新的公开说明' } }); h.bridge.flush();
    oldImage.onerror(); assert.match(h.byId('agent-presentation').textContent, /新的公开说明/);
    assert.doesNotMatch(h.byId('agent-presentation').textContent, /无法解码/);
    h.socket.emit('disconnect'); assert.equal(h.byId('agent-presentation').hidden, true);
  } finally { h.dispose(); }
});
test('detachment, stream silence and page disposal hide and clear all prior actor layers', () => {
  const h = browser(); try {
    h.bridge.publish({ intent: { goal: '旧目标' }, markers: [{ id: 'a', kind: 'point', position: P(4, 8) }] }); h.bridge.flush(); h.step(40);
    h.socket.emit('viewerSession', { mode: 'observer', attached: false }); h.step(40);
    assert.equal(h.byId('agent-intent').hidden, true); assert.equal(h.byId('agent-custom-markers').width, 1);
    h.socket.emit('connect'); h.bridge.flush(true); assert.equal(h.byId('agent-intent').hidden, false);
    h.step(3501); assert.equal(h.byId('agent-intent').hidden, true); assert.equal(h.byId('agent-operations').hidden, true);
    h.window.dispatch('pagehide'); assert.equal(h.byId('agent-presentation'), null); assert.equal(h.frames.size, 0);
  } finally { h.dispose(); }
});
test('photo mode creates no Agent UI, socket listeners or animation loop', () => {
  const document = new Document(), socket = new EventEmitter();
  const ui = installAgentVisualization({ socket, document, photo: true }); assert.equal(ui.snapshot(), null);
  assert.equal(document.body.children.length, 0); assert.equal(socket.eventNames().length, 0); ui.dispose();
});
