import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import * as THREE from 'three';
import { installAppearanceSettings } from '../../src/modern-viewer/appearance-settings.js';
import { PaperYsmPlayers } from '../../src/modern-viewer/paper-ysm.js';
import { NativeSelfPlayerController } from '../../src/native-viewer/native-self-player.js';
import { nativeAppearanceChoices, nativeWebAppearanceBinding } from '../../src/native-viewer/native-appearance.js';
import { NATIVE_YSM_SOURCE, NATIVE_YSM_JAR_SHA256 } from '../../src/native-viewer/native-ysm-state.js';
import { NativeAssetReader } from '../../src/native-viewer/model-loader.js';
import { Document, Element } from './fixtures/native-console-dom.mjs';

const UUID = '01234567-89ab-cdef-0123-456789abcdef', OTHER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const assets = fileURLToPath(new URL('../../../asset-packs/native-1.21.1/', import.meta.url));
const manifest = JSON.parse(await readFile(join(assets, 'native-assets.json'), 'utf8'));
const settle = () => new Promise(resolve => setImmediate(resolve));
const observed = patch => ({ schemaVersion: 1, source: 'freesia_worker', playerUuid: UUID, entityId: 3, epoch: 1,
  available: true, renderAvailable: true, modelId: 'server-model', assetSha256: 'a', texture: 'blue', ...patch });
const bundle = (hash, id = 'server-model') => ({ schemaVersion: 1, format: 'ysm-bedrock-original', assetSha256: hash, modelId: id,
  model: 'm.json', animation: 'a.json', textures: { blue: 'blue.png', red: 'red.png' },
  files: Object.fromEntries(['ysm.json', 'm.json', 'a.json', 'blue.png', 'red.png'].map(p => [p, { base64: '' }])) });
function paperHarness(createActor) {
  const entity = { uuid: UUID, pos: { x: 0, y: 0, z: 0 } }, rendered = new THREE.Group(), mesh = new THREE.Group();
  mesh.name = 'mesh'; const skin = new THREE.Group(), name = new THREE.Group(); name.name = 'nametag'; mesh.add(skin, name); rendered.add(mesh);
  const players = new PaperYsmPlayers({ entity: () => entity, rendered: () => rendered, createActor });
  players.asset(bundle('a')); players.asset(bundle('b', 'second-model')); players.state(observed());
  return { players, entity, rendered, skin, name };
}
function actor(assetInfo) {
  return { root: new THREE.Group(), assetInfo: { ...assetInfo, bindSizeBlocks: [1, 2, 1] }, disposed: 0,
    animate() {}, dispose() { this.disposed++; this.root.removeFromParent(); } };
}

test('chooser uses text, rejects unknown IDs, restores server, and cleans up without transport or storage', () => {
  const document = new Document(), window = new Element('window', document), selections = [];
  window.localStorage = { setItem() { assert.fail('appearance must not leak between players'); } };
  const ui = installAppearanceSettings({ document, window, onChange: id => selections.push(id) });
  const select = document.querySelector('select'), button = document.querySelector('button');
  assert.equal(select.disabled, true); select.value = 'skin'; select.dispatch('change'); assert.equal(selections.length, 0);
  const snapshot = { available: true, selected: 'server', choices: [{ id: 'server', label: '跟随服务器' }, { id: 'test', label: '<img src=x onerror=alert(1)>' }], subject: '<script>player</script>' };
  ui.update(snapshot); assert.equal(select.children[1].textContent, snapshot.choices[1].label); assert.equal(document.querySelector('img'), null);
  const option = select.children[1]; ui.update(snapshot); assert.equal(select.children[1], option, 'status refresh must not replace open options');
  select.value = 'unknown'; select.dispatch('change'); assert.deepEqual(selections, []);
  select.value = 'test'; select.dispatch('change'); assert.deepEqual(selections, ['test']);
  ui.update({ ...snapshot, selected: 'test' }); button.dispatch('click'); assert.deepEqual(selections, ['test', 'server']);
  ui.update(null); assert.equal(select.disabled, true); assert.equal(select.value, 'server');
  window.dispatch('pagehide'); assert.equal(document.querySelector('details'), null); select.dispatch('change'); assert.equal(selections.length, 2);
  assert.equal(window.listeners.get('keydown').length, 0);
  installAppearanceSettings({ document, window, hidden: true }).update(snapshot); assert.equal(document.body.children.length, 0);
});

test('Paper overrides preserve server observations, nametags and latest server appearance on restore', async () => {
  const loaded = [], h = paperHarness(async (b, texture) => { const a = actor({ modelId: b.modelId, texture }); loaded.push(a); return a; });
  const original = h.players.states.get(UUID);
  assert.equal(h.players.select(UUID, 'ysm:b:red'), true); h.players.tick(0); await settle();
  assert.equal(h.players.states.get(UUID), original); assert.equal(original.texture, 'blue'); assert.equal(h.skin.visible, false); assert.equal(h.name.visible, true);
  assert.equal(loaded[0].assetInfo.selectionSource, 'web_viewer_override');
  h.players.state(observed({ texture: 'red' })); h.players.tick(16); await settle();
  assert.equal(loaded.length, 1, 'server changes cannot rebuild the unchanged local override');
  h.players.select(UUID, 'server'); assert.equal(h.skin.visible, true); assert.equal(loaded[0].disposed, 1);
  h.players.tick(32); await settle(); assert.equal(loaded[1].assetInfo.modelId, 'server-model'); assert.equal(loaded[1].assetInfo.texture, 'red');
  h.players.select(UUID, 'skin'); h.players.tick(48); await settle(); assert.equal(h.skin.visible, true); assert.equal(h.players.stats().rendered, 0);
  h.players.clear(); assert.equal(h.players.selection(UUID).selected, 'server');
});

test('Paper rapid changes, entity reuse and disconnect dispose stale asynchronous models', async () => {
  const pending = [], h = paperHarness((b, texture) => new Promise(resolve => pending.push(() => { const a = actor({ modelId: b.modelId, texture }); resolve(a); return a; })));
  h.players.select(UUID, 'ysm:b:red'); h.players.tick(0);
  h.players.select(UUID, 'ysm:b:blue'); h.players.tick(1);
  const second = pending[1](); await settle(); const first = pending[0](); await settle();
  assert.equal(first.disposed, 1); assert.equal(second.disposed, 0); assert.equal(h.players.stats().rendered, 1);
  h.entity.uuid = OTHER; h.players.tick(2); assert.equal(second.disposed, 1); assert.equal(h.players.select(UUID, 'skin'), false);
  h.entity.uuid = UUID; h.players.tick(3); h.players.clear(); const third = pending[2](); await settle();
  assert.equal(third.disposed, 1); assert.equal(h.players.selection(UUID).selected, 'server'); assert.equal(h.skin.visible, true);
});

test('Paper epoch resets and cache eviction explicitly clear overrides; failures are visible and retryable', async () => {
  let fail = true;
  const { players } = paperHarness(async (b, texture) => { if (fail) throw Error('YSM_SOURCE_MISSING'); return actor({ modelId: b.modelId, texture }); });
  assert.equal(players.select(UUID, 'ysm:unrequested:red'), false);
  players.select(UUID, 'ysm:b:red'); players.tick(0); await settle(); assert.match(players.selection(UUID).status, /渲染失败.*YSM_SOURCE_MISSING/);
  fail = false; players.select(UUID, 'ysm:b:red'); players.tick(1); await settle(); assert.equal(players.stats().rendered, 1);
  players.state(observed({ epoch: 2 })); assert.equal(players.selection(UUID).selected, 'server');
  players.select(UUID, 'ysm:a:red'); for (let i = 0; i < 32; i++) players.asset(bundle(`next-${i}`));
  assert.equal(players.selection(UUID).selected, 'server'); assert.match(players.selection(UUID).status, /资源已过期/); assert.equal(players.assets.size, 32);
  players.clear();
});

test('Paper changing the observed player clears its override even after the old entity disappears', async () => {
  const h = paperHarness(async (b, texture) => actor({ modelId: b.modelId, texture }));
  h.players.select(UUID, 'ysm:b:red'); h.players.tick(0); await settle();
  const mounted = h.players.actors.get(UUID).actor;
  h.entity.uuid = OTHER;
  h.players.resetSelection(UUID);
  assert.equal(mounted.disposed, 1); assert.equal(h.players.selection(UUID).selected, 'server');
  h.entity.uuid = UUID; h.players.tick(1); await settle();
  assert.equal(h.players.actors.get(UUID).actor.assetInfo.modelId, 'server-model');
  h.players.clear();
});

const ysm = patch => ({ source: NATIVE_YSM_SOURCE, available: true, installed: true, enabled: true, mandatory: true,
  playerUuid: UUID, modelId: 'misc/3_default_boy', texture: 'blue', ysmVersion: '2.6.5', jarSha256: NATIVE_YSM_JAR_SHA256, ...patch });
const self = { uuid: UUID, skin: { kind: 'default', assetPath: 'skin.png', sha256: 'test' } };

test('native choices are limited to exact original assets; no wrong version, override or foreign UUID', () => {
  const choices = nativeAppearanceChoices(manifest); assert.equal(choices.length, 5);
  assert.equal(nativeAppearanceChoices({ ...manifest, clientJarSha256: 'wrong' }).length, 1);
  const tampered = structuredClone(manifest), source = tampered.sources.find(s => s.sha256 === NATIVE_YSM_JAR_SHA256); source.explicitOverride = true;
  assert.equal(nativeAppearanceChoices(tampered).length, 1);
  const bound = nativeWebAppearanceBinding(self, UUID, 'native:misc/3_default_boy:red', manifest);
  assert.deepEqual(bound.webAppearance, { modelId: 'misc/3_default_boy', texture: 'red' }); assert.equal(bound.ysm, undefined);
  assert.throws(() => nativeWebAppearanceBinding(self, OTHER, choices[1].id, manifest), /IDENTITY/);
  assert.throws(() => nativeWebAppearanceBinding(self, UUID, 'arbitrary-url', manifest), /UNAVAILABLE/);
});

test('native local appearance survives server changes but reset uses latest attachment; identity and clear cancel pending loads', async () => {
  const pending = [], calls = [], controller = new NativeSelfPlayerController({ manifest }, {
    ysmFactory: (_reader, options) => { calls.push(options); return new Promise(resolve => pending.push(() => {
      const a = actor({ kind: 'ysm', ...(options.webAppearance ?? options.ysm) }); resolve(a); return a;
    })); }
  });
  const initial = controller.update(self, UUID, ysm()); const server = pending[0](); await initial;
  assert.equal(controller.selectAppearance('native:misc/3_default_boy:red'), true);
  assert.equal(controller.selectAppearance('native:misc/2_steve:tartaric_acid'), true);
  const newest = pending[2](); await settle(); const stale = pending[1](); await settle();
  assert.equal(server.disposed, 1); assert.equal(stale.disposed, 1); assert.equal(controller.actor, newest);
  const changed = ysm({ texture: 'red' }); await controller.update(self, UUID, changed); assert.equal(calls.length, 3);
  assert.equal(controller.selectAppearance('server'), true); assert.deepEqual(calls.at(-1).ysm, changed); assert.equal(calls.at(-1).webAppearance, undefined);
  controller.clear(); const late = pending[3](); await settle(); assert.equal(late.disposed, 1); assert.equal(controller.appearance().available, false);
  assert.equal(controller.appearance().selected, 'server'); assert.equal(controller.selectAppearance('native:misc/3_default_boy:red'), false);
  await controller.update(self, OTHER, changed); assert.match(controller.status, /IDENTITY/); assert.equal(calls.length, 4); controller.dispose();
});

test('a native unsupported server model remains disclosed and can be explicitly replaced in the Web page', async () => {
  const controller = new NativeSelfPlayerController({ manifest }, { ysmFactory: async (_r, o) => actor({ kind: 'ysm', ...o.webAppearance }) });
  await controller.update(self, UUID, ysm({ modelId: 'not-yet-supported' }));
  assert.match(controller.status, /MODEL_UNSUPPORTED/); assert.equal(controller.appearance().available, true);
  controller.selectAppearance('native:misc/3_default_boy:red'); await settle(); assert.ok(controller.actor);
  controller.selectAppearance('server'); await settle(); assert.equal(controller.actor, null); assert.match(controller.status, /MODEL_UNSUPPORTED/);
  controller.dispose();
});

test('actual original 1.21.1 model/PNG bytes load for a Web choice without forging server provenance', async () => {
  const reader = new NativeAssetReader(manifest, path => readFile(join(assets, path)));
  const { createNativeYsmPlayerActor } = await import('../../src/native-viewer/native-player-ysm.js');
  for (const choice of nativeAppearanceChoices(manifest).slice(1)) {
    const a = await createNativeYsmPlayerActor(reader, { uuid: UUID, webAppearance: choice, loadTexture: async bytes => {
      const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); return new THREE.Texture({ width: data.getUint32(16), height: data.getUint32(20) });
    } });
    assert.equal(a.assetInfo.selectionSource, 'web_viewer_override'); assert.equal(a.assetInfo.modelId, choice.modelId);
    assert.equal(a.assetInfo.completeEntityParityVerified, false); assert.ok(a.assetInfo.boneCount > 40); a.dispose();
  }
});
