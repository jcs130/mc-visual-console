import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { nativeBedrockCubeFaces, createNativeBedrockModel } from '../../src/native-viewer/native-entity-model-bedrock.js'

const definition = bones => ({ format_version: '1.12.0', 'minecraft:geometry': [{ description: { texture_width: 128, texture_height: 128 }, bones }] })

test('original Bedrock box UVs floor fractional extents without changing zero-thickness geometry', () => {
  const faces = nativeBedrockCubeFaces({ origin: [-3, -4, -4.01], size: [6, 3.5, 0], uv: [24, 0] }, [128, 128])
  assert.equal(faces.length, 6)
  const north = faces.find(face => face.direction === 'north')
  assert.deepEqual(north.uv, [30 / 128, 1, 24 / 128, 1, 24 / 128, 1 - 3 / 128, 30 / 128, 1 - 3 / 128])
  assert.equal(Math.max(...north.position.filter((_, index) => index % 3 === 1)) - Math.min(...north.position.filter((_, index) => index % 3 === 1)), 3.5 / 16)
  assert.equal(new Set(north.position.filter((_, index) => index % 3 === 2)).size, 1)
  const mirrored = nativeBedrockCubeFaces({ origin: [0, 0, 0], size: [6, 8, 2], uv: [0, 0], mirror: true }, [128, 128])
  assert.deepEqual(mirrored[4].uv, [8 / 128, 1 - 2 / 128, 10 / 128, 1 - 2 / 128, 10 / 128, 1 - 10 / 128, 8 / 128, 1 - 10 / 128])
  assert.deepEqual(mirrored[4].normal, [-1, 0, 0], 'Bedrock mirror changes original UV table, not geometric normals')
})

test('original per-face UV rotation and both-zero empty-mask semantics are exact', () => {
  const faces = nativeBedrockCubeFaces({ origin: [0, 0, 0], size: [6, 4, 0], uv: {
    north: { uv: [0, 71], uv_size: [12, 8], uv_rotation: 90 },
    east: { uv: [0, 71], uv_size: [0, 8] },
    south: { uv: [0, 0], uv_size: [0, 0] }
  } }, [128, 128])
  assert.deepEqual(faces.map(face => face.direction), ['north', 'east'])
  assert.deepEqual(faces[0].uv, [0, 1 - 71 / 128, 0, 1 - 79 / 128, 12 / 128, 1 - 79 / 128, 12 / 128, 1 - 71 / 128])
  assert.deepEqual(faces[1].uv, [0, 1 - 71 / 128, 0, 1 - 71 / 128, 0, 1 - 79 / 128, 0, 1 - 79 / 128])
})

test('Bedrock root Y=24, absolute child pivots, cube rotations and original reset remain independent', () => {
  const material = new THREE.MeshBasicMaterial()
  const model = createNativeBedrockModel(definition([
    { name: 'head', pivot: [0, 18, 0], rotation: [20, 0, 0], cubes: [] },
    { name: 'blink', parent: 'head', pivot: [0, 0, 0], cubes: [{ origin: [-4, 18, -4.005], size: [8, 8, 0], uv: [24, 0] }] },
    { name: 'rotated', parent: 'head', pivot: [0, 20, 0], cubes: [{ origin: [0, 20, 0], size: [2, 4, 6], pivot: [1, 21, 1], rotation: [0, 0, 30], uv: [0, 0] }] }
  ]), material)
  assert.deepEqual(model.bones.get('head').position.toArray(), [0, 6 / 16, 0])
  assert.deepEqual(model.bones.get('blink').position.toArray(), [0, 18 / 16, 0])
  assert.equal(model.bones.get('head').rotation.order, 'ZYX')
  assert.equal(model.zeroThicknessCubes, 1)
  assert.deepEqual(model.bones.get('rotated').children[0].position.toArray(), [1 / 16, -1 / 16, 1 / 16])
  assert.equal(model.bones.get('rotated').children[0].rotation.z, Math.fround(30 * Math.PI / 180))
  model.bones.get('head').position.y = 900; model.bones.get('blink').visible = false; model.reset()
  assert.equal(model.bones.get('head').position.y, 6 / 16); assert.equal(model.bones.get('blink').visible, true)
  let disposed = 0; model.root.traverse(object => { if (object.isMesh) object.geometry.addEventListener('dispose', () => disposed++) })
  model.dispose(); model.dispose(); assert.equal(disposed, 12); material.dispose()
})

test('unsupported Bedrock fields and malformed hierarchy fail without simplified geometry', () => {
  const material = new THREE.MeshBasicMaterial()
  assert.throws(() => createNativeBedrockModel(definition([{ name: 'head', pivot: [0, 0, 0], binding: 'unknown' }]), material), /BONE_INVALID/)
  assert.throws(() => createNativeBedrockModel(definition([{ name: 'a', parent: 'b', pivot: [0, 0, 0] }, { name: 'b', parent: 'a', pivot: [0, 0, 0] }]), material), /CYCLE/)
  assert.throws(() => nativeBedrockCubeFaces({ origin: [0, 0, 0], size: [6, 4, 0], uv: { north: { uv: [0, 0], uv_size: [12, 8], uv_rotation: 45 } } }, [128, 128]), /UV_INVALID/)
  material.dispose()
})

test('locked actual TLM type-B asset preserves every original bone/cube and vengeful dimensions', { skip: !process.env.NATIVE_ENTITY_ASSET_DIR }, async () => {
  const prefix = 'assets/touhou_little_maid/tlm_custom_pack/touhou_little_maid-1.0.0/assets/touhou_little_maid/'
  const bytes = await fs.readFile(path.join(process.env.NATIVE_ENTITY_ASSET_DIR, prefix, 'models/entity/hakurei_reimu_type_b.json'))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '1aac31d5759bc75d728a855bd366b1689800e747478179ec1fb8b1f255a8aa18')
  const material = new THREE.MeshBasicMaterial(), model = createNativeBedrockModel(JSON.parse(bytes), material)
  assert.equal(model.bones.size, 73); assert.equal(model.cubeCount, 63); assert.equal(model.faceCount, 378); assert.equal(model.zeroThicknessCubes, 28)
  assert.deepEqual(model.dimensions, [128, 128])
  assert.equal(model.bones.get('SkirtFront').parent.name, 'SkirtCenter')
  assert.equal(model.bones.get('SkirtCenter').parent.name, 'sittingRotationSkirt')
  const texture = await fs.readFile(path.join(process.env.NATIVE_ENTITY_ASSET_DIR, prefix, 'textures/entity/hakurei_reimu_vengeful.png'))
  assert.equal(createHash('sha256').update(texture).digest('hex'), '992c4642a89d65577f24549c9fd71cce1c5fbc4e65f90506ade4b4db89626a48')
  assert.equal(texture.readUInt32BE(16), 128); assert.equal(texture.readUInt32BE(20), 128)
  model.dispose(); material.dispose()
})
