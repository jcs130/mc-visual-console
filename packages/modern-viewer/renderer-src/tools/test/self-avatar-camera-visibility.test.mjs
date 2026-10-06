import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene } from 'three';
import { installSelfAvatarCameraVisibility } from '../../src/modern-viewer/self-avatar-camera-visibility.js';

function fixture() {
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  scene.add(camera);
  const avatar = new Group();
  avatar.name = 'self';
  avatar.originalEntity = { id: 7, name: 'player', isSelf: true, metadata: [0] };
  for (const name of ['skin', 'geometry_armor_head', 'custom_item_right']) {
    const child = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshBasicMaterial());
    child.name = name;
    avatar.add(child);
  }
  const other = new Group();
  other.name = 'other player';
  const special = new Group();
  special.originalEntity = { id: 7 };
  scene.add(avatar, other, special);
  const world = {
    camera,
    cameraCollisionBlockCache: { isSolidBlock() { throw Error('visibility must not change wall collision'); } },
    entities: {
      entities: { '7': avatar, '8': other },
      playerEntity: special,
      render() {
        // This is minecraft-renderer's per-frame visibility reset.
        avatar.visible = true;
        other.visible = true;
        special.visible = true;
      },
    },
  };
  return { world, camera, avatar, other, special };
}

test('close third-person camera hides whole self hierarchy after renderer reset, without moving camera or walls', () => {
  const { world, camera, avatar, other, special } = fixture();
  camera.position.set(0, 0, 0.4);
  const controller = installSelfAvatarCameraVisibility(world, () => 7);
  world.entities.render();
  assert.equal(avatar.visible, false);
  assert.equal(special.visible, false);
  assert.equal(other.visible, true);
  assert.deepEqual(avatar.children.map(part => part.name), ['skin', 'geometry_armor_head', 'custom_item_right']);
  assert.deepEqual(camera.position.toArray(), [0, 0, 0.4]);
  assert.equal(controller.diagnostics.hiddenForNearCamera, true);
  controller.dispose();
});

test('a camera outside the body restores visibility with a rotated floating origin', () => {
  const { world, camera, avatar, special } = fixture();
  const scene = avatar.parent;
  const shiftedOrigin = new Group();
  shiftedOrigin.position.set(-864, 92, 231);
  scene.add(shiftedOrigin);
  shiftedOrigin.add(avatar);
  const cameraRig = new Group();
  world.camera.parent.remove(camera);
  shiftedOrigin.add(cameraRig);
  cameraRig.add(camera);
  cameraRig.rotation.x = -0.82; // 2.5D camera pitch
  camera.position.z = 0.4;
  const controller = installSelfAvatarCameraVisibility(world, () => 7);
  world.entities.render();
  assert.equal(avatar.visible, false);
  camera.position.z = 1.95;
  world.entities.render();
  assert.equal(avatar.visible, true);
  camera.position.z = 2.3;
  world.entities.render();
  assert.equal(avatar.visible, true);
  assert.equal(special.visible, false);
  assert.ok(Math.abs(controller.diagnostics.distance - 2.3) < 1e-9);
  assert.equal(controller.diagnostics.hiddenForNearCamera, false);
  controller.dispose();
});

test('wall collision does not blink the player when an outside camera crosses the old feet-distance threshold', () => {
  const { world, camera, avatar } = fixture();
  const controller = installSelfAvatarCameraVisibility(world, () => 7);
  for (let frame = 0; frame < 240; frame++) {
    camera.position.set(0, 1.6, 0.5 + 1.05 * (1 + Math.sin(frame / 8)) / 2);
    world.entities.render();
    assert.equal(avatar.visible, true, `outside body, frame ${frame}`);
  }
  camera.position.set(0, 1.6, 0.2);
  world.entities.render();
  assert.equal(avatar.visible, false);
  camera.position.set(0, 1.6, 0.5);
  world.entities.render();
  assert.equal(avatar.visible, true);
  controller.dispose();
});

test('far camera respects protocol invisibility and missing normal self does not revive duplicate mesh', () => {
  const { world, camera, avatar, special } = fixture();
  camera.position.z = 4;
  const originalRender = world.entities.render;
  world.entities.render = function () { originalRender(); avatar.visible = false; };
  avatar.originalEntity.metadata[0] = 0x20;
  const hiddenController = installSelfAvatarCameraVisibility(world, () => 7);
  world.entities.render();
  assert.equal(avatar.visible, false);
  assert.equal(hiddenController.diagnostics.hiddenForNearCamera, false);
  delete world.entities.entities['7'];
  world.entities.render();
  assert.equal(special.visible, false);
  assert.equal(hiddenController.diagnostics.distance, null);
  hiddenController.dispose();
});

test('tracked self remains visible through transient section-culling rejection', () => {
  const { world, camera, avatar } = fixture();
  camera.position.z = 4;
  let frame = 0;
  world.entities.render = () => { avatar.visible = (++frame % 3) === 0; };
  const controller = installSelfAvatarCameraVisibility(world, () => 7);
  for (let i = 0; i < 120; i += 1) {
    world.entities.render();
    assert.equal(avatar.visible, true);
  }
  avatar.originalEntity.metadata[0] = 0x20;
  world.entities.render();
  assert.equal(avatar.visible, false);
  controller.dispose();
});

test('the special local mesh stays suppressed when its respawn ID is stale or missing', () => {
  for (const originalEntity of [{ id: 6 }, {}]) {
    const { world, camera, avatar, other, special } = fixture();
    camera.position.z = 4;
    special.originalEntity = originalEntity;
    const controller = installSelfAvatarCameraVisibility(world, () => 7);
    for (let frame = 0; frame < 120; frame++) {
      world.entities.render();
      assert.equal(avatar.visible, true);
      assert.equal(special.visible, false);
      assert.equal(other.visible, true);
    }
    controller.dispose();
  }
});

test('cutaway hides upper-floor models on every draw and restores native visibility when it clears', () => {
  const { world, camera, avatar, other } = fixture();
  camera.position.z = 4;
  other.originalEntity = { id: 8, name: 'skeleton', pos: { y: 66 } };
  let cutawayY = 64;
  const controller = installSelfAvatarCameraVisibility(world, () => 7, { getUpperCutawayY: () => cutawayY });
  for (let i = 0; i < 120; i += 1) {
    world.entities.render();
    assert.equal(avatar.visible, true);
    assert.equal(other.visible, false);
  }
  other.originalEntity.pos.y = 65;
  world.entities.render();
  assert.equal(other.visible, true);
  other.originalEntity.pos.y = 66;
  world.entities.render();
  assert.equal(other.visible, false);
  cutawayY = null;
  world.entities.render();
  assert.equal(other.visible, true);
  controller.dispose();
});

test('disposing does not overwrite a later wrapper', () => {
  const { world } = fixture();
  const controller = installSelfAvatarCameraVisibility(world, () => 7);
  const laterWrapper = function () {};
  world.entities.render = laterWrapper;
  controller.dispose();
  assert.equal(world.entities.render, laterWrapper);
});

test('cutaway follows current tracked height instead of the stale creation packet', () => {
  const { world, camera, other } = fixture();
  camera.position.z = 4;
  other.originalEntity = { id: 8, name: 'skeleton', pos: { y: 65 } };
  let trackedY = 66;
  world.sceneOrigin = { getWorldPosition: object => object === other ? { x: 0, y: trackedY, z: 0 } : undefined };
  const controller = installSelfAvatarCameraVisibility(world, () => 7, { getUpperCutawayY: () => 64 });
  world.entities.render();
  assert.equal(other.visible, false);
  trackedY = 65;
  other.originalEntity.pos.y = 90;
  world.entities.render();
  assert.equal(other.visible, true);
  trackedY = 66;
  world.entities.render();
  assert.equal(other.visible, false);
  controller.dispose();
});
