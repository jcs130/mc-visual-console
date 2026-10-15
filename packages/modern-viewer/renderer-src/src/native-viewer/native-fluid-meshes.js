import * as THREE from 'three'
import { nativeFluidGeometry } from './native-fluid.js'
import { isNativeRebuildRetired } from './native-rebuild-work.js'

const pointKey = p => `${p.x},${p.y},${p.z}`

export async function createNativeFluidStateReader (snapshot, definitions, work) {
  const neighbors = new Map()
  for (let i = 0; i < (snapshot.neighbors || []).length; i += 4) {
    if (i % 1024 === 0) { const pause = work.checkpoint(); if (pause) await pause }
    neighbors.set(`${snapshot.neighbors[i]},${snapshot.neighbors[i + 1]},${snapshot.neighbors[i + 2]}`, definitions.get(snapshot.neighbors[i + 3]))
  }
  work.check()
  return p => { const state = neighbors.get(pointKey(p)); if (!state) throw Error('NATIVE_FLUID_NEIGHBOR_NOT_RECEIVED'); return state }
}

async function buffer (values, Type, work, valueAt = i => values[i]) {
  const array = new Type(values.length)
  for (let i = 0; i < array.length; i++) {
    if (i % 1024 === 0) { const pause = work.checkpoint(); if (pause) await pause }
    array[i] = valueAt(i)
  }
  return array
}

// Same LiquidBlockRenderer quads, order, original UVs and linear tint/shade.
// Each block and buffer slice cooperates; no partial mesh enters the scene.
export async function buildNativeFluidMeshes ({ group, stateName, getState, environment, loader, work }) {
  const data = new Map(), issues = new Set(), meshes = []
  let count = 0
  try {
    for (let i = 0; i < group.positions.length; i += 3) {
      const pause = work.checkpoint(); if (pause) await pause
      const p = { x: group.positions[i], y: group.positions[i + 1], z: group.positions[i + 2] }
      try {
        const result = nativeFluidGeometry(p, getState), color = new THREE.Color().setHex(result.family === 'water' ? environment.blendedBiomeColor(p, 'water') : 0xffffff)
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
        count++
      } catch (error) {
        if (isNativeRebuildRetired(error)) throw error
        issues.add(`${stateName}：${error.message}`)
      }
    }
    for (const [texture, batch] of data) {
      const material = await loader.fluidMaterial(texture)
      work.check()
      const geometry = new THREE.BufferGeometry(), mesh = new THREE.Mesh(geometry, material)
      mesh.userData.nativeFluid = true; meshes.push(mesh)
      geometry.setAttribute('position', new THREE.BufferAttribute(await buffer(batch.positions, Float32Array, work), 3))
      geometry.setAttribute('color', new THREE.BufferAttribute(await buffer(batch.colors, Float32Array, work), 3))
      geometry.setAttribute('uv', new THREE.BufferAttribute(await buffer(batch.uv, Float32Array, work), 2))
      geometry.setAttribute('normal', new THREE.BufferAttribute(await buffer(batch.positions, Float32Array, work, i => i % 3 === 1 ? 1 : 0), 3))
      geometry.setIndex(new THREE.BufferAttribute(await buffer(batch.indices, batch.positions.length / 3 > 65535 ? Uint32Array : Uint16Array, work), 1))
    }
    work.check()
    return { meshes, count, issues: [...issues] }
  } catch (error) {
    for (const mesh of meshes) mesh.geometry.dispose()
    throw error
  }
}
