import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PerspectiveCamera, Vector3 } from 'three';
import { Vec3 } from 'vec3';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { advanceReveal, createCutawayUniforms, cutawayMask, patchCutawayMaterial, hasRoomCeiling, CEILING_SCAN_HEIGHT } from '../../src/modern-viewer/room-visibility.js';

const point = (x, y, z) => new Vector3(x, y, z);
test('tall room ceilings are detected within a bounded vertical scan', () => {
  for (const height of [2, 6, CEILING_SCAN_HEIGHT]) {
    let samples = 0;
    const ceiling = new Set([`0,${64 + height},0`, `1,${64 + height},0`, `0,${64 + height},1`]);
    assert.equal(hasRoomCeiling({ x: 0.3, y: 64.3, z: 0.3 }, { isSolidBlock(x, y, z) {
      samples++; return ceiling.has(`${x},${y},${z}`);
    } }), true);
    assert.ok(samples <= CEILING_SCAN_HEIGHT + 4);
  }
  assert.equal(hasRoomCeiling({ x: 0, y: 64, z: 0 }, { isSolidBlock: (_x, y) => y > 64 + CEILING_SCAN_HEIGHT }), false);
});
function fixture(yaw = Math.PI / 4, distance = 16, pitch = 0.82) {
  const target = point(0, 65, 0);
  const camera = new PerspectiveCamera(48, 16 / 9, 0.05, 200);
  camera.position.copy(target).add(point(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(distance));
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  const settings = { camera: camera.position, target, footY: 64.05, cutoffY: 65.95, covered: false,
    right: new Vector3().setFromMatrixColumn(camera.matrixWorld, 0),
    up: new Vector3().setFromMatrixColumn(camera.matrixWorld, 1),
    forward: camera.getWorldDirection(new Vector3()) };
  return { camera, settings, front: camera.position.clone().lerp(target, 0.6) };
}

test('view aperture opens the whole character centre at every zoom and isometric corner', () => {
  for (const yaw of [Math.PI / 4, 3 * Math.PI / 4, -Math.PI / 4, -3 * Math.PI / 4]) {
    for (const distance of [8, 16, 24]) for (const pitch of [0.82, 1.08]) {
      const { settings, front } = fixture(yaw, distance, pitch);
      assert.equal(cutawayMask(front, settings), 1, 'centre has no residual grid');
      const bodyEdge = front.clone().addScaledVector(settings.right, 0.3).addScaledVector(settings.up, -0.5);
      assert.equal(cutawayMask(bodyEdge, settings), 1, 'arms and feet have a clear margin');
      const side = front.clone().addScaledVector(settings.right, 2);
      assert.equal(cutawayMask(side, settings), 0, 'nearby scenery to the side stays solid');
      const behind = settings.target.clone().addScaledVector(settings.forward, 2);
      assert.equal(cutawayMask(behind, settings), 0, 'terrain behind the character stays solid');
    }
  }
});

test('outdoor terrain above the avatar is preserved outside its projected silhouette', () => {
  const { settings } = fixture();
  for (const x of [-20, 0, 20]) {
    assert.equal(cutawayMask(point(x, 86, 0), settings), 0);
  }
  assert.equal(cutawayMask(point(0, 64, 0), settings), 0, 'walkable floor remains');
});

test('room roof opening keeps a local boundary, the lower floor and a soft rim', () => {
  const { settings } = fixture();
  settings.covered = true;
  assert.equal(cutawayMask(point(0, 66, 0), settings), 1);
  assert.equal(cutawayMask(point(4, 65.9, 0), settings), 0);
  assert.equal(cutawayMask(point(6.1, 86, 0), settings), 0);
  const rim = cutawayMask(point(5.6, 70, 0), settings);
  assert.ok(rim > 0 && rim < 1);
});

test('floating-origin translation and display aspect do not change the aperture', () => {
  const { settings, front, camera } = fixture();
  const sample = front.clone().addScaledVector(settings.right, 0.73);
  const original = cutawayMask(sample, settings);
  assert.ok(original > 0 && original < 1);
  for (const aspect of [0.6, 1, 2.4]) {
    camera.aspect = aspect; camera.updateProjectionMatrix();
    assert.equal(cutawayMask(sample, settings), original);
  }
  const shift = point(-1200, 256, 3000);
  const moved = { ...settings, camera: settings.camera.clone().add(shift), target: settings.target.clone().add(shift),
    footY: settings.footY + shift.y, cutoffY: settings.cutoffY + shift.y };
  assert.ok(Math.abs(cutawayMask(sample.clone().add(shift), moved) - original) < 1e-9);
});

test('fade duration is refresh-rate independent and settles when a hidden tab resumes', () => {
  const sample = hz => {
    let value = 0;
    for (let frame = 0; frame < hz / 5; frame++) value = advanceReveal(value, true, 1000 / hz);
    return value;
  };
  assert.ok(Math.abs(sample(30) - sample(60)) < 1e-9);
  assert.ok(sample(60) > 0.97);
  assert.equal(advanceReveal(0, false, 20000), 0);
  let value = 1;
  for (let frame = 0; frame < 40; frame++) value = advanceReveal(value, false, 16);
  assert.equal(value, 0);
});

test('all terrain shaders share one live mask without changing transparent/depth state', () => {
  const uniforms = createCutawayUniforms();
  const materials = Array.from({ length: 3 }, () => ({
    vertexShader: 'void main() { vec3 relativePos = vec3(0.0); }', fragmentShader: 'void main() {}',
    transparent: false, depthWrite: true,
  }));
  for (const material of materials) assert.equal(patchCutawayMaterial(material, uniforms), true);
  uniforms.u_lanternReveal.value = 0.8;
  for (const material of materials) {
    assert.equal(material.uniforms.u_lanternReveal.value, 0.8);
    assert.equal(material.transparent, false);
    assert.equal(material.depthWrite, true);
    const shader = material.fragmentShader;
    material.needsUpdate = false;
    assert.equal(patchCutawayMaterial(material, uniforms), true);
    assert.equal(material.needsUpdate, false);
    assert.equal(material.fragmentShader, shader);
  }
  const unsupported = { vertexShader: 'void main() {}', fragmentShader: 'void main() {}' };
  assert.equal(patchCutawayMaterial(unsupported, uniforms), false);
  assert.equal(unsupported.fragmentShader, 'void main() {}');
});

test('render-time mask follows interpolated entity and camera between network updates', () => {
  const client = readFileSync(new URL('../../src/modern-viewer/client.js', import.meta.url), 'utf8');
  const start = client.indexOf('function updateDungeonVisibilityFrame() {');
  const end = client.indexOf('function scheduleDungeonHoverPick(', start);
  const camera = new PerspectiveCamera(); camera.position.set(4, 10, 8); camera.lookAt(0, 1, 0); camera.updateMatrixWorld();
  const uniforms = createCutawayUniforms(); uniforms.u_lanternCutawayEnabled.value = 2;
  const root = { getWorldPosition: out => out.set(2.5, 0.25, 3.5) };
  const context = { performance, rendererReady: true, usesWorldAvatar: true, dungeonRevealLastFrameAt: null,
    dungeonRevealTarget: true, dungeonVisibilityUniforms: uniforms, latestPosition: { pos: point(0, 64, 0) },
    dungeonOcclusionTargetScene: new Vector3(), focusedCharacterId: null, pendingAvatarState: { entity: { id: 7 } },
    observerOffset: new Vec3(0, 0, 0), advanceReveal, roomCutoffWorldY: (y) => Math.floor(y) + 1.95,
    resolveObserverTargetPosition: () => ({ position: point(0, 64, 0) }),
    world: { camera, sceneOrigin: { toWorldX: x => x + 800, toWorldY: y => y + 64, toWorldZ: z => z - 900,
      toSceneX: x => x - 800, toSceneY: y => y - 64, toSceneZ: z => z + 900 }, entities: { entities: { 7: root } } },
  };
  const update = runInNewContext(`${client.slice(start, end)}\nupdateDungeonVisibilityFrame`, context);
  update();
  assert.deepEqual(uniforms.u_lanternCutawayTarget.value.toArray(), [2.5, 1.25, 3.5]);
  assert.ok(Math.abs(uniforms.u_lanternCutawayY.value - 1.95) < 1e-9);
  assert.deepEqual(uniforms.u_lanternCutawayCamera.value.toArray(), camera.position.toArray());
  assert.equal(context.dungeonUpperCutawayRegion.center.x, 802.5);
  root.getWorldPosition = out => out.set(2.75, 0.5, 3.75);
  update();
  assert.deepEqual(uniforms.u_lanternCutawayTarget.value.toArray(), [2.75, 1.5, 3.75]);
});
