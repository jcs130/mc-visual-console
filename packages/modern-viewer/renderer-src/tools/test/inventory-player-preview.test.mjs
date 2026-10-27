import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createCanvas } from 'canvas';
import * as THREE from 'three';
import { PlayerObject } from 'skinview3d/libs/model.js';
import { createNativeTransitionTiming } from '../../src/native-viewer/native-transition-timing.js';
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

test('both native and classic inventory rigs face the positive-Z preview camera without rotating the world', () => {
  for (const native of [false, true]) {
    const source = avatar(), wrapper = source.playerObject.parent;
    wrapper.rotation.y = native ? 0 : Math.PI;
    source.playerObject.rotation.y = native ? Math.PI : 0;
    const mirror = mirrorInventoryPlayer(THREE, source);
    poseInventoryPlayer(mirror);
    mirror.root.updateMatrixWorld(true);
    const facing = new THREE.Vector3(0, 0, 1).transformDirection(mirror.nodes.get(source.playerObject).matrixWorld);
    assert.ok(facing.z > .95, `${native ? 'native' : 'classic'} skin front must face the viewer`);
    assert.equal(wrapper.rotation.y, native ? 0 : Math.PI);
    assert.equal(source.playerObject.rotation.y, native ? Math.PI : 0);
    releaseInventoryMirror(mirror);
  }
});

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

test('matrix-authored world anchors and skin pivots do not override the private inventory pose',()=>{
  const source=avatar();
  for(const node of [source,source.playerObject,...Object.values(source.playerObject.skin).filter(value=>value?.isObject3D)]){
    node.updateMatrix();node.matrixAutoUpdate=false;
  }
  const oldMatrix=source.matrix.clone(),oldPlayerMatrix=source.playerObject.matrix.clone();
  const mirror=mirrorInventoryPlayer(THREE,source);poseInventoryPlayer(mirror,.2,.1);mirror.root.updateMatrixWorld(true);
  assert.deepEqual(mirror.root.getWorldPosition(new THREE.Vector3()).toArray(),[0,0,0]);
  assert.equal(mirror.root.matrixAutoUpdate,true);assert.equal(mirror.nodes.get(source.playerObject).matrixAutoUpdate,true);
  const facing=new THREE.Vector3(0,0,1).transformDirection(mirror.nodes.get(source.playerObject).matrixWorld);
  assert.ok(facing.z>.9,'server/world yaw cannot turn the preview away from its camera');
  assert.equal(source.matrixAutoUpdate,false);assert.ok(source.matrix.equals(oldMatrix));assert.ok(source.playerObject.matrix.equals(oldPlayerMatrix));
  releaseInventoryMirror(mirror);
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

test('YSM inventory preview retains its facing and never revives the hidden classic body or equipment', () => {
  const source=avatar();source.playerObject.visible=false;
  source.getObjectByName('geometry_armor_head').visible=false;
  const custom=new THREE.Group();custom.name='paper-ysm-player';custom.rotation.x=.15;source.add(custom);
  const mirror=mirrorInventoryPlayer(THREE,source);poseInventoryPlayer(mirror,.25,.1);
  assert.equal(mirror.nodes.get(source.playerObject).visible,false);
  assert.equal(mirror.nodes.get(custom).visible,true);assert.equal(mirror.nodes.get(custom).rotation.x,.15);
  assert.equal(mirror.root.getObjectByName('geometry_armor_head').visible,false);
  const forward=new THREE.Vector3(0,0,-1).applyEuler(mirror.root.rotation);
  assert.ok(forward.z>0,'original YSM -Z front faces the +Z inventory camera');
  assert.equal(source.rotation.y,2.1);
});

test('a selected full custom actor keeps its authored pose without classic-body normalization', () => {
  const source=avatar(), custom=new THREE.Group();
  custom.name='selected-original-actor';custom.userData.lanternFullPlayerModel=true;
  custom.add(new THREE.Mesh(new THREE.BoxGeometry(.6,1.8,.3),new THREE.MeshBasicMaterial()));
  source.add(custom);
  source.playerObject.skin.head.visible=false;
  source.playerObject.rotation.set(.4,.9,.2);
  source.getObjectByName('geometry_armor_head').visible=false;
  const original=source.playerObject.quaternion.clone();
  const mirror=mirrorInventoryPlayer(THREE,source);poseInventoryPlayer(mirror,.25,.1);
  assert.ok(mirror.nodes.get(source.playerObject).quaternion.equals(original),'hidden native rig is not re-posed through a selected actor');
  assert.equal(mirror.nodes.get(custom).visible,true);
  assert.equal(mirror.root.getObjectByName('geometry_armor_head').visible,false);
  assert.equal(mirror.nodes.get(source.playerObject.skin.head).visible,false);
  releaseInventoryMirror(mirror);
});

test('switching to a full custom actor hides sibling classic armor, keeps held items and restores every original visibility flag', () => {
  const code=readFileSync(new URL('../../src/modern-viewer/client.js',import.meta.url),'utf8');
  const start=code.indexOf('function hideNativePlayerBody('),end=code.indexOf('function disposePlayerModelInstance(',start);
  assert.ok(start>0&&end>start);
  const {hide,restore}=runInNewContext(code.slice(start,end)+'\n({hide:hideNativePlayerBody,restore:restoreNativePlayerBody})');
  const source=avatar(),custom=new THREE.Group();source.add(custom);
  const instance={sceneEntity:source,nativeRoot:source.playerObject.parent,nativeBodyVisibility:new Map()};
  const hidden=source.playerObject.skin.head.children[1];hidden.visible=false;
  hide(instance);
  assert.equal(source.getObjectByName('geometry_armor_head').visible,false,'armor is not a descendant of the skin wrapper');
  assert.equal(source.getObjectByName('custom_item_left').visible,true);
  assert.equal(source.getObjectByName('custom_item_right').visible,true);
  assert.equal(custom.visible,true);
  hide(instance);restore(instance);
  assert.equal(source.getObjectByName('geometry_armor_head').visible,true);
  assert.equal(hidden.visible,false,'intentionally hidden outer layers stay hidden');
  assert.equal(instance.nativeBodyVisibility.size,0);
});

test('legacy 64x32 server skins use modern inventory UVs, retain original face pixels and release only private textures', () => {
  const image=createCanvas(64,32),ctx=image.getContext('2d');
  ctx.fillStyle='#a04020';ctx.fillRect(0,0,64,32);ctx.fillStyle='#2040e0';ctx.fillRect(16,16,40,16);
  const original=image.toBuffer('image/png'),loaded=new THREE.Texture(image);let rawDisposals=0;
  loaded.addEventListener('dispose',()=>rawDisposals++);
  const fallback=createInventoryPreviewFallback(THREE,{getAvatar:()=>null,getSkin:()=>({texture:'/fixture-legacy.png'}),getEntities:()=>null,
    createSkinCanvas:()=>createCanvas(1,1),loadTexture:(_url,ready)=>ready(loaded)});
  fallback.update();assert.equal(fallback.ready,true);
  const normalized=fallback.root.playerObject.skin.map;
  assert.notEqual(normalized,loaded);assert.equal(normalized.image.width,64);assert.equal(normalized.image.height,64);
  assert.deepEqual([...normalized.image.getContext('2d').getImageData(8,8,1,1).data],[160,64,32,255]);
  assert.deepEqual([...normalized.image.getContext('2d').getImageData(24,24,1,1).data],[32,64,224,255]);
  assert.equal(rawDisposals,1);assert.deepEqual(image.toBuffer('image/png'),original);
  let normalizedDisposals=0;normalized.addEventListener('dispose',()=>normalizedDisposals++);
  fallback.dispose();assert.equal(normalizedDisposals,1);assert.equal(rawDisposals,1);
});

test('native held-item matrices stay at the hand in the inventory mirror, including live matrix-only updates', () => {
  for (const ysm of [false, true]) {
    const source = avatar();
    const hand = ysm ? new THREE.Group() : source.playerObject.skin.leftArm;
    if (ysm) {
      source.playerObject.visible = false;
      const custom = new THREE.Group(); custom.name = 'paper-ysm-player';
      source.add(custom); custom.add(hand); hand.position.set(.4, 1, 0);
    }
    const mount = new THREE.Group(); mount.name = 'native-held-left';
    mount.matrixAutoUpdate = false;
    mount.matrix.makeTranslation(.2, -.5, -.1).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    const shield = new THREE.Mesh(new THREE.BoxGeometry(.5, .8, .1), new THREE.MeshBasicMaterial());
    mount.add(shield); hand.add(mount);
    const mirror = mirrorInventoryPlayer(THREE, source);
    for (const offset of [.2, .35]) {
      mount.matrix.elements[12] = offset;
      poseInventoryPlayer(mirror); mirror.root.updateMatrixWorld(true);
      const copy = mirror.nodes.get(mount);
      assert.equal(copy.matrixAutoUpdate, false, 'native item mounts are authored in matrices, not decomposed TRS');
      assert.deepEqual(copy.matrix.elements, mount.matrix.elements, 'shield must keep its grip transform after every preview pose');
      const expected = new THREE.Vector3().setFromMatrixPosition(
        new THREE.Matrix4().multiplyMatrices(mirror.nodes.get(hand).matrixWorld, mount.matrix));
      assert.ok(mirror.nodes.get(shield).getWorldPosition(new THREE.Vector3()).distanceTo(expected) < 1e-9,
        'shield belongs at the current hand locator, not the avatar origin');
      assert.equal(mount.matrixAutoUpdate, false);
      assert.equal(mount.matrix.elements[12], offset, 'preview must not modify world equipment');
    }
    releaseInventoryMirror(mirror);
  }
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

test('animated YSM bounds and pointer turns keep a stable camera until model topology changes', () => {
  const source = avatar();
  source.playerObject.visible = false;
  const ysm = new THREE.Group(); ysm.name = 'paper-ysm-player';
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 2, .4), new THREE.MeshBasicMaterial());
  ysm.add(body); source.add(ysm);
  const collapsed = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), body.material);
  collapsed.name = 'effect locator'; collapsed.scale.setScalar(0); collapsed.position.set(15, -30, 4);
  ysm.add(collapsed);
  const h = browserHarness(source); h.preview.attach(h.hosts()); h.tick(0);
  const camera = h.preview.camera;
  const frame = () => [camera.left, camera.right, camera.top, camera.bottom, ...camera.position.toArray()];
  const initial = frame();
  assert.ok(camera.top <= 1.3, 'collapsed effect geometry must not make the body tiny');
  for (const [i, amount] of [1.3, .7, 1.1, .9].entries()) {
    body.scale.y = amount; body.position.y = .2 * amount;
    h.preview.turn.targetYaw = i % 2 ? -.5 : .5;
    h.tick((i + 1) * 40);
    assert.deepEqual(frame(), initial, 'an animated pose must not resize or recenter the camera');
  }
  const equipment = new THREE.Mesh(new THREE.BoxGeometry(1, 5, 1), body.material);
  ysm.add(equipment); h.tick(240);
  assert.ok(camera.top > initial[2], 'new equipment invalidates framing and must still fit');
  assert.equal(source.playerObject.visible, false);
  h.preview.dispose();
});

test('real preview RAF reports cold/warm phases and mirror releases while borrowing original resources', () => {
  const source = avatar(), viewport = { dataset: {} };
  const timing = createNativeTransitionTiming({ viewport });
  const h = browserHarness(source, { transitionTiming: timing });
  let sourceDisposals = 0;
  source.traverse(node => node.geometry?.addEventListener('dispose', () => sourceDisposals++));
  const open = timing.begin('menu', 'click');
  h.preview.attach(h.hosts(), open); h.tick(0); timing.finish(open);
  let record = JSON.parse(viewport.dataset.transitionTiming).transitions.at(-1);
  assert.equal(record.firstPreview.context, 'cold');
  assert.equal(record.readyPreview.status, 'ready');
  assert.equal(record.mirrorBuilds, 1);
  for (const key of ['contextSetupMs', 'mirrorMs', 'poseBoundsLayoutMs', 'cpuDrawMs', 'totalMs', 'latencyMs']) assert.ok(record.readyPreview[key] >= 0, key);
  assert.equal(h.preview.mirror.nodes.get(source.getObjectByName('custom_item_right')).geometry, source.getObjectByName('custom_item_right').geometry);
  const close = timing.begin('menu', 'click'); h.preview.setVisible(false, close); timing.finish(close);
  assert.equal(JSON.parse(viewport.dataset.transitionTiming).transitions.at(-1).mirrorReleases, 1);
  assert.equal(h.frames.size, 0);
  const reopen = timing.begin('menu', 'click'); h.preview.attach(h.hosts(), reopen); h.tick(40); timing.finish(reopen);
  record = JSON.parse(viewport.dataset.transitionTiming).transitions.at(-1);
  assert.equal(record.readyPreview.context, 'warm'); assert.equal(record.mirrorBuilds, 1);
  assert.equal(h.contexts, 1); assert.equal(sourceDisposals, 0);
  const priorMirror = h.preview.mirror;
  source.getObjectByName('custom_item_right').material = new THREE.MeshBasicMaterial(); h.tick(80);
  assert.notEqual(h.preview.mirror, priorMirror, 'diagnostics do not disable identity/topology/material checks');
  assert.equal(JSON.parse(viewport.dataset.transitionTiming).transitions.at(-1).mirrorBuilds, 2);
  h.document.hidden = true; h.tick(120); assert.equal(h.frames.size, 0);
  h.preview.dispose(); assert.equal(h.disposed, 1); assert.equal(sourceDisposals, 0); timing.dispose();
});

test('a first waiting preview RAF and later ready RAF remain separate observations', () => {
  let source = null;
  const viewport = { dataset: {} }, timing = createNativeTransitionTiming({ viewport });
  const h = browserHarness(null, { transitionTiming: timing, resolveSource: () => source });
  const open = timing.begin('menu', 'state'); h.preview.attach(h.hosts(), open); h.tick(0);
  source = avatar(); h.tick(40);
  const record = JSON.parse(viewport.dataset.transitionTiming).transitions.at(-1);
  assert.equal(record.firstPreview.status, 'waiting'); assert.equal(record.readyPreview.status, 'ready');
  assert.equal(record.mirrorBuilds, 1); assert.equal(h.contexts, 1);
  h.preview.dispose(); timing.dispose();
});

test('an unavailable diagnostics dataset cannot stop the actual preview RAF or disposal', () => {
  const timing = createNativeTransitionTiming({ viewport: { get dataset() { throw Error('unavailable sink'); } } });
  const h = browserHarness(avatar(), { transitionTiming: timing });
  h.preview.attach(h.hosts(), timing.begin('menu', 'click')); h.tick(0);
  assert.equal(h.renders, 1); assert.equal(h.preview.host.dataset.previewState, 'ready');
  h.preview.dispose(); assert.equal(h.disposed, 1); assert.equal(h.frames.size, 0); timing.dispose();
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
