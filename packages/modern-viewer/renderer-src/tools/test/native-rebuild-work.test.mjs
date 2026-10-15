import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createNativeRebuildWork, NativeStaticStage, isNativeRebuildRetired, nativeStaticSignature } from '../../src/native-viewer/native-rebuild-work.js'

test('terrain signature includes biome grid origin, dimensions and world clamp even if quart IDs repeat', () => {
  const snapshot = { groups: [], neighbors: [], biomeSeed: '1', biomes: [], biomeGrid: { x: 0, y: 0, z: 0, width: 1, height: 1, depth: 1, worldMinY: -16, worldMaxY: 79, ids: [1] } }
  const before = nativeStaticSignature(snapshot)
  for (const property of ['x', 'y', 'z', 'width', 'height', 'depth', 'worldMinY', 'worldMaxY'])
    assert.notEqual(nativeStaticSignature({ ...snapshot, biomeGrid: { ...snapshot.biomeGrid, [property]: snapshot.biomeGrid[property] + 1 } }), before, property)
  assert.notEqual(nativeStaticSignature({ ...snapshot, biomeSeed: '2' }), before)
})

test('budget checks yield between expensive units and check retirement before and after suspension', async () => {
  let time = 0, current = true, yields = 0
  const work = createNativeRebuildWork({ now: () => time, budgetMs: 4, isCurrent: () => current, yieldTask: async () => { yields++; time += 50 } })
  assert.equal(work.checkpoint(), null)
  time = 5; await work.checkpoint(); assert.equal(yields, 1)
  assert.equal(work.checkpoint(), null, 'waiting time is excluded from the next work slice')
  current = false
  assert.throws(() => work.checkpoint(), isNativeRebuildRetired)
  current = true; time += 5
  const retired = createNativeRebuildWork({ now: () => time, isCurrent: () => current, yieldTask: async () => { current = false } })
  time += 5
  await assert.rejects(retired.checkpoint(), isNativeRebuildRetired)
})

test('a static stage keeps the complete scene until commit and frees only owned resources on retirement', () => {
  const active = new THREE.Group(), previous = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
  let oldDisposed = 0, fluidDisposed = 0, sharedDisposed = 0, instanceDisposed = 0
  previous.dispose = () => oldDisposed++; active.add(previous)
  const stage = new NativeStaticStage(), fluid = new THREE.Mesh(new THREE.BoxGeometry(), previous.material)
  fluid.userData.nativeFluid = true; fluid.geometry.addEventListener('dispose', () => fluidDisposed++)
  const instance = new THREE.InstancedMesh(previous.geometry, previous.material, 1)
  instance.addEventListener('dispose', () => instanceDisposed++); previous.geometry.addEventListener('dispose', () => sharedDisposed++)
  stage.add(fluid); stage.add(instance)
  assert.deepEqual(active.children, [previous])
  assert.throws(() => stage.commit(active, () => false), isNativeRebuildRetired)
  stage.dispose(); stage.dispose()
  assert.equal(fluidDisposed, 1); assert.equal(instanceDisposed, 1); assert.equal(sharedDisposed, 0); assert.equal(oldDisposed, 0)
  const ready = new NativeStaticStage(), replacement = new THREE.Group(); ready.add(replacement)
  ready.commit(active, () => true); ready.dispose()
  assert.deepEqual(active.children, [replacement]); assert.equal(oldDisposed, 1)
})
