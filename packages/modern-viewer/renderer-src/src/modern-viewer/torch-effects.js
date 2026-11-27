import * as THREE from 'three';
import { Vec3 } from 'vec3';

const offsets = { east: [-.27, 0], west: [.27, 0], north: [0, .27], south: [0, -.27] };
const styles = {
  torch: ['flame', 0xffaa48], soul_torch: ['soul_fire_flame', 0x66e7ff],
  copper_torch: ['copper_fire_flame', 0x6bffaa], redstone_torch: ['flame', 0xff3830],
};
const limit = 24;

export function torchTip(name, properties, x, y, z) {
  const type = name.replace('wall_torch', 'torch');
  if (!Object.hasOwn(styles, type) || (type === 'redstone_torch' && String(properties.lit) === 'false')) return null;
  const wall = name.includes('wall_'), offset = wall ? offsets[properties.facing] : [0, 0];
  if (!offset) return null;
  return { x: x + .5 + offset[0], y: y + (wall ? .92 : .70), z: z + .5 + offset[1], type };
}

export function nearbyTorches(grid, registry, cx, cy, cz) {
  const result = [], cell = new Vec3(0, 0, 0);
  for (let x = cx - 8; x <= cx + 8; x++) for (let z = cz - 8; z <= cz + 8; z++) {
    const column = grid.columns.get(`${Math.floor(x / 16) * 16},${Math.floor(z / 16) * 16}`);
    if (!column) continue;
    cell.x = x & 15; cell.z = z & 15;
    for (cell.y = Math.max(cy - 4, grid.minY); cell.y <= Math.min(cy + 4, grid.maxY - 1); cell.y++) {
      const name = registry.blocksByStateId[column.getBlockStateId(cell)]?.name;
      if (!name?.endsWith('torch')) continue;
      const tip = torchTip(name, column.getBlock(cell)?.getProperties() ?? {}, x, cell.y, z);
      if (tip) result.push(tip);
    }
  }
  const distance = p => (p.x - cx) ** 2 + (p.y - cy) ** 2 + (p.z - cz) ** 2;
  return result.sort((a,b) => distance(a) - distance(b)).slice(0, limit);
}

function haloTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d'), gradient = ctx.createRadialGradient(16,16,0,16,16,16);
  gradient.addColorStop(0, 'rgba(255,255,255,.45)');
  gradient.addColorStop(.45, 'rgba(255,255,255,.13)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0,0,32,32);
  return new THREE.CanvasTexture(canvas);
}

export class TorchEffects {
  constructor(version) {
    this.version = version;
    this.group = new THREE.Group();
    this.group.name = 'nearby-torch-effects';
    this.batches = new Map();
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.transform = new THREE.Object3D();
    this.cameraPosition = new THREE.Vector3();
    this.color = new THREE.Color();
    this.tips = [];
    this.nextScan = 0;
  }
  batch(sprite) {
    if (this.batches.has(sprite)) return this.batches.get(sprite);
    const glow = sprite === 'halo';
    const texture = glow ? haloTexture() : new THREE.TextureLoader().load('/textures/' + this.version + '/particle/' + sprite + '.png');
    if (!glow) texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false,
      blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false });
    const mesh = new THREE.InstancedMesh(this.geometry, material, limit);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(mesh);
    this.batches.set(sprite, mesh);
    return mesh;
  }
  update(world, grid, registry, now, settings, policy) {
    this.group.visible = settings.particles !== false;
    if (this.group.parent !== world.scene) { world.scene.add(this.group); this.scanKey = null; }
    if (!this.group.visible || !registry?.blocksByStateId) return;
    const o = world.sceneOrigin, camera = world.camera;
    camera.getWorldPosition(this.cameraPosition);
    const x = Math.floor(o.toWorldX(this.cameraPosition.x)), y = Math.floor(o.toWorldY(this.cameraPosition.y)),
      z = Math.floor(o.toWorldZ(this.cameraPosition.z));
    if (now >= this.nextScan || grid !== this.grid) {
      const key = [x,y,z,grid.revision].join('/');
      if (key !== this.scanKey || grid !== this.grid) this.tips = nearbyTorches(grid, registry, x, y, z);
      this.scanKey = key; this.grid = grid; this.nextScan = now + 350;
    }
    for (const mesh of this.batches.values()) mesh.count = 0;
    camera.getWorldQuaternion(this.transform.quaternion);
    for (const tip of this.tips) {
      const [sprite, tint] = styles[tip.type];
      const pulse = Math.sin(now * .011 + tip.x * 1.7 + tip.z * 2.3);
      this.transform.position.set(o.toSceneX(tip.x), o.toSceneY(tip.y + .008 * pulse), o.toSceneZ(tip.z));
      const draw = (batch, size, color) => {
        this.transform.scale.setScalar(size);
        this.transform.updateMatrix();
        batch.setColorAt(batch.count, this.color.setHex(color));
        batch.setMatrixAt(batch.count++, this.transform.matrix);
      };
      draw(this.batch(sprite), .155 + pulse * .018, tip.type === 'redstone_torch' ? tint : 0xffffff);
      if (settings.quality !== 'performance' && policy?.mode !== 'performance') draw(this.batch('halo'), .38 + pulse * .035, tint);
    }
    for (const mesh of this.batches.values()) {
      if (mesh.count) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
    }
  }
}
