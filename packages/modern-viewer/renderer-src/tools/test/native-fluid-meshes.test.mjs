import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { nativeFluidGeometry } from '../../src/native-viewer/native-fluid.js'
import { buildNativeFluidMeshes, createNativeFluidStateReader } from '../../src/native-viewer/native-fluid-meshes.js'
import { createNativeRebuildWork, isNativeRebuildRetired } from '../../src/native-viewer/native-rebuild-work.js'

const air = { name: 'minecraft:air', solid: false, blocksMotion: false, canOcclude: false, dynamicShape: false, occlusionBoxes: [], fluid: { name: 'minecraft:empty', empty: true, height: 0 } }
const water = { ...air, name: 'minecraft:water', fluid: { name: 'minecraft:water', empty: false, height: Math.fround(8 / 9) } }
const group = { positions: Array.from({ length: 180 }, (_, i) => i % 3 === 0 ? i : i % 3 === 1 ? 64 : 0) }
const getState = p => p.y === 64 && p.z === 0 && p.x % 3 === 0 ? water : air
const environment = { blendedBiomeColor: p => 0x148acf + p.x }
const material = new THREE.MeshBasicMaterial()
const loader = { fluidMaterial: async () => material }
const noWork = () => createNativeRebuildWork({ isCurrent: () => true, budgetMs: Infinity })

function expected () {
  const data = new Map()
  for (let i = 0; i < group.positions.length; i += 3) {
    const p = { x: group.positions[i], y: group.positions[i + 1], z: group.positions[i + 2] }, result = nativeFluidGeometry(p, getState)
    const color = new THREE.Color().setHex(environment.blendedBiomeColor(p))
    for (const quad of result.quads) {
      if (!data.has(quad.texture)) data.set(quad.texture, { positions: [], colors: [], uv: [], indices: [] })
      const batch = data.get(quad.texture), base = batch.positions.length / 3
      for (let j = 0; j < 4; j++) {
        batch.positions.push(quad.vertices[j * 3] + p.x, quad.vertices[j * 3 + 1] + p.y, quad.vertices[j * 3 + 2] + p.z)
        batch.colors.push(color.r * quad.shade, color.g * quad.shade, color.b * quad.shade)
        batch.uv.push(quad.uv[j * 2], 1 - quad.uv[j * 2 + 1])
      }
      batch.indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
      if (quad.backwards) batch.indices.push(base, base + 2, base + 1, base, base + 3, base + 2)
    }
  }
  return data
}

test('cooperative fluid meshes preserve exact ordered vertices, linear color/shade, UV, normal and both index windings', async () => {
  let time = 0, yields = 0
  const work = createNativeRebuildWork({ isCurrent: () => true, now: () => time += .25, yieldTask: async () => { yields++ } })
  const result = await buildNativeFluidMeshes({ group, stateName: water.name, getState, environment, loader, work })
  assert.equal(result.count, 60); assert.deepEqual(result.issues, []); assert.ok(yields > 3)
  const reference = [...expected().values()]; assert.equal(result.meshes.length, reference.length)
  for (let i = 0; i < result.meshes.length; i++) {
    const geometry = result.meshes[i].geometry, batch = reference[i]
    for (const [name, values] of [['position', batch.positions], ['color', batch.colors], ['uv', batch.uv], ['normal', batch.positions.map((_, i) => i % 3 === 1 ? 1 : 0)]])
      assert.deepEqual(geometry.attributes[name].array, Float32Array.from(values), name)
    assert.deepEqual([...geometry.index.array], batch.indices)
    geometry.dispose()
  }
})

test('neighbor indexing cooperates and preserves missing received state errors', async () => {
  let checks = 0
  const get = await createNativeFluidStateReader({ neighbors: [0, 64, 0, 1] }, new Map([[1, water]]), { checkpoint: () => { checks++; return null }, check () {} })
  assert.equal(get({ x: 0, y: 64, z: 0 }), water); assert.equal(checks, 1)
  assert.throws(() => get({ x: 1, y: 64, z: 0 }), /NOT_RECEIVED/)
})

test('retirement after material await cannot allocate or publish a late fluid mesh', async () => {
  let current = true, finish
  const pending = buildNativeFluidMeshes({ group, stateName: water.name, getState, environment,
    loader: { fluidMaterial: () => new Promise(resolve => { finish = resolve }) }, work: createNativeRebuildWork({ isCurrent: () => current, budgetMs: Infinity }) })
  current = false; finish(material)
  await assert.rejects(pending, isNativeRebuildRetired)
})

test('retirement during buffer preparation disposes staged fluid geometry exactly once', async () => {
  let current = true, materialLoaded = false, disposed = 0
  const original = THREE.BufferGeometry.prototype.dispose
  THREE.BufferGeometry.prototype.dispose = function () { disposed++; original.call(this) }
  try {
    await assert.rejects(buildNativeFluidMeshes({ group, stateName: water.name, getState, environment,
      loader: { fluidMaterial: async () => { materialLoaded = true; return material } },
      work: createNativeRebuildWork({ now: () => 1, budgetMs: 0, isCurrent: () => current, yieldTask: async () => { if (materialLoaded) current = false } }) }), isNativeRebuildRetired)
    assert.equal(disposed, 1)
  } finally { THREE.BufferGeometry.prototype.dispose = original }
})

test('unknown fluid content stays explicit while valid blocks are retained', async () => {
  const result = await buildNativeFluidMeshes({ group: { positions: [0, 64, 0, 3, 64, 0] }, stateName: water.name,
    getState: p => p.x >= 2 ? undefined : getState(p), environment, loader, work: noWork() })
  assert.equal(result.count, 1); assert.equal(result.issues.length, 1); assert.match(result.issues[0], /METADATA_UNAVAILABLE/)
  result.meshes.forEach(mesh => mesh.geometry.dispose())
})

test('lava uses the same exact quads with original white tint and never invokes a biome provider', async () => {
  const lava = { ...water, name: 'minecraft:lava', fluid: { ...water.fluid, name: 'minecraft:lava' } }
  const result = await buildNativeFluidMeshes({ group: { positions: [0, 64, 0] }, stateName: lava.name,
    getState: p => p.x === 0 && p.y === 64 && p.z === 0 ? lava : air,
    environment: { blendedBiomeColor () { throw Error('lava cannot request water tint') } }, loader, work: noWork() })
  assert.equal(result.count, 1); assert.deepEqual(result.issues, [])
  for (const mesh of result.meshes) {
    for (const color of mesh.geometry.attributes.color.array) assert.ok([1, Math.fround(.8), Math.fround(.6), .5].includes(color))
    mesh.geometry.dispose()
  }
})
