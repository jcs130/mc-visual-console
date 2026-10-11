import assert from 'node:assert/strict';
import test from 'node:test';
import { OBS_COMPONENTS, normalizeObsLayout, readObsLayout, obsLayoutUrl, moveObsComponent } from '../../src/modern-viewer/obs-layout.js';

test('default overlay includes hands and minimap; malformed storage cannot hide everything or inject CSS', () => {
  const layout = normalizeObsLayout(null);
  assert.equal(layout.components.hands.visible, true); assert.equal(layout.components.minimap.visible, true);
  assert.equal(layout.components.crosshair.visible, false); assert.equal(Object.keys(layout.components).length, OBS_COMPONENTS.length);
  assert.deepEqual(readObsLayout({ query: new URLSearchParams('obsLayout=broken'), storage: { getItem() { throw Error('blocked'); } } }), layout);
  const bad = normalizeObsLayout({ version: 1, components: { hands: { visible: 'false', x: Infinity, y: -1000, scale: '1);body{display:none}' }, fake: { scale: 2 } } });
  assert.deepEqual(bad.components.hands, { visible: true, x: 0, y: -100, scale: 1 });
  assert.equal(bad.components.fake, undefined);
});
test('shared layout link works across browsers, preserves host path options and never opens the editor in OBS', () => {
  const initial = normalizeObsLayout(null); initial.components.hands = { visible: false, scale: 1.6, x: 12, y: -4 };
  const url = new URL(obsLayoutUrl('http://viewer.test:7793/third/?obsEdit=1&photo=1&fov=95#x', initial));
  assert.equal(url.pathname, '/'); assert.equal(url.searchParams.get('obs'), '1');
  assert.equal(url.searchParams.has('obsEdit'), false); assert.equal(url.searchParams.has('photo'), false); assert.equal(url.searchParams.get('fov'), '95');
  assert.deepEqual(readObsLayout({ query: url.searchParams, storage: { getItem: () => 'bad old settings' } }), initial);
  assert.ok(url.href.length < 500, 'a one-component edit should produce a short portable link');
  assert.deepEqual(normalizeObsLayout({ version: 100 }), normalizeObsLayout(null));
});
test('drag offsets are relative to the viewport and size/position are bounded', () => {
  const row = { visible: true, x: 0, y: -5, scale: 1.4 };
  assert.deepEqual(moveObsComponent(row, 192, 108, { width: 1920, height: 1080 }), { ...row, x: 10, y: 5 });
  assert.equal(moveObsComponent(row, 3000, -3000, { width: 100, height: 100 }).x, 100);
  const layout = normalizeObsLayout({ version: 1, components: { hands: { ...row, scale: 10 } } });
  assert.equal(layout.components.hands.scale, 3); assert.equal(row.x, 0);
});
