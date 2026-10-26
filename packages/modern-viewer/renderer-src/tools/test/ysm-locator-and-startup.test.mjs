import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { nativeYsmItemMount } from '../../src/native-viewer/native-ysm-item-mount.js'
import { nativeHeldItemTransform } from '../../src/native-viewer/native-held-items.js'
import { paperYsmItemMount } from '../../src/modern-viewer/paper-ysm-items.js'
import { createPaperYsmActor } from '../../src/modern-viewer/paper-ysm.js'

const near = (a, b, message) => assert.ok(a.distanceTo(b) < 1e-6, message + ': ' + a.toArray())
test('YSM locator converts the grip and all three item axes into the original item-layer space', () => {
  // Independent world-space reference: the original 2.4.1 locator helper feeds
  // the item layer without LivingEntityRenderer's ModelPart X/Y reflection.
  // Its neutral grip is 1px below, 0.1 blocks behind, followed by Rx(-90).
  const world = new THREE.Matrix4().makeScale(-1, -1, 1).multiply(nativeYsmItemMount(nativeHeldItemTransform()))
  near(new THREE.Vector3().applyMatrix4(world), new THREE.Vector3(0, -.0625, -.1), 'grip')
  near(new THREE.Vector3(1, 0, 0).transformDirection(world), new THREE.Vector3(1, 0, 0), 'right')
  near(new THREE.Vector3(0, 1, 0).transformDirection(world), new THREE.Vector3(0, 0, -1), 'up')
  near(new THREE.Vector3(0, 0, 1).transformDirection(world), new THREE.Vector3(0, 1, 0), 'front')
})

test('both YSM adapters retain original handed displays for tools, sprites, blocks and shields', () => {
  for (const arm of ['right', 'left']) for (const display of [
    { rotation: [0, arm === 'right' ? -90 : 90, arm === 'right' ? 55 : -55], translation: [0, 4, .5], scale: [.85, .85, .85] },
    { rotation: [-80, 260, -40], translation: [-1, -2, 2.5], scale: [.9, .9, .9] },
    { rotation: [0, 0, 0], translation: [0, 3, 1], scale: [.55, .55, .55] },
    { rotation: [75, 45, 0], translation: [0, 2.5, 0], scale: [.375, .375, .375] },
    { rotation: [0, 90, 0], translation: [10, 6, -4], scale: [1, 1, 1] }
  ]) {
    const transform = nativeHeldItemTransform(display, arm), matrix = nativeYsmItemMount(transform)
    assert.deepEqual(paperYsmItemMount(display, arm).elements, matrix.elements)
    for (const point of [[0, 0, 0], [.25, .4, 0], [-.25, -.4, 0], [0, 0, .25]]) {
      // Original Java ItemTransform order (rotationXYZ), then YSM's Rx(-90)
      // and offset. Exercise a blade/handle pair, not only matrix equality.
      const expected = new THREE.Vector3(...point).multiply(new THREE.Vector3(...transform.scale))
      expected.applyAxisAngle(new THREE.Vector3(0, 0, 1), transform.radians[2])
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), transform.radians[1])
        .applyAxisAngle(new THREE.Vector3(1, 0, 0), transform.radians[0])
        .add(new THREE.Vector3(...transform.translation))
        .applyAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2).add(new THREE.Vector3(0, -.0625, -.1))
      const actual = new THREE.Vector3(...point).applyMatrix4(matrix).multiply(new THREE.Vector3(-1, -1, 1))
      near(actual, expected, arm + ' original item point')
    }
  }
})

test('authored bind-pose props never render before a valid pose, and deliberate original extras still work', async () => {
  const encode = value => ({ base64: Buffer.from(JSON.stringify(value)).toString('base64') })
  const cube = { origin: [-1, 0, -1], size: [2, 2, 2], uv: [0, 0] }
  const bundle = { modelId: 'prop-fixture', model: 'm', animation: 'a', animations: { extra: 'e' }, textures: { main: 't' }, files: {
    'ysm.json': encode({ spec: 2, properties: { free: true } }),
    m: encode({ format_version: '1.12.0', 'minecraft:geometry': [{ description: { texture_width: 16, texture_height: 16 },
      bones: ['Head', 'Seat', 'Parasol'].map(name => ({ name, pivot: [0, 0, 0], cubes: [cube] })) }] }),
    a: encode({ format_version: '1.8.0', animations: { idle: { loop: true, bones: {} },
      pre_parallel0: { loop: true, bones: { Seat: { scale: 0 } } },
      parallel0: { loop: true, bones: { Parasol: { scale: 0 } } } } }),
    e: encode({ format_version: '1.8.0', animations: { extra1: { loop: true, bones: { Seat: { scale: 1 } } },
      extra2: { loop: true, bones: { Parasol: { scale: 'query.unavailable' } } } } }), t: { base64: '' }
  } }
  const actor = await createPaperYsmActor(bundle, 'main', { loadTexture: async () => new THREE.Texture() })
  try {
    assert.equal(actor.model.root.visible, false)
    let drawn = 0; actor.root.traverseVisible(node => { if (node.isMesh) drawn++ }); assert.equal(drawn, 0)
    actor.animate({ motion: { onGround: true } }, 0)
    assert.equal(actor.model.root.visible, true)
    for (const name of ['Seat', 'Parasol']) assert.equal(actor.model.bones.get(name).scale.length(), 0)
    actor.animate({ animation: 'extra1', motion: { onGround: true } }, 100)
    assert.equal(actor.model.root.visible, true); assert.equal(actor.model.bones.get('Seat').scale.x, 1)
    actor.animate({ animation: 'extra2', motion: { onGround: true } }, 200)
    assert.ok(actor.animationState.errors.length > 0)
    for (const name of ['Seat', 'Parasol']) assert.equal(actor.model.bones.get(name).scale.length(), 0)
    actor.animate({ motion: { onGround: true } }, 300)
    assert.equal(actor.model.root.visible, true); assert.deepEqual(actor.animationState.errors, [])
    for (const name of ['Seat', 'Parasol']) assert.equal(actor.model.bones.get(name).scale.length(), 0)
  } finally { actor.dispose() }
})
