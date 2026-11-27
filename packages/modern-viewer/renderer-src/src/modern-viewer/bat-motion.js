import * as THREE from 'three';
import { nativeCubeFaces } from '../native-viewer/native-entity-model.js';
import clips from './bat-motion-data.json' with { type: 'json' };

// Java 1.21.11 BatModel and BatAnimation, in original model pixels and degrees.
// Transforms below affect the rig only. Position and facing follow the server.
const versions = new Set(['1.21.11', '1.21.1', '1.20.6']);
const assets = new Map();
const visuals = new WeakMap();

export function createBatRig(material) {
  const root = new THREE.Group(), bones = new Map();
  root.name = 'java-bat';
  root.scale.set(-1 / 16, -1 / 16, 1 / 16);
  root.position.y = 1.501;
  for (const part of clips.parts) {
    const positions = [], normals = [], uvs = [], indices = [];
    for (const cube of part.cubes) for (const face of nativeCubeFaces(cube, [32, 32])) {
      const base = positions.length / 3;
      positions.push(...face.position);
      uvs.push(...face.uv);
      for (let i = 0; i < 4; i++) normals.push(...face.normal);
      indices.push(...face.indices.map(i => i + base));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    const bone = new THREE.Mesh(geometry, material);
    bone.name = part.name;
    bone.rotation.order = 'ZYX';
    bone.position.fromArray(part.pivot);
    bones.set(part.name, bone);
    (bones.get(part.parent) ?? root).add(bone);
  }
  return { root, bones };
}

export function poseBat(rig, resting, seconds) {
  const t = seconds % .5;
  if (rig.resting !== resting) {
    for (const part of clips.parts) {
      const bone = rig.bones.get(part.name);
      bone.position.fromArray(part.pivot);
      bone.rotation.set(0, 0, 0, 'ZYX');
    }
    rig.resting = resting;
  } else if (resting) return;
  for (const { bone: name, frames, kind } of resting ? clips.rest : clips.fly) {
    let i = 0;
    while (i + 1 < frames.length && frames[i + 1][0] <= t) i++;
    const a = frames[i], b = frames[i + 1] ?? a;
    const f = b === a ? 0 : Math.max(0, (t - a[0]) / (b[0] - a[0]));
    const x = THREE.MathUtils.lerp(a[1], b[1], f), y = THREE.MathUtils.lerp(a[2], b[2], f),
      z = THREE.MathUtils.lerp(a[3], b[3], f);
    const bone = rig.bones.get(name);
    if (kind === 'rotation') bone.rotation.set(x * Math.PI / 180, y * Math.PI / 180, z * Math.PI / 180, 'ZYX');
    else {
      const [px, py, pz] = clips.parts.find(part => part.name === name).pivot;
      bone.position.set(px + x, py - y, pz + z);
    }
  }
}

export function updateBatVisual(scene, entity, now, version, registry) {
  if (!versions.has(version)) return;
  let asset = assets.get(version);
  if (!asset) {
    asset = { ready: false };
    assets.set(version, asset);
    const texture = new THREE.TextureLoader().load('/textures/' + version + '/entity/bat.png', image => {
      asset.ready = image.image.width === 32 && image.image.height === 32;
    });
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    asset.material = new THREE.MeshLambertMaterial({ map: texture, alphaTest: .1, side: THREE.DoubleSide });
  }
  if (!asset.ready) return;
  let rig = visuals.get(scene);
  if (!rig) {
    rig = createBatRig(asset.material);
    visuals.set(scene, rig);
    scene.add(rig.root);
  }
  const native = scene.children.find(child => child.name === 'mesh');
  if (native) native.visible = false;
  rig.root.visible = !(Number(entity.metadata?.[0]) & 32);
  const flags = registry?.entitiesByName?.bat?.metadataKeys?.indexOf('flags') ?? -1;
  if (rig.root.visible) poseBat(rig, !!(Number(entity.metadata?.[flags]) & 1), now / 1000 + (Number(entity.id) || 0) * .037);
}
