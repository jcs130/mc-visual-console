import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { NativeAssetReader, resolveModel, bakeFaces, selectVariant, resourcePath } from '../../src/native-viewer/model-loader.js'
import { kineticAngle, CrankMotion } from '../../src/native-viewer/create-kinetics.js'

function readerFor (data, variants) {
  const bytes = new Map(Object.entries(data).map(([name, value]) => [name, Buffer.from(JSON.stringify(value))]))
  const assets = Object.fromEntries([...bytes].map(([name, bytes]) => [name, { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), variants }]))
  return { bytes, reader: new NativeAssetReader({ minecraftVersion: '1.21.1', assetIntegrityVerified: true, assets }, async path => bytes.get(path)) }
}

test('native inheritance keeps child texture overrides and original face UVs', async () => {
  const { reader } = readerFor({
    'assets/mod/models/block/parent.json': { textures: { side: 'mod:block/old' }, elements: [{ from: [6, 0, 6], to: [10, 16, 10], faces: { north: { texture: '#side', uv: [6, 0, 10, 16], rotation: 90 } } }] },
    'assets/mod/models/block/child.json': { parent: 'mod:block/parent', textures: { side: 'mod:block/real' } }
  })
  const model = await resolveModel(reader, 'mod:block/child')
  const face = bakeFaces(model)[0]
  assert.equal(face.texture, 'mod:block/real')
  assert.deepEqual(face.position, [0.125, 0.5, -0.125, 0.125, -0.5, -0.125, -0.125, -0.5, -0.125, -0.125, 0.5, -0.125])
  assert.deepEqual(face.uv, [6 / 16, 0, 10 / 16, 0, 10 / 16, 1, 6 / 16, 1])
})

test('native rotated grip remains its original 45 degree cuboid', () => {
  const face = bakeFaces({ textures: { wood: 'mod:block/wood' }, elements: [{ from: [-0.5, 6.5, 3], to: [2.5, 9.5, 9], rotation: { angle: 45, axis: 'z', origin: [1, 8, 9] },
    neoforge_data: { calculate_normals: true }, faces: { north: { texture: '#wood', uv: [6, 11, 9, 14], rotation: 90 } } }] })[0]
  const p = new THREE.Vector3(...face.position.slice(0, 3))
  assert.ok(Math.abs(p.x - (-7 / 16)) < 1e-8)
  assert.ok(Math.abs(p.y - 1.5 * Math.SQRT2 / 16) < 1e-8)
  assert.equal(p.z, -5 / 16)
  assert.equal(face.indices.length, 6)
})

test('missing or conflicting native assets reject rather than substitute', async () => {
  assert.throws(() => resourcePath('create:../../minecraft', 'models', '.json'), /INVALID/)
  const { reader, bytes } = readerFor({ 'assets/mod/models/block/base.json': { elements: [] } })
  await assert.rejects(reader.bytes('assets/mod/models/block/missing.json'), /ASSET_MISSING/)
  bytes.set('assets/mod/models/block/base.json', Buffer.from('tampered'))
  await assert.rejects(reader.bytes('assets/mod/models/block/base.json'), /HASH_MISMATCH/)
  const conflict = readerFor({ 'assets/mod/models/block/base.json': {} }, [{ sha256: 'different' }]).reader
  await assert.rejects(conflict.bytes('assets/mod/models/block/base.json'), /PRIORITY_UNRESOLVED/)
})

test('native block variants reject missing properties, weighted seeds and UV lock', () => {
  const variants = { variants: { 'axis=x': { model: 'create:block/shaft', x: 90, y: 90 }, 'axis=y': { model: 'create:block/shaft' } } }
  assert.equal(selectVariant(variants, { axis: 'x' }).y, 90)
  assert.throws(() => selectVariant(variants, {}), /UNRESOLVED/)
  assert.throws(() => selectVariant({ variants: { '': [{ model: 'a' }, { model: 'b' }] } }, {}), /SEED_UNVERIFIED/)
  assert.throws(() => selectVariant({ variants: { '': { model: 'a', uvlock: true } } }, {}), /UVLOCK/)
})

test('shaft uses actual RPM sign, block parity offset and server-speed stop', () => {
  const pos = { x: 3, y: 64, z: -2 }
  assert.ok(Math.abs(kineticAngle(10, 32, pos, 'y') - 96 * Math.PI / 180) < 1e-6)
  assert.ok(Math.abs(kineticAngle(10, -32, pos, 'y') + 96 * Math.PI / 180) < 1e-6)
  assert.equal(kineticAngle(100, 0, pos, 'y'), 0)
  assert.ok(Math.abs(kineticAngle(0, 0, { x: 2, y: 64, z: -2 }, 'y') - Math.PI / 8) < 1e-7)
  assert.throws(() => kineticAngle(10, null, pos, 'y'), /INVALID/)
})

test('crank retains the native quarter-velocity chase and smoothly coasts to stop', () => {
  const motion = new CrankMotion()
  motion.setSpeed(32); motion.step()
  assert.ok(Math.abs(motion.velocity - 2.4) < 1e-6)
  assert.ok(Math.abs(motion.radians(0.5) - 3.6 * Math.PI / 180) < 1e-6)
  for (let i = 0; i < 20; i++) motion.step()
  motion.setSpeed(0)
  const angleAtStop = motion.angle
  motion.step()
  assert.ok(motion.velocity > 0)
  assert.ok(motion.angle > angleAtStop)
  for (let i = 0; i < 80; i++) motion.step()
  assert.ok(motion.velocity < 1e-8)
  motion.setSpeed(-32)
  for (let i = 0; i < 20; i++) motion.step()
  assert.ok(motion.velocity < -9)
  motion.reset()
  assert.equal(motion.angle, 0)
  assert.throws(() => motion.setSpeed(undefined), /UNAVAILABLE/)
})
