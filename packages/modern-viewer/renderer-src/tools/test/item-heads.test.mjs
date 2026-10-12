import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { itemHeadProfile, itemDisplayName, withItemVisualIdentity, minecraftTextureHash } from '../../src/modern-viewer/item-profile.js';
import { headModelFaces, headDisplayMatrix, ItemHeadRenderer } from '../../src/modern-viewer/item-heads.js';
import { createViewerHeadTextures } from '../../host/viewer-head-textures.mjs';
import { serializeViewerItem } from '../../../src/mc-modern-viewer.mts';

const hash = '8dcc6eb40f3bada41e4339888d6d207437598bdbd175c2e731191d5a9a42d3c8';
const profile = { properties: [{ name: 'textures', value: btoa(JSON.stringify({ textures: { SKIN: { url: 'http://textures.minecraft.net/texture/' + hash } } })) }] };
const backpack = { name: 'player_head', displayName: 'Player Head', count: 1, type: 1100, components: [
  { type: 'profile', data: profile }, { type: 'custom_name', data: { type: 'compound', value: { text: { type: 'string', value: '§e大背包' } } } },
] };
test('native 1.20.6 components, maps, legacy NBT and derived host profiles keep original identity', () => {
  assert.deepEqual(itemHeadProfile(backpack), { status: 'ready', hash });
  assert.equal(itemDisplayName(backpack), '大背包');
  assert.equal(itemHeadProfile({ ...backpack, components: { 'minecraft:profile': profile } }).hash, hash);
  const compound = value => ({ type: 'compound', value });
  const textures = { type: 'list', value: { type: 'compound', value: [{ Value: { type: 'string', value: profile.properties[0].value } }] } };
  const nbt = compound({ SkullOwner: compound({ Properties: compound({ textures }) }) });
  assert.equal(itemHeadProfile({ name: 'player_head', nbt }).hash, hash);
  assert.equal(itemHeadProfile({ name: 'player_head', headTextureHash: hash }).hash, hash);
  assert.equal(itemHeadProfile({ name: 'stone', headTextureHash: hash }), null);
  assert.equal(itemHeadProfile({ name: 'player_head', displayName: '大背包' }), null, 'names cannot invent profiles');
});
test('the actual shared host serializer preserves nested profile properties and typed custom names', () => {
  const result = serializeViewerItem({ version: '1.20.6' }, backpack, 36);
  assert.equal(result.displayName, '大背包'); assert.equal(result.headTextureHash, hash);
  assert.equal(itemHeadProfile(result).hash, hash);
  assert.equal(result.components[0].data.properties[0].value, profile.properties[0].value);
  assert.equal(withItemVisualIdentity(backpack).name, 'player_head', 'wire type is preserved');
  const large = { ...backpack, components: [...backpack.components, { type: 'lore', data: Array(64).fill('x'.repeat(2000)) }] };
  const bounded = serializeViewerItem({ version: '1.20.6' }, large, 36);
  assert.equal(bounded.visualDataUnavailable, true); assert(JSON.stringify(bounded).length < 40000);
  assert.equal(itemHeadProfile(bounded).status, 'unavailable');
});
test('malformed, removed and unsupported profiles never use a previous cached profile', () => {
  for (const data of [null, { properties: { textures: {} } }, { properties: [] }, { properties: [{ name: 'textures', value: '**invalid**' }] }])
    assert.deepEqual(itemHeadProfile({ ...backpack, headTextureHash: hash, components: [{ type: 'profile', data }] }), { status: 'unavailable', hash: null });
  for (const url of ['http://127.0.0.1/texture/' + hash, 'https://textures.minecraft.net.evil/texture/' + hash,
    'https://textures.minecraft.net:123/texture/' + hash, 'https://textures.minecraft.net/texture/' + hash + '?x=1']) assert.equal(minecraftTextureHash(url), null);
});
function fakePng() {
  const bytes = Buffer.alloc(32); Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes); bytes.writeUInt32BE(64, 16); bytes.writeUInt32BE(32, 20); return bytes;
}
test('texture proxy permits only observed hashes and deduplicates simultaneous requests', async () => {
  let calls = 0;
  const proxy = createViewerHeadTextures({ fetcher: async (url, options) => {
    calls++; assert.equal(url, 'https://textures.minecraft.net/texture/' + hash); assert.equal(options.redirect, 'error');
    return new Response(fakePng());
  } });
  assert.equal(await proxy.read(hash), null); assert.equal(calls, 0);
  proxy.observeBot({ inventory: { slots: [backpack] } });
  const results = await Promise.all([proxy.read(hash), proxy.read(hash)]);
  assert.equal(calls, 1); assert.deepEqual(results[0], fakePng()); assert.equal(results[0], results[1]);
});
test('invalid texture response is bounded, negatively cached and never treated as a skin', async () => {
  let calls = 0, at = 0;
  const proxy = createViewerHeadTextures({ now: () => at, fetcher: async () => { calls++; return new Response('not a PNG'); } });
  proxy.observeItem(backpack); assert.equal(await proxy.read(hash), null); assert.equal(await proxy.read(hash), null); assert.equal(calls, 1);
  at = 31000; await proxy.read(hash); assert.equal(calls, 2);
});
test('native head has both complete six-face layers with original UV ranges', () => {
  const faces = headModelFaces(); assert.equal(faces.length, 12);
  assert(faces.every(f => f.uv.every(n => Number.isFinite(n) && n >= 0 && n <= 1)));
  assert.equal(new Set(faces.map(f => f.direction)).size, 6);
  for (const context of ['firstperson', 'thirdperson', 'gui', 'fixed', 'ground'])
    assert(headDisplayMatrix(context).elements.every(Number.isFinite), context);
  assert.equal(headDisplayMatrix('gui').elements[13], 3/16);
  assert.equal(headDisplayMatrix('fixed').elements[13], 4/16);
});
test('all icon paths suppress generic player heads while known profiles load or fail', async () => {
  const source = await readFile(new URL('../minecraft-viewer-item-icon.js', import.meta.url), 'utf8');
  const registry = new ItemHeadRenderer(), ctx = { paperItemHeads: registry, itemDisplayName };
  runInNewContext(source.slice(0, source.indexOf('function cortiDurability')), ctx);
  assert.equal(ctx.cortiItemIconUrl(backpack), null);
  assert.equal(ctx.cortiItemLabel(backpack), '大背包');
  assert.equal(ctx.cortiItemIconUrl({ name: 'player_head' }), '/icons/player_head.png');
  assert.equal(ctx.cortiItemIconUrl({ name: 'stone' }), '/icons/stone.png');
});
test('disposing a hand before its profile loads cannot revive an old model', async () => {
  let complete;
  const registry = new ItemHeadRenderer({ imageLoader: () => new Promise(resolve => { complete = resolve; }) });
  const instance = registry.create(backpack); instance.dispose();
  const oldDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({ drawImage() {} }) }) };
  try { complete({ width: 64, height: 32 }); await instance.ready; assert.equal(instance.root.children.length, 0); }
  finally { globalThis.document = oldDocument; }
});
