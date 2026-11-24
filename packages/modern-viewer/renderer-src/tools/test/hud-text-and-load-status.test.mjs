import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const src = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const ctx = {}; ctx.globalThis = ctx;
vm.runInNewContext(await readFile(`${src}/tools/minecraft-viewer-hud-text.js`, 'utf8'), ctx);
const { cortiHudText, cortiHudTextInfo } = ctx;
const { chunkDiagnosticsEnabled, viewerLoadStatus, setChunkDiagnosticsPreference, CHUNK_DEBUG_STORAGE_KEY } = await import(`${src}/src/modern-viewer/load-status.js`);
const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

// Shape of the live CustomNameplates-style boss bar (codepoint shape sampled from a live server on 2026-11-24; text replaced).
const glyphBar = '\uB001\uF800\uB009\uF800\uB006\uF800\uB005\uF813\uF80E\uB04A 12:00 | 12:10\uF832  ' +
  '\uB001\uF800\uB009\uF813\uF812\uF809\uB04C 森林 | 1 2 3\uF832  \uB001\uF811\uF802\uB04F 180\uF832 \uB001\uF80F\uF806\uB050 0\uF832';

test('boss bar with private glyphs and shift characters becomes readable segments', () => {
  const info = cortiHudTextInfo(glyphBar);
  assert.equal(info.text, '12:00 | 12:10 · 森林 | 1 2 3 · 180 · 0');
  assert.equal(info.composite, true);
  assert.ok(info.privateGlyphs >= 8);
  assert.ok(info.shifts >= 10);
  assert.doesNotMatch(info.text, /[\uE000-\uF8FF\uAC00-\uD7A3]/u);
});

test('private-use glyphs never reach the screen, including supplementary planes', () => {
  assert.equal(cortiHudText('\uE001金币 12\uE002'), '金币 12');
  assert.equal(cortiHudText('\u{F0001}\u{100001}等级 5'), '等级 5');
  assert.equal(cortiHudText('\uF801\uF802'), '');
});

test('legacy section codes and hex colours are removed; hidden § entry names become empty', () => {
  assert.equal(cortiHudText('§x§f§f§0§0§0§0红色§l粗体§r'), '红色粗体');
  assert.equal(cortiHudTextInfo('§0§1§r').text, '');
  assert.equal(cortiHudTextInfo('§0§1§r').legacyCodes, 3);
  assert.equal(cortiHudText('孤立§'), '孤立');
});

test('real Hangul without shift characters is kept, control characters are dropped', () => {
  assert.equal(cortiHudText('안녕 world'), '안녕 world');
  assert.equal(cortiHudText('a\u0007b\u200Bc'), 'abc');
  assert.equal(cortiHudText('一\n二'), '一 二');
  assert.equal(cortiHudText('一\n二', { keepNewlines: true }), '一\n二');
});

test('long text is cut by codepoint with an ellipsis', () => {
  const out = cortiHudText('汉'.repeat(50), { limit: 10 });
  assert.equal([...out].length, 10); assert.ok(out.endsWith('…'));
});

test('English chunk diagnostics are off by default and only opt in explicitly', () => {
  assert.equal(chunkDiagnosticsEnabled('', null), false);
  assert.equal(chunkDiagnosticsEnabled('?view=third', memory()), false);
  assert.equal(chunkDiagnosticsEnabled('?debugChunks=1', null), true);
  const store = memory();
  setChunkDiagnosticsPreference(store, true);
  assert.equal(store.getItem(CHUNK_DEBUG_STORAGE_KEY), '1');
  assert.equal(chunkDiagnosticsEnabled('', store), true);
  assert.equal(chunkDiagnosticsEnabled('?debugChunks=0', store), false);
  setChunkDiagnosticsPreference(store, false);
  assert.equal(chunkDiagnosticsEnabled('', store), false);
});

test('default status line is one short Chinese line with a stable grid denominator', () => {
  const loading = viewerLoadStatus({ grid: 81, received: 37, meshed: 28, pendingNear: 53, sectionsWaiting: 600, animation: { loading: true, phase: 'images', loaded: 29, total: 63 } });
  assert.equal(loading.text, '画面加载中 · 已同步 28/81 区块 · 动画准备中 29/63');
  assert.equal(loading.settled, false);
  const ready = viewerLoadStatus({ grid: 81, received: 81, meshed: 81, pendingNear: 0, animation: { loading: false, sprites: 63, errors: 0 } });
  assert.equal(ready.text, '画面就绪 · 已同步 81/81 区块 · 动画就绪'); assert.equal(ready.settled, true);
  // Server never sends the outer ring: everything received is meshed and idle -> still settles.
  const edge = viewerLoadStatus({ grid: 81, received: 49, meshed: 49, pendingNear: 32, sectionsWaiting: 0, animation: { loading: false, sprites: 63 } });
  assert.equal(edge.settled, true); assert.match(edge.text, /^画面就绪 · 已同步 49\/81 区块/);
  assert.equal(viewerLoadStatus({ grid: 81, received: 0, pendingNear: 81 }).text, '画面加载中 · 等待区块 · 动画准备中');
  assert.equal(viewerLoadStatus({ connected: false }).text, '画面未连接 · 正在重试');
  for (const s of [loading, ready, edge]) { assert.doesNotMatch(s.text, /[A-Za-z]/); assert.doesNotMatch(s.text, /\n/); }
});

test('nametag text handed to the renderer is cleaned; cache identity untouched; empty hides the tag', async () => {
  const { rendererNameTagEntity } = await import(`${src}/src/modern-viewer/nametag-text.js`);
  const real = { id: 1, username: 'nearby_player42' };
  assert.equal(rendererNameTagEntity(real, cortiHudText), real);
  const glyph = { id: 2, username: '\uE001§a玩家\uF801' };
  const out = rendererNameTagEntity(glyph, cortiHudText);
  assert.equal(out.username, '玩家'); assert.equal(glyph.username, '\uE001§a玩家\uF801');
  assert.equal(rendererNameTagEntity({ id: 3, username: '§0§1§r\uE000' }, cortiHudText).username, 'EMPTY');
  assert.equal(rendererNameTagEntity({ id: 4 }, cortiHudText).username, undefined);
});

test('debug panel keeps a margin, wraps long paths and summarises animation progress', async () => {
  const client = await readFile(`${src}/src/modern-viewer/client.js`, 'utf8');
  assert.match(client, /right: "16px", bottom: "16px"/);
  assert.match(client, /maxWidth: "min\(520px, 44vw, calc\(100vw - 32px\)\)"/);
  assert.match(client, /overflowWrap: "anywhere"/);
  assert.match(client, /formatAtlasAnimationDiagnostics\(globalThis\.atlasAnimationDiagnostics/);
  assert.doesNotMatch(client, /atlas animation \$\{JSON\.stringify/);
  assert.equal((client.match(/rendererNameTagEntity\(/g) ?? []).length, 2);
  const build = await readFile(`${src}/tools/build-minecraft-viewer-client.mjs`, 'utf8');
  assert.match(build, /rendererNameTagEntity\(isMove \? normalized : rendererEntityEquipment/);
});

test('client wiring: diagnostics gated, status installed, HUD handlers sanitize', async () => {
  const client = await readFile(`${src}/src/modern-viewer/client.js`, 'utf8');
  assert.match(client, /let showChunkDiagnostics = chunkDiagnosticsEnabled\(location\.search, sceneStorage\);/);
  assert.match(client, /function installChunkDiagnostics\(\) \{\n  if \(!showChunkDiagnostics \|\| chunkDiagnosticsElement\) return;/);
  assert.doesNotMatch(client, /queryValue\("debugChunks"\)/);
  assert.match(client, /installLoadStatus\(\);/);
  const events = await readFile(`${src}/tools/minecraft-viewer-events.js`, 'utf8');
  assert.match(events, /cortiHudTextInfo\(bar\.title/);
  assert.match(events, /cortiHudText\(event\.text/);
  const presentation = await readFile(`${src}/tools/minecraft-viewer-presentation.js`, 'utf8');
  assert.match(presentation, /socket\.on\('serverDisplayState', cortiPresentationDisplayState\)/);
  const build = await readFile(`${src}/tools/build-minecraft-viewer-client.mjs`, 'utf8');
  assert.match(build, /\$\{hudTextSource\}\\n\$\{hudSource\}/);
});
