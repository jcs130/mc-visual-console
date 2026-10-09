import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { PlayerObject } from 'skinview3d/libs/model.js';
import { InventoryPlayerPreview, createInventoryPreviewFallback, mirrorInventoryPlayer,
  inventoryMirrorMatches, poseInventoryPlayer, releaseInventoryMirror }
  from '../../src/modern-viewer/inventory-player-preview.js';

function avatar() {
  const root = new THREE.Group();
  const wrapper = new THREE.Group();
  wrapper.name = 'mesh';
  wrapper.scale.setScalar(1 / 16);
  wrapper.rotation.y = Math.PI;
  const player = new PlayerObject();
  player.position.y = 16;
  player.cape.visible = player.elytra.visible = false;
  wrapper.add(player);
  root.add(wrapper);
  root.playerObject = player;
  root.visible = false;
  root.position.set(-592, 91, -313);
  root.rotation.y = 2.1;
  root.userData.cycle = root;
  const main = new THREE.Mesh(new THREE.BoxGeometry(.25, 8, 1), new THREE.MeshBasicMaterial());
  main.name = 'custom_item_right';
  main.position.y = -8;
  player.skin.rightArm.add(main);
  const off = main.clone();
  off.name = 'custom_item_left';
  player.skin.leftArm.add(off);
  const nametag = new THREE.Group();
  nametag.name = 'nametag';
  nametag.add(new THREE.Mesh(new THREE.PlaneGeometry(20, 10), main.material));
  wrapper.add(nametag);
  const bone = new THREE.Bone();
  bone.name = 'bone_armor';
  bone.position.y = 12;
  const head = new THREE.Bone();
  head.name = 'bone_head';
  head.position.y = 12;
  bone.add(head);
  const geometry = new THREE.BoxGeometry(.6, .6, .6);
  const armor = new THREE.SkinnedMesh(geometry, main.material);
  armor.name = 'geometry_armor_head';
  armor.add(bone);
  armor.bind(new THREE.Skeleton([bone, head]));
  root.add(armor);
  return root;
}

test('mirrors real skinview3d BodyParts without constructors, circular userData or duplicate bodies', () => {
  const source = avatar();
  assert.throws(() => source.clone(true));
  const mirror = mirrorInventoryPlayer(THREE, source);
  assert.equal(mirror.root.children.length, 2);
  assert.equal(mirror.root.getObjectByName('nametag'), undefined);
  assert.equal(mirror.nodes.get(source.playerObject.skin).children.length, 6);
  assert.ok(mirror.root.getObjectByName('custom_item_left'));
  assert.ok(mirror.root.getObjectByName('custom_item_right'));
  assert.equal(inventoryMirrorMatches(mirror, source), true);
});

test('armor skeleton uses only copied bones, sharing texture/material/geometry without touching the world', () => {
  const source = avatar();
  const mirror = mirrorInventoryPlayer(THREE, source);
  const original = source.getObjectByName('geometry_armor_head');
  const copy = mirror.nodes.get(original);
  assert.notEqual(copy.skeleton, original.skeleton);
  assert.equal(copy.skeleton.bones[1], copy.getObjectByName('bone_head'));
  assert.notEqual(copy.skeleton.bones[1], original.skeleton.bones[1]);
  assert.equal(copy.geometry, original.geometry);
  assert.equal(copy.material, original.material);
  assert.deepEqual(copy.bindMatrix.elements, original.bindMatrix.elements);
  copy.skeleton.bones[1].rotation.x = .5;
  assert.equal(original.skeleton.bones[1].rotation.x, 0);
});

test('late skins are shared, changed equipment/material nodes invalidate a snapshot', () => {
  const source = avatar();
  const mirror = mirrorInventoryPlayer(THREE, source);
  const hand = source.getObjectByName('custom_item_right');
  const texture = new THREE.Texture();
  hand.material.map = texture;
  assert.equal(mirror.nodes.get(hand).material.map, texture);
  assert.equal(inventoryMirrorMatches(mirror, source), true);
  hand.material = new THREE.MeshBasicMaterial();
  assert.equal(inventoryMirrorMatches(mirror, source), false);
  const fresh = mirrorInventoryPlayer(THREE, source);
  hand.removeFromParent();
  assert.equal(inventoryMirrorMatches(fresh, source), false);
});

test('preview stands upright and looks with its helmet while world swimming/animation and yaw stay unchanged', () => {
  const source = avatar();
  source.playerObject.rotation.x = 1.32;
  source.playerObject.skin.head.rotation.x = -.4;
  source.playerObject.skin.leftLeg.rotation.x = 1;
  const mirror = mirrorInventoryPlayer(THREE, source);
  poseInventoryPlayer(mirror, .3, .12);
  assert.deepEqual(mirror.root.position.toArray(), [0, 0, 0]);
  assert.equal(mirror.root.visible, true);
  assert.equal(mirror.nodes.get(source.playerObject).rotation.x, 0);
  assert.equal(mirror.nodes.get(source.playerObject.skin.leftLeg).rotation.x, 0);
  assert.equal(mirror.nodes.get(source.playerObject.skin.head).rotation.x, .12);
  assert.equal(mirror.root.getObjectByName('bone_head').rotation.x, -.12);
  assert.equal(mirror.root.getObjectByName('bone_head').position.y, 12);
  assert.equal(source.playerObject.rotation.x, 1.32);
  assert.equal(source.playerObject.skin.head.rotation.x, -.4);
  assert.deepEqual(source.position.toArray(), [-592, 91, -313]);
  assert.equal(source.rotation.y, 2.1);
});

test('preview release only disposes cloned skeleton storage, leaving shared world resources alive', () => {
  const source = avatar();
  const mirror = mirrorInventoryPlayer(THREE, source);
  let geometryDisposals = 0;
  let materialDisposals = 0;
  let cleanups = 0;
  let boneTextureDisposals = 0;
  source.traverse((node) => {
    node.geometry?.addEventListener('dispose', () => geometryDisposals++);
    node.material?.addEventListener('dispose', () => materialDisposals++);
    node.additionalCleanup = () => cleanups++;
  });
  mirror.skeletons[0].computeBoneTexture();
  mirror.skeletons[0].boneTexture.addEventListener('dispose', () => boneTextureDisposals++);
  releaseInventoryMirror(mirror);
  assert.equal(boneTextureDisposals, 1);
  assert.equal(geometryDisposals, 0);
  assert.equal(materialDisposals, 0);
  assert.equal(cleanups, 0);
});

function browserHarness(source = avatar(), options = {}) {
  const frames = new Map();
  let serial = 0;
  const listeners = new Map();
  const document = { hidden: false, addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name) };
  const hosts = () => ({ isConnected: true, clientWidth: 104, clientHeight: 140, dataset: {},
    events: new Map(), children: [], append(node) { this.children.push(node); },
    addEventListener(name, fn) { this.events.set(name, fn); },
    removeEventListener(name) { this.events.delete(name); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 104, height: 140 }) });
  let renders = 0;
  let disposed = 0;
  let contexts = 0;
  const renderer = { domElement: { setAttribute() {}, remove() {} },
    setClearColor() {}, setPixelRatio() {}, setSize() {}, clear() {},
    render() { renders++; }, dispose() { disposed++; } };
  const preview = new InventoryPlayerPreview({ THREE, resolveSource: () => source, document,
    requestFrame: (fn) => { frames.set(++serial, fn); return serial; },
    cancelFrame: (id) => frames.delete(id), createRenderer: () => { contexts++; return renderer; }, ...options });
  const tick = (now) => {
    const entries = [...frames.values()];
    frames.clear();
    for (const fn of entries) fn(now);
  };
  return { preview, frames, document, listeners, hosts, tick,
    get renders() { return renders; }, get disposed() { return disposed; }, get contexts() { return contexts; } };
}

test('visible preview renders at most 30 fps, reuses one context and stops fully when closed', () => {
  const h = browserHarness();
  const host = h.hosts();
  h.preview.attach(host);
  h.tick(0); h.tick(16); h.tick(34);
  assert.equal(h.renders, 2);
  assert.equal(host.dataset.previewState, 'ready');
  assert.equal(h.contexts, 1);
  h.preview.setVisible(false);
  assert.equal(h.frames.size, 0);
  assert.equal(h.preview.mirror, null);
  h.preview.attach(h.hosts()); h.tick(100);
  assert.equal(h.contexts, 1);
  h.preview.dispose();
  assert.equal(h.disposed, 1);
  assert.equal(h.frames.size, 0);
  assert.equal(h.listeners.size, 0);
});

test('document visibility, detached host, disconnect/reset and renderer failure do not leak timers', () => {
  const h = browserHarness();
  const host = h.hosts();
  h.preview.attach(host); h.tick(0);
  h.document.hidden = true; h.tick(40);
  assert.equal(h.frames.size, 0);
  h.document.hidden = false; h.listeners.get('visibilitychange')();
  assert.equal(h.frames.size, 1);
  host.isConnected = false; h.tick(80);
  assert.equal(h.preview.active, false);
  h.preview.attach(h.hosts()); h.preview.reset();
  assert.equal(h.frames.size, 0);
  const fail = browserHarness(avatar(), { createRenderer() { throw Error('GPU unavailable'); } });
  const failHost = fail.hosts();
  fail.preview.attach(failHost); fail.tick(0);
  assert.equal(failHost.dataset.previewState, 'unavailable');
  assert.equal(fail.frames.size, 0);
});

test('pointer observation changes private pose smoothly and leaves the world player alone', () => {
  const source = avatar();
  const h = browserHarness(source);
  const host = h.hosts();
  h.preview.attach(host); h.tick(0);
  host.events.get('pointermove')({ clientX: 104, clientY: 140 });
  h.tick(40);
  assert.ok(h.preview.turn.yaw > 0 && h.preview.turn.yaw < .5);
  assert.equal(source.playerObject.skin.head.rotation.x, 0);
  host.events.get('pointerleave')();
  h.tick(80);
  assert.ok(h.preview.turn.yaw < .1);
});

test('fallback builds its own skin rig before a world self model exists and adds late equipment from the same renderer API', () => {
  let loaded;
  let owner = null;
  let calls = 0;
  let equipment = [{ name: 'diamond_sword' }, { name: 'shield' }, null, null, null, { name: 'diamond_helmet' }];
  const entityRegistry = {};
  const fallback = createInventoryPreviewFallback(THREE, {
    getAvatar: () => ({ entity: { id: 47, equipment } }),
    getSkin: () => ({ texture: '/local-skin.png', model: 'slim' }),
    getEntities: () => owner,
    loadTexture(url, callback) { assert.equal(url, '/local-skin.png'); loaded = callback; },
  });
  fallback.update();
  assert.ok(fallback.root.playerObject.skin.head);
  assert.equal(fallback.ready, false);
  loaded(new THREE.Texture());
  assert.equal(fallback.ready, true);
  assert.equal(fallback.root.playerObject.skin.modelType, 'slim');
  owner = { entities: entityRegistry, mcData: { itemsByName: { diamond_sword: { id: 9 } } },
    updateEntityEquipment(root, entity) {
      calls++;
      assert.equal(root.playerObject, undefined, 'cape loader cannot resolve/mutate live world by id');
      assert.equal(entity.equipment[0].itemId, 9);
      const armor = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      armor.name = 'geometry_armor_head';
      root.add(armor);
    } };
  fallback.update(); fallback.update();
  assert.equal(calls, 1);
  assert.ok(fallback.root.getObjectByName('geometry_armor_head'));
  equipment = [equipment[0], null];
  fallback.update();
  assert.equal(calls, 2);
  assert.deepEqual(entityRegistry, {});
  fallback.dispose();
});

test('preview uses independent fallback while absent and releases it when world model arrives', () => {
  let current = null;
  let disposals = 0;
  const root = avatar();
  const h = browserHarness(null, { resolveSource: () => current,
    createFallback: () => ({ ready: true, root, update() {}, dispose() { disposals++; } }) });
  h.preview.attach(h.hosts()); h.tick(0);
  assert.equal(h.preview.mirror.source, root);
  current = avatar(); h.tick(40);
  assert.equal(h.preview.mirror.source, current);
  assert.equal(disposals, 1);
  h.preview.dispose();
  assert.equal(disposals, 1);
});

test('fallback disposes private held-block geometry and all flat-item materials, preserving world atlas resources', () => {
  let disposedBlock = 0;
  let disposedFlat = 0;
  let disposedMaterial = 0;
  let disposedWorld = 0;
  const atlas = new THREE.Texture();
  const worldMaterial = new THREE.MeshBasicMaterial({ map: atlas });
  worldMaterial.addEventListener('dispose', () => disposedWorld++);
  atlas.addEventListener('dispose', () => disposedWorld++);
  const owner = { worldRenderer: { material: worldMaterial, itemsTexture: atlas },
    updateEntityEquipment(root) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), worldMaterial);
      block.name = 'custom_item_right';
      block.additionalCleanup = () => {};
      block.geometry.addEventListener('dispose', () => disposedBlock++);
      root.add(block);
      const flatMaterials = Array.from({ length: 6 }, () => new THREE.MeshBasicMaterial());
      for (const material of flatMaterials) material.addEventListener('dispose', () => disposedMaterial++);
      const flat = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0), flatMaterials);
      flat.name = 'custom_item_left';
      flat.geometry.addEventListener('dispose', () => disposedFlat++);
      flat.additionalCleanup = () => { flatMaterials[4].dispose(); flatMaterials[5].dispose(); };
      root.add(flat);
    } };
  const fallback = createInventoryPreviewFallback(THREE, {
    getAvatar: () => ({ entity: { equipment: [{ name: 'dirt' }] } }),
    getSkin: () => ({ texture: '/skin.png' }), getEntities: () => owner, loadTexture() {},
  });
  fallback.update(); fallback.dispose();
  assert.equal(disposedBlock, 1);
  assert.equal(disposedFlat, 1);
  assert.equal(disposedMaterial, 6);
  assert.equal(disposedWorld, 0);
});

test('early fallback resource failure is contained and a subsequent state/open can retry successfully', () => {
  let fail = true;
  const h = browserHarness(null, { createFallback: () => ({ ready: true, root: avatar(),
    update() { if (fail) throw Error('item resources not ready'); }, dispose() {} }) });
  const host = h.hosts();
  h.preview.attach(host);
  assert.doesNotThrow(() => h.tick(0));
  assert.equal(host.dataset.previewState, 'unavailable');
  assert.equal(h.frames.size, 0);
  fail = false;
  h.preview.attach(host); h.tick(40);
  assert.equal(host.dataset.previewState, 'ready');
  h.preview.dispose();
});

test('a known native model rejection is unavailable, not an endless loading state or replacement rig', () => {
  let reason='NATIVE_YSM_MODEL_UNSUPPORTED';
  const h=browserHarness(null,{getUnavailableReason:()=>reason});
  const host=h.hosts(); h.preview.attach(host); h.tick(0);
  assert.equal(host.dataset.previewState,'unavailable'); assert.equal(host.dataset.previewReason,reason);
  assert.equal(h.contexts,0);
  reason=null; h.preview.attach(host); h.tick(40);
  assert.equal(host.dataset.previewState,'waiting'); assert.equal(host.dataset.previewReason,undefined);
  h.preview.dispose();
});
