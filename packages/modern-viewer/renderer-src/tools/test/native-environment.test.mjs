import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { lockedFaceUV } from '../../src/native-viewer/uv-lock.js'
import { fiddledDistance, fuzzyBiomeQuart, biomeAt, biomeColor, climateColor, blockTint, modelOffset } from '../../src/native-viewer/native-environment.js'
import { animationFrames, frameAt, applyFrame, enableInterpolation } from '../../src/native-viewer/texture-animation.js'

// Numeric fixtures invoked the matching official client classes (1.21.1
// client SHA-1 30c73b1c5da787909b2f73340419fdf13b9def88), not this port.
test('UV locking matches native FaceBakery for rotated faces and asymmetric UV rectangles', () => {
  const cases = [
    ['down', 0, 90, 0, [2, 3, 15, 15], 90],
    ['down', 90, 270, 0, [1, 2, 13, 15], 0],
    ['up', 0, 180, 90, [3, 1, 15, 14], 90],
    ['north', 0, 270, 180, [1, 2, 13, 15], 180],
    ['south', 90, 90, 270, [1, 1, 14, 13], 0],
    ['east', 90, 180, 90, [1, 1, 14, 13], 180]
  ]
  for (const [face, x, y, r, rectangle, rotation] of cases) assert.deepEqual(lockedFaceUV([1, 2, 13, 15], r, face, { x, y }), { rectangle, rotation })
  assert.throws(() => lockedFaceUV([0, 0, 16, 16], 0, 'up', { y: 45 }), /INVALID/)
})

test('fuzzy biome distance preserves signed 64-bit seed overflow and native operation order', () => {
  for (const [seed, distance] of [['0', 1.5320552921295167], ['1', 0.642275323867798], ['-1', 0.9453088092803955], ['-9223372036854775808', 1.5320552921295167], ['12345678987654321', 0.9921988010406495]]) {
    assert.equal(fiddledDistance(BigInt(seed), -13, 16, 27, 0.25, -0.75, 0.5), distance)
  }
  const q = fuzzyBiomeQuart('-1', { x: -1, y: 64, z: -1 })
  assert.ok(q.x >= -1 && q.x <= 0 && q.z >= -1 && q.z <= 0)
  assert.throws(() => fuzzyBiomeQuart(null, { x: 0, y: 0, z: 0 }), /UNAVAILABLE/)
  assert.throws(() => fuzzyBiomeQuart('9223372036854775808', { x: 0, y: 0, z: 0 }), /INVALID/)
})

test('actual quart IDs and received biome effects choose color; missing data never gets a default biome', () => {
  const biome = { id: 91, name: 'mod:real_biome', effects: { water_color: 0x1256aa, grass_color: 0x80a050, foliage_color: 0x218041 } }
  const snapshot = { biomeSeed: '1', biomes: [biome], biomeGrid: { x: -2, y: 14, z: -2, width: 5, height: 5, depth: 5, worldMinY: -16, worldMaxY: 79, ids: Array(125).fill(91) } }
  assert.equal(biomeAt(snapshot, { x: 0, y: 64, z: 0 }), biome)
  assert.equal(blockTint(snapshot, { name: 'minecraft:oak_leaves' }, { x: 0, y: 64, z: 0 }, 0, {}), 0x218041)
  assert.equal(biomeColor(biome, 'water', {}), 0x1256aa)
  assert.equal(biomeColor({ effects: { grass_color: 0x80a050, grass_color_modifier: 'dark_forest' } }, 'grass', {}), ((0x80a050 & 0xfefefe) + 2634762) >> 1)
  assert.throws(() => biomeAt({ ...snapshot, biomes: [] }, { x: 0, y: 64, z: 0 }), /NOT_RECEIVED/)
  assert.throws(() => biomeColor({ effects: { grass_color: 1, grass_color_modifier: 'swamp' } }, 'grass', {}), /UNSUPPORTED/)
  assert.throws(() => blockTint(snapshot, { name: 'mod:oak_leaves' }, { x: 0, y: 64, z: 0 }, 0, {}), /PROVIDER_UNSUPPORTED/)
})

test('climate colormap uses clamped temperature times rainfall and fixed conifer colors', () => {
  const rgba = new Uint8Array(256 * 256 * 4)
  const pixel = ((191 << 8) | 127) * 4 // temperature .5, rainfall .5 => effective rainfall .25
  rgba.set([12, 34, 56, 255], pixel)
  assert.equal(climateColor(rgba, 0.5, 0.5), 0x0c2238)
  assert.equal(blockTint({}, { name: 'minecraft:spruce_leaves' }, {}, 0, {}), 0x619961)
  assert.equal(blockTint({}, { name: 'minecraft:birch_leaves' }, {}, 0, {}), 0x80a755)
  assert.throws(() => climateColor([], 1, 1), /UNAVAILABLE/)
})

test('native plant offsets repeat vertically for XZ plants and reject unknown offset providers', () => {
  const state = { name: 'minecraft:tall_grass', hasOffsetFunction: true }
  const a = modelOffset(state, { x: -7, y: 63, z: 3 }), b = modelOffset(state, { x: -7, y: 64, z: 3 })
  assert.deepEqual(a, b); assert.equal(a[1], 0)
  assert.ok(a[0] >= -0.25 && a[0] <= 0.25 && a[2] >= -0.25 && a[2] <= 0.25)
  assert.throws(() => modelOffset({ name: 'mod:plant', hasOffsetFunction: true }, { x: 0, y: 0, z: 0 }), /UNSUPPORTED/)
})

test('animation honors original rectangular sheets, frame order, durations and integer-tick interpolation', () => {
  const animation = animationFrames({ animation: { width: 16, height: 16, frametime: 3, interpolate: true, frames: [3, { index: 0, time: 5 }, 2] } }, 32, 32)
  assert.deepEqual(frameAt(animation, 0).offset, [0.5, 0])
  assert.equal(frameAt(animation, 2.9).blend, 2 / 3)
  assert.equal(frameAt(animation, 3).index, 0)
  assert.equal(frameAt(animation, 11).index, 3)
  assert.equal(animationFrames({ animation: { width: 16 } }, 32, 64).frameHeight, 64)
  assert.throws(() => animationFrames({ animation: { frames: [9] } }, 16, 32), /FRAME_INVALID/)
  assert.throws(() => animationFrames({ animation: {} }, 16, 17), /DIMENSIONS_INVALID/)
})

test('animated UVs preserve the original texture and interpolation compiles against the pinned Three shader', () => {
  const texture = new THREE.Texture(), material = new THREE.MeshLambertMaterial({ map: texture })
  const animation = animationFrames({ animation: { frametime: 4, interpolate: true } }, 16, 32)
  enableInterpolation(material, THREE); applyFrame(texture, material, animation, 2)
  assert.equal(material.map, texture); assert.deepEqual(texture.repeat.toArray(), [1, 0.5])
  assert.equal(material.userData.nativeAnimationUniforms.nativeFrameBlend.value, 0.5)
  const shader = { uniforms: {}, fragmentShader: THREE.ShaderLib.lambert.fragmentShader }
  material.onBeforeCompile(shader)
  assert.match(shader.fragmentShader, /nativeInterpolatedPixel\(texture2D/)
  assert.match(shader.fragmentShader, /return vec4\(linear, current.a\)/)
  assert.equal(shader.uniforms.nativeFrameBlend.value, 0.5)
  material.dispose(); texture.dispose()
})
