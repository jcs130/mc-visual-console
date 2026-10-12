import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bakeFaces } from '../native-viewer/model-loader.js';
import { nativeHeldItemTransform, nativeHeldArmMountMatrix } from '../native-viewer/native-held-items.js';
import { itemHeadProfile } from './item-profile.js';

// 1.20.6 template_skull display transforms and the native 8px player skull,
// including its 0.25px outer layer. Pixels always come from the actual profile.
export const HEAD_MODEL = { display: {
  gui: { rotation: [30, 45, 0], translation: [0, 3, 0], scale: [1, 1, 1] },
  fixed: { rotation: [0, 180, 0], translation: [0, 4, 0], scale: [1, 1, 1] },
  ground: { translation: [0, 3, 0], scale: [.5, .5, .5] },
  thirdperson_righthand: { rotation: [45, 45, 0], translation: [0, 3, 0], scale: [.5, .5, .5] },
} };
export function headModelFaces() {
  const element = (offset, dilation) => ({
    from: [4 - dilation, -dilation, 4 - dilation], to: [12 + dilation, 8 + dilation, 12 + dilation],
    faces: Object.fromEntries(Object.entries({ south: [8, 8, 16, 16], north: [24, 8, 32, 16],
      west: [0, 8, 8, 16], east: [16, 8, 24, 16], up: [8, 0, 16, 8], down: [16, 0, 24, 8] })
      .map(([face, uv]) => [face, { texture: '#skin', uv: uv.map((n, i) => (n + (i % 2 === 0 ? offset : 0)) / 4) }])),
  });
  return bakeFaces({ textures: { skin: 'profile' }, elements: [element(0, 0), element(32, .25)] });
}
export function headDisplayMatrix(context, arm = 'right') {
  const display = HEAD_MODEL.display[context + '_' + arm + 'hand']
    ?? (context === 'thirdperson' ? HEAD_MODEL.display.thirdperson_righthand : HEAD_MODEL.display[context]) ?? {};
  const t = nativeHeldItemTransform(display, arm, context === 'firstperson' ? context : 'thirdperson');
  return new THREE.Matrix4().compose(new THREE.Vector3(...t.translation),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...t.radians, 'XYZ')), new THREE.Vector3(...t.scale));
}
function geometry() {
  const parts = headModelFaces().map(face => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(face.position, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(face.uv, 2)); g.setIndex(face.indices); g.computeVertexNormals(); return g;
  });
  const merged = mergeGeometries(parts, false); parts.forEach(g => g.dispose()); return merged;
}
export class ItemHeadRenderer {
  constructor({ imageLoader = url => new THREE.ImageLoader().loadAsync(url) } = {}) {
    this.records = new Map(); this.instances = new Set(); this.imageLoader = imageLoader; this.iconRenderer = null;
  }
  reserved(item) { return itemHeadProfile(item) !== null; }
  key(item) { const p = itemHeadProfile(item); return p ? 'profile:' + (p.hash ?? 'unavailable') : ''; }
  stats() {
    const rows = [...this.instances];
    return { pending: rows.filter(r => r.userData.headStatus === 'pending').length,
      unavailable: rows.filter(r => r.userData.headStatus === 'unavailable').length,
      ready: rows.filter(r => r.userData.headStatus === 'ready').length };
  }
  record(hash) {
    if (this.records.has(hash)) return this.records.get(hash);
    // Bounded per-page cache. Existing items retain their image after eviction.
    if (this.records.size >= 128) this.records.delete(this.records.keys().next().value);
    const record = { status: 'pending', icon: null, reason: null };
    record.image = this.imageLoader('/head-texture/' + hash + '.png').then(image => {
      if (image.width !== 64 || ![32, 64].includes(image.height)) throw Error('HEAD_TEXTURE_FORMAT');
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
      canvas.getContext('2d').drawImage(image, 0, 0); record.status = 'ready'; return canvas;
    }).catch(error => { record.status = 'unavailable'; record.reason = error.message; throw error; });
    // Observe the rejection even when the requester is removed before loading.
    record.image.catch(() => {}); this.records.set(hash, record); return record;
  }
  create(item, context = null, arm = 'right') {
    const profile = itemHeadProfile(item), root = new THREE.Group(); let disposed = false;
    root.name = 'profile-item'; root.userData = { headTextureHash: profile?.hash ?? null, headStatus: 'pending' };
    if (context) root.applyMatrix4(headDisplayMatrix(context, arm));
    this.instances.add(root);
    const g = geometry(), material = new THREE.MeshLambertMaterial({ alphaTest: .1, transparent: true });
    const mesh = new THREE.Mesh(g, material); mesh.visible = false; root.add(mesh);
    g.addEventListener('dispose', () => { disposed = true; this.instances.delete(root); material.map?.dispose(); });
    const ready = profile?.hash ? this.record(profile.hash).image.then(image => {
      if (disposed) return;
      const texture = new THREE.CanvasTexture(image); texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false;
      material.map = texture; material.needsUpdate = true; mesh.visible = true; root.userData.headStatus = 'ready';
    }) : Promise.reject(Error('HEAD_PROFILE_UNAVAILABLE'));
    ready.catch(error => { root.userData.headStatus = 'unavailable'; root.userData.headReason = error.message; });
    return { root, model: HEAD_MODEL, ready, dispose() { if (disposed) return; root.removeFromParent(); g.dispose(); material.dispose(); root.clear(); } };
  }
  async icon(item) {
    const hash = itemHeadProfile(item)?.hash; if (!hash) throw Error('HEAD_PROFILE_UNAVAILABLE');
    const record = this.record(hash);
    if (!record.icon) record.icon = (async () => {
      const instance = this.create(item, 'gui');
      try {
        await instance.ready;
        this.iconRenderer ??= new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
        const renderer = this.iconRenderer; renderer.setSize(64, 64, false); renderer.setClearColor(0, 0);
        const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-.5, .5, .5, -.5, .1, 10);
        camera.position.set(0, 0, 3); scene.add(instance.root, new THREE.AmbientLight(0xffffff, 2));
        const light = new THREE.DirectionalLight(0xffffff, 1); light.position.set(-3, 5, 4); scene.add(light);
        renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png');
      } finally { instance.dispose(); }
    })();
    return record.icon;
  }
}
export const paperItemHeads = new ItemHeadRenderer();
const installs = new WeakMap();
export function installItemHeadRenderer(world, registry = paperItemHeads) {
  installs.get(world)?.(); const restores = [];
  const wrap = (target, name, fn) => { const original = target[name]; target[name] = fn(original); restores.push(() => { target[name] = original; }); };
  wrap(world, 'getItemRenderData', original => function(item, ...args) {
    const base = original.call(this, item, ...args); return registry.reserved(item) ? { ...base, modelName: registry.key(item) } : base;
  });
  for (const [arm, holding] of [['right', world.holdingBlock], ['left', world.holdingBlockLeft]]) {
    if (!holding?.createItemModel) continue;
    wrap(holding, 'createItemModel', original => async function(handItem) {
      const item = handItem?.fullItem; if (!registry.reserved(item)) return original.call(this, handItem);
      this.lastUpdate = performance.now(); if (this.lastItemModelName === registry.key(item)) return undefined;
      this.lastItemModelName = registry.key(item); return { model: registry.create(item, 'firstperson', arm).root, type: 'item' };
    });
  }
  wrap(world.entities, 'getItemMesh', original => function(item, props, faceCamera, previousModel) {
    if (!registry.reserved(item)) return original.call(this, item, props, faceCamera, previousModel);
    if (previousModel === registry.key(item)) return undefined;
    const instance = registry.create(item, props?.['minecraft:display_context'] ?? 'ground');
    return { mesh: instance.root, isBlock: false, modelName: registry.key(item), cleanup: instance.dispose };
  });
  wrap(world.entities, 'addItemModel', original => function(entity, arm, item, isPlayer) {
    if (!isPlayer || !registry.reserved(item)) return original.call(this, entity, arm, item, isPlayer);
    const name = 'custom_item_' + arm;
    entity.traverse(part => { if (part.name === name) { part.removeFromParent(); part.additionalCleanup?.(); } });
    entity.traverse(part => {
      if (part.name !== arm + 'Arm') return;
      const instance = registry.create(item), mount = new THREE.Group(); mount.name = name;
      mount.applyMatrix4(nativeHeldArmMountMatrix({ arm, transform: nativeHeldItemTransform(HEAD_MODEL.display.thirdperson_righthand, arm) }));
      mount.add(instance.root); mount.additionalCleanup = instance.dispose; part.add(mount);
    });
  });
  const restore = () => { for (const undo of restores.reverse()) undo(); installs.delete(world); };
  installs.set(world, restore); return restore;
}
