import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { patchRendererPlayerSkin } from '../minecraft-viewer-player-skin.mjs';

const require = createRequire(import.meta.url);
const source = patchRendererPlayerSkin(readFileSync(require.resolve('minecraft-renderer/dist/minecraft-renderer.js'), 'utf8'));
const start = source.indexOf('async updatePlayerSkin(');
const end = source.indexOf('async loadAndApplyCape(', start);

test('the pinned skin fetch rejects disabled, non-PNG and oversized responses before image decoding', async () => {
  const definition=source.match(/var Lv=async n=>\{[\s\S]*?\};function Gg/)[0].replace(';function Gg','');
  let response;
  const load=runInNewContext(definition+';Lv',{fetch:async()=>response,O:Buffer,Uint8Array,Error});
  response=new Response('Remote texture retrieval is disabled',{status:503});
  await assert.rejects(load('/head-texture/test.png'),/SKIN_TEXTURE_UNAVAILABLE_HTTP_503/);
  response=new Response('not an image',{headers:{'content-type':'text/plain'}});
  await assert.rejects(load('/head-texture/test.png'),/SKIN_TEXTURE_CONTENT_TYPE/);
  response=new Response(Buffer.alloc(65537),{headers:{'content-type':'image/png'}});
  await assert.rejects(load('/head-texture/test.png'),/SKIN_TEXTURE_FORMAT/);
  const png=Buffer.alloc(24);png.set([137,80,78,71,13,10,26,10]);
  response=new Response(png,{headers:{'content-type':'image/png; charset=binary'}});
  assert.equal(await load('/head-texture/test.png'),'data:image/png;base64,'+png.toString('base64'));
});

test('skin loading completes after decode and rejects late profiles and default textures', async () => {
  const pending = new Map();
  const player = { skin: {}, ears: {}, cape: {}, elytra: {} };
  let updates = 0;
  const Loader = runInNewContext(`class Loader {
    currentSkinUrls = {}; uuidPerSkinUrlsCache = {}; loadedSkinEntityIds = new Set();
    worldRenderer = { worldRendererConfig: {}, playerStateReactive: {} };
    getPlayerObject() { return player; }
    onSkinUpdate() { updated(); }
    ${source.slice(start, end)}
  }; Loader`, {
    player, updated: () => updates++, lt: 'default.png', Di: () => 'default', M1() {},
    j: { NearestFilter: 1, CanvasTexture: class { constructor(canvas) { this.image = canvas; } dispose() {} } },
    Bt: url => new Promise(resolve => pending.set(url, resolve)),
  });
  const loader = new Loader();
  const fallback = loader.loadAndApplySkin(7, 'default.png', false);
  const old = loader.updatePlayerSkin(7, 'Visitor', 'profile-id', 'old.png');
  const current = loader.updatePlayerSkin(7, 'Visitor', 'profile-id', 'current.png');
  pending.get('current.png')({ canvas: { name: 'current' } });
  await current;
  assert.equal(player.skin.map.image.name, 'current', 'resolved update includes decoded skin');
  pending.get('old.png')({ canvas: { name: 'old' } });
  await old;
  pending.get('default.png')({ canvas: { name: 'fallback' } });
  await fallback;
  assert.equal(player.skin.map.image.name, 'current');
  assert.equal(updates, 1, 'stale results never replace the visible texture');
});
