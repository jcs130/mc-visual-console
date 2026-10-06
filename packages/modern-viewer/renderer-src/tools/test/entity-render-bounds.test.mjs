import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Bone, BoxGeometry, Float32BufferAttribute, Frustum, Group, Matrix4,
  Mesh, MeshBasicMaterial, PerspectiveCamera, Skeleton, SkinnedMesh, Uint16BufferAttribute } from 'three';
import { installEntityRenderBounds, stabilizeEntityRenderBounds } from '../../src/modern-viewer/entity-render-bounds.js';

test('an animated model inside the view is not rejected by its cached rest-pose sphere', () => {
  const geometry = new BoxGeometry(1, 1, 1);
  const count = geometry.attributes.position.count;
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) weights[i * 4] = 1;
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));
  const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial());
  const bone = new Bone();
  mesh.add(bone);
  mesh.position.set(20, 0, -5);
  mesh.updateMatrixWorld(true);
  mesh.bind(new Skeleton([bone]));
  mesh.computeBoundingSphere();
  const restSphere = mesh.boundingSphere.clone();
  bone.position.x = -20;
  mesh.updateMatrixWorld(true);
  const camera = new PerspectiveCamera(60, 1, .1, 100);
  camera.updateMatrixWorld(true);
  const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(
    camera.projectionMatrix, camera.matrixWorldInverse));
  assert.equal(frustum.intersectsObject(mesh), false, 'cached sphere is still outside');
  mesh.computeBoundingSphere();
  assert.equal(frustum.intersectsObject(mesh), true, 'actual animated vertices are inside');
  // The actor root keeps the renderer's distance/section policy while this
  // mesh remains drawable with the renderer's cached rest-pose sphere.
  mesh.boundingSphere.copy(restSphere);
  assert.equal(frustum.intersectsObject(mesh), false);
  stabilizeEntityRenderBounds(mesh);
  assert.equal(!mesh.frustumCulled || frustum.intersectsObject(mesh), true);
});

test('initial and replaced armor use the animation policy without changing root visibility or static geometry', () => {
  const root = new Group();
  root.visible = false;
  const terrain = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  const firstArmor = new SkinnedMesh(new BoxGeometry(), new MeshBasicMaterial());
  root.add(terrain, firstArmor);
  const entities = { entities: { 7: root }, update(entity) {
    root.remove(firstArmor);
    root.add(entity.armor);
    return 'updated';
  } };
  const original = entities.update;
  const controller = installEntityRenderBounds(entities);
  assert.equal(firstArmor.frustumCulled, false);
  const armor = new SkinnedMesh(new BoxGeometry(), new MeshBasicMaterial());
  assert.equal(entities.update({ id: 7, armor }), 'updated');
  assert.equal(armor.frustumCulled, false);
  assert.equal(terrain.frustumCulled, true);
  assert.equal(root.visible, false);
  controller.dispose();
  assert.equal(entities.update, original);
});
