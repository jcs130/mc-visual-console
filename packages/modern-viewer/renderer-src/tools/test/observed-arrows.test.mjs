import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createObservedArrowVisual, observedArrowVariant, observedArrowDirection, refreshObservedArrowVisual } from '../../src/modern-viewer/observed-arrows.js';

test('Mineflayer arrows use original Java quads and matching version texture, not a cone overlay', () => {
  const paths = [], textureLoader = { load(path, done) {
    paths.push(path); const texture = new THREE.Texture({ width: 32, height: 32 }); done(texture); return texture;
  } };
  for (const version of ['1.20.6', '1.21.1']) for (const name of ['arrow', 'spectral_arrow', 'tipped_arrow']) {
    const root = createObservedArrowVisual(name, {}, { version, textureLoader });
    assert.equal(root.visible, true);
    const meshes = []; root.traverse(o => { if (o.isMesh) meshes.push(o); });
    assert.equal(meshes.length, 6);
    assert.equal(meshes.reduce((n, m) => n + m.geometry.index.count / 3, 0), 12);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    assert.ok(Math.abs(box.max.y - box.min.y - .9) < 1e-6);
    assert.ok(Math.abs(box.max.y - .225) < 1e-6);
    assert.equal(meshes[0].material.map.flipY, true);
    for (const mesh of meshes) mesh.geometry.dispose(); meshes[0].material.dispose();
  }
  assert.deepEqual(paths, ['1.20.6', '1.21.1'].flatMap(v => ['arrow', 'spectral_arrow', 'tipped_arrow'].map(n => `/textures/${v}/entity/projectiles/${n}.png`)));
  const late = createObservedArrowVisual('arrow', {}, { version: '1.21.1', textureLoader });
  const before = late.userData.arrowTexture;
  refreshObservedArrowVisual(late, 'arrow', { metadata: { 10: 0x123456 } }, '1.21.1');
  assert.equal(late.userData.arrowVariant, 'tipped_arrow');
  assert.notEqual(late.userData.arrowTexture, before, 'late metadata updates the selected original texture');
  assert.equal(createObservedArrowVisual('arrow', {}, { version: 'unknown', textureLoader }), null);
});

test('first frame follows observed velocity; stationary arrows retain direction rather than jitter or predict', () => {
  const entity = { pos: { x: 0, y: 64, z: 0 }, velocity: { x: 2, y: -.5, z: 1 } };
  const first = observedArrowDirection(entity, null, null);
  assert.ok(first.distanceTo(new THREE.Vector3(2, -.5, 1).normalize()) < 1e-9);
  const moved = observedArrowDirection({ ...entity, pos: { x: 1, y: 63.7, z: 1 } }, entity.pos, first);
  assert.ok(moved.distanceTo(new THREE.Vector3(1, -.3, 1).normalize()) < 1e-9);
  assert.deepEqual(observedArrowDirection(entity, entity.pos, moved).toArray(), moved.toArray());
  assert.equal(observedArrowDirection({}, null, null), null);
  assert.deepEqual(observedArrowDirection({ yaw: Math.PI / 2, pitch: 0 }, null, null).toArray().map(v => Math.round(v)), [-1, 0, -0]);
});

test('only actual Java effect metadata selects tipped arrows', () => {
  assert.equal(observedArrowVariant('arrow', { metadata: { 10: 0x123456 } }), 'tipped_arrow');
  assert.equal(observedArrowVariant('minecraft:arrow', { metadata: { 10: -1 } }), 'arrow');
  assert.equal(observedArrowVariant('spectral_arrow', { metadata: { 10: 1 } }), 'spectral_arrow');
  assert.equal(observedArrowVariant('unknown:arrow', {}), null);
});
