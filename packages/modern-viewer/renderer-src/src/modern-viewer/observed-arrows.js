import * as THREE from 'three';
import { nativeArrowGeometry } from '../native-viewer/native-projectiles.js';

const variants = ['arrow', 'spectral_arrow', 'tipped_arrow'];
const textures = new Map();
export const isObservedArrow = name => variants.includes(String(name ?? '').replace(/^minecraft:/, ''));

export function observedArrowVariant(name, entity) {
  name = String(name ?? '').replace(/^minecraft:/, '');
  if (!isObservedArrow(name)) return null;
  // Java Arrow's synchronized effect colour selects the original tipped sprite.
  // Do not infer it from the shooter's held item or invent a potion colour.
  return name === 'arrow' && Number(entity?.metadata?.[10]) > 0 ? 'tipped_arrow' : name;
}

function textureEntry(version, variant, loader = new THREE.TextureLoader()) {
  if (!['1.20.6', '1.21.1'].includes(version)) return null;
  const key = `${version}/${variant}`;
  if (!textures.has(key)) {
    const entry = { ready: false, failed: false, texture: null };
    textures.set(key, entry);
    entry.texture = loader.load(`/textures/${version}/entity/projectiles/${variant}.png`, texture => {
      entry.ready = texture.image?.width === 32 && texture.image?.height === 32;
      entry.failed = !entry.ready;
    }, undefined, () => { entry.failed = true; });
    const texture = entry.texture;
    texture.flipY = true; texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
  }
  return textures.get(key);
}

export function preloadObservedArrowTextures(version) {
  for (const variant of variants) textureEntry(version, variant);
}

export function refreshObservedArrowVisual(root, name, entity, version) {
  const variant = observedArrowVariant(name, entity);
  if (variant && variant !== root.userData.arrowVariant) {
    const entry = textureEntry(version, variant);
    if (entry) {
      root.userData.arrowTexture = entry; root.userData.arrowVariant = variant;
      root.traverse(part => { if (part.isMesh) { part.material.map = entry.texture; part.material.needsUpdate = true; } });
    }
  }
  root.visible = root.userData.arrowTexture?.ready === true;
}

/** Original Java ArrowRenderer quads/UV/scale, shared with the native renderer.
 * Local +Y is flight direction for the legacy observation animation adapter. */
export function createObservedArrowVisual(name, entity, { version, textureLoader } = {}) {
  const variant = observedArrowVariant(name, entity);
  if (!variant) return null;
  const entry = textureEntry(version, variant, textureLoader);
  if (!entry) return null;
  const root = new THREE.Group(), basis = new THREE.Group(), roll = new THREE.Group(), scaled = new THREE.Group(), translated = new THREE.Group();
  root.name = 'corti-observed-arrow'; root.add(basis); basis.rotation.z = Math.PI / 2;
  basis.add(roll); roll.rotation.x = Math.PI / 4;
  roll.add(scaled); scaled.scale.setScalar(.05625); scaled.add(translated); translated.position.x = -4;
  const material = new THREE.MeshLambertMaterial({ map: entry.texture, alphaTest: .1, side: THREE.DoubleSide });
  for (const geometry of nativeArrowGeometry()) translated.add(new THREE.Mesh(geometry, material));
  root.userData.arrowTexture = entry;
  root.userData.arrowVariant = variant;
  root.userData.geometrySource = 'Minecraft_original_ArrowRenderer';
  root.visible = entry.ready;
  return root;
}

export function observedArrowDirection(entity, previous, lastDirection) {
  const pos = entity?.pos ?? entity?.position;
  if (previous && pos) {
    const motion = new THREE.Vector3(pos.x - previous.x, pos.y - previous.y, pos.z - previous.z);
    if (motion.lengthSq() > .0002) return motion.normalize();
  }
  // The first spawn has no preceding position; its actual velocity is useful.
  if (!previous && entity?.velocity) {
    const motion = new THREE.Vector3(entity.velocity.x, entity.velocity.y, entity.velocity.z);
    if (Number.isFinite(motion.lengthSq()) && motion.lengthSq() > .0002) return motion.normalize();
  }
  if (lastDirection) return lastDirection.clone();
  if (Number.isFinite(entity?.yaw) && Number.isFinite(entity?.pitch)) {
    const c = Math.cos(entity.pitch);
    return new THREE.Vector3(-Math.sin(entity.yaw) * c, Math.sin(entity.pitch), -Math.cos(entity.yaw) * c);
  }
  return null;
}
