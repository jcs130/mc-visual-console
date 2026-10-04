import { PlayerObject } from 'skinview3d/libs/model.js';
import { rendererEntityEquipment } from './renderer-equipment.js';

/** A read-only mirror of the renderer's current player, with no new assets. */
export function mirrorInventoryPlayer(THREE, source) {
  const nodes = new Map();
  const pairs = [];
  const skeletons = [];
  const ignored = (node) => node.isSprite || /^(?:debug|nametag|hitbox)(?:_|$)/i.test(node.name || '');
  const visit = (node) => {
    if (ignored(node)) return null;
    // skinview3d constructors require arguments and may add default children.
    // Object3D.copy also serializes userData, which contains renderer cycles.
    let copy;
    if (node.isSkinnedMesh) copy = new THREE.SkinnedMesh(node.geometry, node.material);
    else if (node.isMesh) copy = new THREE.Mesh(node.geometry, node.material);
    else if (node.isBone) copy = new THREE.Bone();
    else if (node.isGroup) copy = new THREE.Group();
    else copy = new THREE.Object3D();
    copy.name = node.name;
    copy.rotation.order = node.rotation.order;
    copy.position.copy(node.position);
    copy.quaternion.copy(node.quaternion);
    copy.scale.copy(node.scale);
    copy.visible = node.visible;
    copy.renderOrder = node.renderOrder;
    copy.frustumCulled = false;
    if (node.morphTargetInfluences) copy.morphTargetInfluences = node.morphTargetInfluences.slice();
    if (node.morphTargetDictionary) copy.morphTargetDictionary = { ...node.morphTargetDictionary };
    nodes.set(node, copy);
    pairs.push([node, copy]);
    for (const child of node.children) {
      const mirrored = visit(child);
      if (mirrored) copy.add(mirrored);
    }
    return copy;
  };
  const root = visit(source);
  for (const [node, copy] of pairs) {
    if (!node.isSkinnedMesh || !node.skeleton) continue;
    if (!node.skeleton.bones.every((bone) => nodes.has(bone))) continue;
    const skeleton = new THREE.Skeleton(node.skeleton.bones.map((bone) => nodes.get(bone)),
      node.skeleton.boneInverses.map((inverse) => inverse.clone()));
    copy.bindMode = node.bindMode;
    copy.bind(skeleton, node.bindMatrix);
    skeletons.push(skeleton);
  }
  return { source, root, nodes, pairs, skeletons };
}

/** Topology and materials can change after asynchronous skins/equipment load. */
export function inventoryMirrorMatches(mirror, source) {
  if (!mirror || mirror.source !== source) return false;
  let count = 0;
  let matches = true;
  source.traverse((node) => {
    if (node.isSprite || /^(?:debug|nametag|hitbox)(?:_|$)/i.test(node.name || '')) return;
    // Children under a skipped node are skipped as well.
    for (let parent = node.parent; parent && parent !== source; parent = parent.parent) {
      if (parent.isSprite || /^(?:debug|nametag|hitbox)(?:_|$)/i.test(parent.name || '')) return;
    }
    count++;
    const copy = mirror.nodes.get(node);
    if (!copy || (node.isMesh && (node.geometry !== copy.geometry || node.material !== copy.material))) matches = false;
  });
  return matches && count === mirror.nodes.size;
}

/** Presentation pose is private to the preview; never change the game rig. */
export function poseInventoryPlayer(mirror, yaw = 0, pitch = 0) {
  const { source, root, nodes } = mirror;
  for (const [node, copy] of mirror.pairs) {
    copy.position.copy(node.position);
    copy.quaternion.copy(node.quaternion);
    copy.scale.copy(node.scale);
    copy.visible = node.visible;
    if (node.morphTargetInfluences) copy.morphTargetInfluences = node.morphTargetInfluences.slice();
  }
  root.position.set(0, 0, 0);
  root.rotation.set(0, Math.PI + .20 + yaw, 0);
  root.visible = true; // World culling and first-person hiding do not hide the UI.
  const player = source.playerObject;
  const skin = player?.skin;
  if (!player || !skin) return;
  const playerCopy = nodes.get(player);
  if (!playerCopy) return;
  playerCopy.visible = true;
  playerCopy.position.set(0, 16, 0);
  playerCopy.rotation.set(0, 0, 0);
  // Neutral Minecraft pose, including slim arms' existing inner mesh offsets.
  const parts = {};
  for (const [key, position] of Object.entries({ head: [0, 0, 0], body: [0, -6, 0],
    leftArm: [5, -2, 0], rightArm: [-5, -2, 0],
    leftLeg: [1.9, -12, -.1], rightLeg: [-1.9, -12, -.1] })) {
    const part = nodes.get(skin[key]);
    if (!part) continue;
    part.position.set(...position);
    part.rotation.set(0, 0, 0);
    parts[key] = part;
  }
  parts.head?.rotation.set(pitch, yaw * .45, 0);
  parts.leftArm?.rotation.set(-.07, 0, -.04);
  parts.rightArm?.rotation.set(-.07, 0, .04);
  // Native armor is a sibling of the skin wrapper, in its opposite-facing
  // frame. Use the same mirrored pivots as the existing live renderer patch.
  for (const armor of root.children.filter((node) => node.name.startsWith('geometry_armor_'))) {
    armor.position.set(0, 0, 0);
    armor.rotation.set(0, (player.parent?.rotation.y || 0) + Math.PI, 0);
    const bind = (name, part, mirrored = false) => {
      const bone = armor.getObjectByName(`bone_${name}`);
      if (!bone || !part) return;
      bone.position.set((mirrored ? -1 : 1) * part.position.x, 12 + part.position.y,
        (mirrored ? -1 : 1) * part.position.z);
      bone.rotation.set(-part.rotation.x, part.rotation.y,
        (mirrored ? -1 : 1) * part.rotation.z, part.rotation.order);
    };
    if (armor.name.startsWith('geometry_armor_head')) bind('head', parts.head);
    if (armor.name.startsWith('geometry_armor_chest')) {
      bind('body', parts.body);
      // Chest armor uses the skin's same limb assignments.
      for (const [name, part] of [['leftarm', parts.leftArm], ['rightarm', parts.rightArm]]) {
        const bone = armor.getObjectByName(`bone_${name}`);
        if (!bone || !part) continue;
        bone.position.set(part.position.x, 12 + part.position.y, part.position.z);
        bone.rotation.copy(part.rotation);
      }
    }
    if (/^geometry_armor_(?:legs|feet)/.test(armor.name)) {
      bind('leftleg', parts.rightLeg, true);
      bind('rightleg', parts.leftLeg, true);
    }
  }
  // First-person worlds hide the entity's wrapper, not the actual skin layers.
  for (let parent = playerCopy.parent; parent; parent = parent.parent) parent.visible = true;
}

export function releaseInventoryMirror(mirror) {
  if (!mirror) return;
  // Only these cloned skeleton textures belong to us. Geometry, materials and
  // maps belong to the live renderer; no additionalCleanup/disposeObject here.
  for (const skeleton of mirror.skeletons) skeleton.dispose();
  mirror.root.removeFromParent();
  mirror.nodes.clear();
  mirror.pairs.length = 0;
}

/**
 * Bootstrap a private classic rig before the world has published a self mesh.
 * Item/armor assembly stays in one adapter to the pinned renderer's existing
 * equipment API. This root is never added to its scene or entity registry.
 */
export function createInventoryPreviewFallback(THREE, { getAvatar, getSkin, getEntities,
  createPlayer = () => new PlayerObject(),
  loadTexture = (url, ready, failed) => new THREE.TextureLoader().load(url, ready, undefined, failed) }) {
  const root = new THREE.Group();
  const wrapper = new THREE.Group();
  const player = createPlayer();
  root.playerObject = player;
  wrapper.name = 'mesh';
  wrapper.scale.setScalar(1 / 16);
  wrapper.rotation.y = Math.PI;
  player.position.set(0, 16, 0);
  player.cape.visible = false;
  player.elytra.visible = false;
  wrapper.add(player);
  root.add(wrapper);
  let signature = '';
  let skinUrl = null;
  let texture = null;
  let ready = false;
  let disposed = false;
  let skinSequence = 0;
  let equipmentOwner = null;
  const cleanupEquipment = () => {
    // Block-item callbacks are no-ops, and the 2D item callback misses its
    // geometry. Release private meshes ourselves, retaining shared atlases.
    const held = [];
    root.traverse((node) => {
      if (/^custom_item_(?:left|right)$/.test(node.name)) held.push(node);
    });
    const world = equipmentOwner?.worldRenderer;
    const sharedMaterials = new Set(Array.isArray(world?.material) ? world.material : [world?.material]);
    const sharedTextures = new Set([world?.itemsTexture, ...[...sharedMaterials].map((material) => material?.map)]);
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    for (const hand of held) {
      hand.traverse((node) => {
        node.skeleton?.dispose();
        if (node.geometry) geometries.add(node.geometry);
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          if (!material || sharedMaterials.has(material)) continue;
          materials.add(material);
          if (material.map && !sharedTextures.has(material.map)) textures.add(material.map);
        }
      });
      hand.removeFromParent();
    }
    for (const child of [...root.children]) {
      if (child === wrapper) continue;
      child.traverse((node) => {
        node.skeleton?.dispose();
        if (node.geometry) geometries.add(node.geometry);
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) if (material) materials.add(material);
      });
      child.removeFromParent();
    }
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
  };
  return {
    root,
    get ready() { return ready; },
    update() {
      if (disposed) return;
      const skin = getSkin();
      const nextUrl = skin?.texture || '/textures/entity/player/wide/steve.png';
      if (skinUrl !== nextUrl) {
        skinUrl = nextUrl;
        ready = false;
        const sequence = ++skinSequence;
        loadTexture(nextUrl, (loaded) => {
          if (disposed || sequence !== skinSequence) { loaded.dispose(); return; }
          texture?.dispose();
          texture = loaded;
          loaded.magFilter = loaded.minFilter = THREE.NearestFilter;
          loaded.colorSpace = THREE.SRGBColorSpace;
          player.skin.map = loaded;
          player.skin.modelType = skin?.model === 'slim' ? 'slim' : 'default';
          ready = true;
        }, () => { if (sequence === skinSequence) ready = false; });
      }
      const avatar = getAvatar();
      const entities = getEntities();
      if (!avatar?.entity || typeof entities?.updateEntityEquipment !== 'function') return;
      const equipment = avatar.entity.equipment || [];
      const nextSignature = JSON.stringify(equipment);
      if (signature === nextSignature && equipmentOwner === entities) return;
      cleanupEquipment();
      root.originalEntity = { ...avatar.entity, name: 'player', type: 'player', equipment };
      // Its optional cape loader resolves the entity id in the world registry.
      // Omit only that hook, while keeping the normal player hand transforms.
      equipmentOwner = entities;
      delete root.playerObject;
      try {
        entities.updateEntityEquipment(root, rendererEntityEquipment(root.originalEntity,
          entities.mcData?.itemsByName || globalThis.mcData?.itemsByName));
      } finally { root.playerObject = player; }
      player.cape.visible = player.elytra.visible = false;
      signature = nextSignature;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      skinSequence++;
      cleanupEquipment();
      const geometries = new Set();
      const materials = new Set();
      wrapper.traverse((node) => {
        if (node.geometry) geometries.add(node.geometry);
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) if (material) materials.add(material);
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      texture?.dispose();
      root.removeFromParent();
    },
  };
}

export class InventoryPlayerPreview {
  constructor({ THREE, resolveSource, createFallback, document = globalThis.document,
    requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
    cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
    createRenderer = (options) => new THREE.WebGLRenderer(options) }) {
    Object.assign(this, { THREE, resolveSource, createFallback, document, requestFrame, cancelFrame, createRenderer });
    this.host = null;
    this.renderer = null;
    this.mirror = null;
    this.active = false;
    this.disposed = false;
    this.frame = null;
    this.lastFrame = -Infinity;
    this.turn = { yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0 };
    this.onPointer = (event) => {
      const box = this.host?.getBoundingClientRect();
      if (!box?.width || !box.height) return;
      this.turn.targetYaw = Math.max(-.55, Math.min(.55, (event.clientX - box.left) / box.width - .5));
      this.turn.targetPitch = Math.max(-.23, Math.min(.23, ((event.clientY - box.top) / box.height - .5) * .46));
    };
    this.onLeave = () => { this.turn.targetYaw = this.turn.targetPitch = 0; };
    this.onVisibility = () => this.schedule();
    document?.addEventListener('visibilitychange', this.onVisibility);
  }

  attach(host) {
    if (this.disposed) return;
    if (this.host !== host) {
      this.host?.removeEventListener('pointermove', this.onPointer);
      this.host?.removeEventListener('pointerleave', this.onLeave);
      this.host = host;
      host.addEventListener('pointermove', this.onPointer);
      host.addEventListener('pointerleave', this.onLeave);
    }
    if (this.renderer) host.append(this.renderer.domElement);
    this.setVisible(true);
  }

  setVisible(visible) {
    if (!visible && !this.active && !this.mirror && !this.fallback) return;
    this.active = Boolean(visible) && !this.disposed;
    if (!this.active) {
      if (this.frame !== null) this.cancelFrame?.(this.frame);
      this.frame = null;
      this.lastFrame = -Infinity;
      releaseInventoryMirror(this.mirror);
      this.mirror = null;
      this.fallback?.dispose();
      this.fallback = null;
      this.renderer?.clear();
      this.onLeave();
    } else this.schedule();
  }

  schedule() {
    if (!this.active || this.disposed || this.document?.hidden || this.frame !== null || !this.requestFrame) return;
    this.frame = this.requestFrame((now) => {
      this.frame = null;
      if (!this.active || this.document?.hidden) return;
      if (now - this.lastFrame >= 1000 / 30) {
        this.lastFrame = now;
        this.render();
      }
      this.schedule();
    });
  }

  render() {
    if (!this.active || !this.host?.isConnected) { this.setVisible(false); return; }
    const T = this.THREE;
    try {
      let source = this.resolveSource();
      if (!source && this.createFallback) {
        this.fallback ??= this.createFallback();
        this.fallback.update();
        source = this.fallback.ready ? this.fallback.root : null;
      }
      if (!source) {
        releaseInventoryMirror(this.mirror);
        this.mirror = null;
        this.renderer?.clear();
        this.host.dataset.previewState = 'waiting';
        return;
      }
      if (!this.renderer) {
        this.renderer = this.createRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
        this.renderer.setClearColor(0, 0);
        this.renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
        this.renderer.domElement.setAttribute('aria-hidden', 'true');
        this.host.append(this.renderer.domElement);
        this.scene = new T.Scene();
        this.stage = new T.Group();
        this.scene.add(this.stage, new T.HemisphereLight(0xffffff, 0x858da0, 2.2));
        const light = new T.DirectionalLight(0xffffff, 2.1);
        light.position.set(-3, 5, 6);
        this.scene.add(light);
        this.camera = new T.OrthographicCamera(-1, 1, 1, -1, .01, 30);
      }
      if (!inventoryMirrorMatches(this.mirror, source)) {
        releaseInventoryMirror(this.mirror);
        this.mirror = mirrorInventoryPlayer(T, source);
        this.stage.add(this.mirror.root);
        if (this.fallback && source !== this.fallback.root) {
          this.fallback.dispose();
          this.fallback = null;
        }
      }
      this.turn.yaw += (this.turn.targetYaw - this.turn.yaw) * .20;
      this.turn.pitch += (this.turn.targetPitch - this.turn.pitch) * .20;
      poseInventoryPlayer(this.mirror, this.turn.yaw, this.turn.pitch);
      this.stage.updateMatrixWorld(true);
      // Use visible body/equipment bounds, excluding hidden cape/debug layers.
      const bounds = new T.Box3();
      this.mirror.root.traverse((node) => {
        if (!node.isMesh || !node.geometry) return;
        for (let parent = node; parent; parent = parent.parent) if (!parent.visible) return;
        if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
        if (node.geometry.boundingBox) bounds.union(node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld));
      });
      if (bounds.isEmpty()) { this.host.dataset.previewState = 'waiting'; return; }
      const size = bounds.getSize(new T.Vector3());
      const center = bounds.getCenter(new T.Vector3());
      const width = this.host.clientWidth || 104;
      const height = this.host.clientHeight || 140;
      const aspect = width / height;
      const viewHeight = Math.max(2.5, size.y * 1.14, size.x / aspect * 1.14);
      this.camera.left = -viewHeight * aspect / 2;
      this.camera.right = viewHeight * aspect / 2;
      this.camera.top = viewHeight / 2;
      this.camera.bottom = -viewHeight / 2;
      this.camera.position.set(center.x, center.y + .10, center.z + 8);
      this.camera.lookAt(center);
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false);
      this.renderer.render(this.scene, this.camera);
      this.host.dataset.previewState = 'ready';
      this.host.dataset.previewSource = source === this.fallback?.root ? 'standalone' : 'world';
    } catch {
      // Context creation may fail on constrained browsers; keep the item UI.
      this.host.dataset.previewState = 'unavailable';
      this.setVisible(false);
    }
  }

  reset() { this.setVisible(false); }

  dispose() {
    if (this.disposed) return;
    this.reset();
    this.disposed = true;
    this.document?.removeEventListener('visibilitychange', this.onVisibility);
    this.host?.removeEventListener('pointermove', this.onPointer);
    this.host?.removeEventListener('pointerleave', this.onLeave);
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.host = this.renderer = null;
  }
}
