import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

const source = readFileSync(new URL('../minecraft-viewer-panels.js', import.meta.url), 'utf8');
function overlay() {
  const events = new Map(), caption = { textContent: '' }, draws = { tiles: 0, clears: 0 };
  const context2d = { fillRect() { draws.tiles++; }, clearRect() { draws.clears++; },
    fillText() {}, beginPath() {}, arc() {}, fill() {} };
  const canvas = { width: 175, height: 175, getContext(type) { assert.equal(type, '2d'); return context2d; } };
  const context = createContext({ isObsOverlay: true, entityCache: new Map(), latestPosition: null,
    document: { body: { dataset: {} }, head: { append() {} }, createElement: () => ({}), getElementById: () => null,
      querySelector: selector => selector === '#corti-minimap canvas' ? canvas : selector === '[data-map-caption]' ? caption : null },
    window: { localStorage: { getItem: () => null }, addEventListener() {} },
    socket: { on: (name, callback) => events.set(name, callback) }, performance: { now: () => 0 },
    setInterval() {}, setTimeout() {}, clearTimeout() {},
    InventoryPlayerPreview: class { constructor() { throw Error('OBS must not start a 3D player preview'); } },
  });
  runInContext(source, context);
  const emit = (name, row) => events.get(name)?.(row);
  const map = (dimension = 'minecraft:overworld') => emit('minimap', { centerX: 1, centerZ: 2, radius: 12, sampleY: 64, dimension, cells: '.'.repeat(625) });
  return { emit, map, draws, caption, context };
}

test('OBS paints the existing 2D map without a world or player renderer and resets on disconnect', () => {
  const view = overlay(); view.map();
  assert.equal(view.draws.tiles, 626);
  assert.match(view.caption.textContent, /overworld/);
  view.emit('disconnect');
  assert.equal(view.draws.clears, 1);
  assert.equal(view.caption.textContent, '等待地图同步');
  assert.equal(runInContext('cortiMapCells.size', view.context), 0);
  view.map(); assert.equal(view.draws.tiles, 1252);
});

test('switching and detaching subjects clears old terrain but repeated same-subject snapshots retain it', () => {
  const view = overlay(), subject = { attached: true, playerUuid: 'a', entityId: 7, worldUuid: 'w', playerName: 'A' };
  view.emit('viewerSession', subject); view.map();
  const clears = view.draws.clears;
  view.emit('viewerSession', subject); assert.equal(view.draws.clears, clears);
  view.emit('viewerSession', { ...subject, playerUuid: 'b' }); assert.equal(view.draws.clears, clears + 1);
  assert.equal(runInContext('cortiMapCells.size', view.context), 0);
  view.map('minecraft:the_nether'); assert.match(view.caption.textContent, /the_nether/);
  view.emit('viewerSession', { attached: false }); assert.equal(view.caption.textContent, '等待地图同步');
});
