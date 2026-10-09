import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { nativeContraptionState, nativeContraptionGeometryKey, nativeContraptionAngle, nativeContraptionNudge, createNativeContraptionActor } from '../../src/native-viewer/native-contraption.js'
import { NativeAssetReader } from '../../src/native-viewer/model-loader.js'
import { CREATE_JAR_SHA256 } from '../../src/native-viewer/create-kinetics.js'
import { createHash } from 'node:crypto'
const fixture = () => ({ entityId: 5, uuid: '11111111-2222-3333-8444-555555555555', name: 'create:stationary_contraption',
  contraptionRenderState: { source: 'same_player_tracked_entity', playerUuid: 'aaaaaaaa-bbbb-3ccc-8ddd-eeeeeeeeeeee',
    id: 'create:stationary_contraption', entityId: 5, uuid: '11111111-2222-3333-8444-555555555555', epoch: 1,
    available: true, blockCount: 1, blocks: [{ x: 0, y: 0, z: 0, id: 'test:actual_sail', stateId: 4, properties: {}, hasBlockEntity: false }],
    rotationAxis: 'z', serverTick: 100, anchor: { x: -1, y: 65, z: 3 }, angleDegrees: 10, previousAngleDegrees: 9, stalled: false } })
test('native contraption state rejects mismatched identities, partial geometry and block entities', () => {
  const entity = fixture(); assert.equal(nativeContraptionState(entity).blockCount, 1)
  for (const mutate of [r => { r.uuid = 'other' }, r => { r.available = false }, r => { r.blocks.push(r.blocks[0]); r.blockCount++ },
    r => { r.blockCount = 96 }, r => { r.blocks[0].hasBlockEntity = true }, r => { r.angleDegrees = NaN }]) {
    const bad = fixture(); mutate(bad.contraptionRenderState); assert.throws(() => nativeContraptionState(bad), /NATIVE_CONTRAPTION/)
  }
})
test('angle changes reuse geometry and stale motion cannot spin indefinitely', () => {
  const first = fixture(), next = fixture(); next.contraptionRenderState.angleDegrees = 20
  assert.equal(nativeContraptionGeometryKey(first), nativeContraptionGeometryKey(next))
  const row = first.contraptionRenderState
  assert.ok(Math.abs(nativeContraptionAngle(row, 50) - 11 * Math.PI / 180) < 1e-6)
  assert.throws(() => nativeContraptionAngle(row, 1001), /STALE/)
  assert.equal(nativeContraptionAngle({ ...row, stalled: true }, 100), Math.fround(10 * Math.PI / 180))
})
test('actor loads only original block assets, rotates about the native anchor and recovers fresh motion', async () => {
  const documents = {
    'assets/test/blockstates/actual_sail.json': { variants: { '': { model: 'test:block/actual_sail' } } },
    'assets/test/models/block/actual_sail.json': { textures: { original: 'test:block/canvas' }, elements: [
      { from: [0, 0, 7], to: [16, 16, 9], faces: { north: { texture: '#original', uv: [0, 0, 16, 16] } } }] }
  }
  const bytes = new Map(Object.entries(documents).map(([k, v]) => [k, Buffer.from(JSON.stringify(v))]))
  bytes.set('assets/test/textures/block/canvas.png', Buffer.from('test-image'))
  const manifest = { schemaVersion: 1, minecraftVersion: '1.21.1', assetIntegrityVerified: true,
    sources: [{ name: 'create-1.21.1-6.0.10.jar', sha256: CREATE_JAR_SHA256 }],
    assets: Object.fromEntries([...bytes].map(([k, v]) => [k, { bytes: v.length, sha256: createHash('sha256').update(v).digest('hex') }])) }
  const reader = new NativeAssetReader(manifest, async p => bytes.get(p)), entity = fixture()
  const actor = await createNativeContraptionActor(reader, entity, { loadTexture: async () => { const t = new THREE.Texture(); t.image = { width: 16, height: 16 }; return t } })
  actor.update(entity, 1000); assert.deepEqual(actor.root.position.toArray(), [-0.5, 65.5, 3.5].map((v,i)=>v+nativeContraptionNudge(entity.entityId)[i]))
  assert.equal(actor.root.children[0].children[0].children[0].children[0].userData.originalTexture, 'test:block/canvas')
  actor.update(entity, 2001); assert.equal(actor.root.visible, false)
  entity.contraptionRenderState.serverTick++; actor.update(entity, 2050); assert.equal(actor.root.visible, true)
  actor.dispose()
})
