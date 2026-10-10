import * as THREE from 'three'

// Locked TLM 1.5.3 SimpleBedrockModel: AbstractBedrockEntityModel,
// BedrockCubeBox/PerFace, FaceItem and BedrockPart. This engine keeps every
// source face, including zero-thickness cubes and fractional box dimensions.
const F = Math.fround
const vector = (value, count = 3) => Array.isArray(value) && value.length === count && value.every(Number.isFinite)
const DIRECTIONS = ['down', 'up', 'north', 'south', 'west', 'east']
const VERTICES = [[5, 4, 0, 1], [2, 3, 7, 6], [1, 0, 3, 2], [4, 5, 6, 7], [0, 4, 7, 3], [5, 1, 2, 6]]
const NORMALS = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]]
const BOX_UV = [[1, 2, 6, 7], [2, 3, 7, 6], [1, 2, 7, 8], [4, 5, 7, 8], [0, 1, 7, 8], [2, 4, 7, 8]]
const MIRROR_UV = [[2, 1, 6, 7], [3, 2, 7, 6], [2, 1, 7, 8], [5, 4, 7, 8], [4, 2, 7, 8], [1, 0, 7, 8]]
const known = (value, keys) => Object.keys(value).every(key => keys.includes(key))

export function nativeBedrockCubeFaces (cube, dimensions) {
  if (!cube || !vector(cube.origin) || !vector(cube.size) || cube.size.some(value => value < 0) ||
      !vector(dimensions, 2) || !dimensions.every(value => Number.isInteger(value) && value > 0 && value <= 4096) ||
      !Number.isFinite(cube.inflate ?? 0) || Math.abs(cube.inflate ?? 0) > 16 || (cube.mirror !== undefined && typeof cube.mirror !== 'boolean')) throw Error('NATIVE_BEDROCK_CUBE_INVALID')
  const origin = cube.origin.map(F), size = cube.size.map(F), delta = F(cube.inflate ?? 0)
  const [x, y, z] = origin.map(value => F(F(value - delta) / 16))
  const [width, height, depth] = size.map(value => F(F(value + F(delta * 2)) / 16))
  const points = [[x, y, z], [F(x + width), y, z], [F(x + width), F(y + height), z], [x, F(y + height), z],
    [x, y, F(z + depth)], [F(x + width), y, F(z + depth)], [F(x + width), F(y + height), F(z + depth)], [x, F(y + height), F(z + depth)]]
  const faces = []
  let boxUV
  if (vector(cube.uv, 2)) {
    const [u, v] = cube.uv.map(F), [dx, dy, dz] = size.map(Math.floor)
    const scaleU = F(1 / dimensions[0]), scaleV = F(1 / dimensions[1])
    boxUV = [u, F(u + dz), F(F(u + dz) + dx), F(F(F(u + dz) + dx) + dx), F(F(F(u + dz) + dx) + dz), F(F(F(F(u + dz) + dx) + dz) + dx)].map(value => F(scaleU * value))
    boxUV.push(...[v, F(v + dz), F(F(v + dz) + dy)].map(value => F(scaleV * value)))
  } else if (!cube.uv || typeof cube.uv !== 'object' || Array.isArray(cube.uv) || !known(cube.uv, DIRECTIONS)) throw Error('NATIVE_BEDROCK_UV_INVALID')
  for (let index = 0; index < 6; index++) {
    let uv
    if (boxUV) {
      const [u0, u1, v0, v1] = (cube.mirror ? MIRROR_UV : BOX_UV)[index].map(value => boxUV[value])
      uv = [u1, v0, u0, v0, u0, v1, u1, v1]
    } else {
      const face = cube.uv[DIRECTIONS[index]]
      if (face === undefined) continue
      if (!face || !known(face, ['uv', 'uv_size', 'uv_rotation']) || !vector(face.uv, 2) || !vector(face.uv_size, 2) || ![0, 90, 180, 270].includes(face.uv_rotation ?? 0)) throw Error('NATIVE_BEDROCK_UV_INVALID')
      if (face.uv_size.every(value => Math.abs(F(value)) < 1e-9)) continue // Original PerFace empty mask requires BOTH dimensions zero.
      const a = F(F(face.uv[0]) / dimensions[0]), b = F(F(face.uv[1]) / dimensions[1])
      const c = F(F(F(face.uv[0]) + F(face.uv_size[0])) / dimensions[0]), d = F(F(F(face.uv[1]) + F(face.uv_size[1])) / dimensions[1])
      uv = (face.uv_rotation === 90 ? [a, b, a, d, c, d, c, b] : face.uv_rotation === 180 ? [a, d, c, d, c, b, a, b] : face.uv_rotation === 270 ? [c, d, c, b, a, b, a, d] : [c, b, a, b, a, d, c, d])
    }
    faces.push({ direction: DIRECTIONS[index], position: VERTICES[index].flatMap(vertex => points[vertex]),
      normal: [...NORMALS[index]], uv: uv.map((value, index) => index % 2 ? 1 - value : value), indices: [0, 1, 2, 0, 2, 3] })
  }
  return faces
}

export function createNativeBedrockModel (definition, material) {
  const geometry = definition?.['minecraft:geometry']?.[0]
  if (definition?.format_version !== '1.12.0' || !known(definition, ['format_version', 'minecraft:geometry']) || definition['minecraft:geometry'].length !== 1 ||
      !geometry || !known(geometry, ['description', 'bones']) || !Array.isArray(geometry.bones) || geometry.bones.length > 128 || !material?.isMaterial) throw Error('NATIVE_BEDROCK_MODEL_UNSUPPORTED')
  const description = geometry.description, dimensions = [description?.texture_width, description?.texture_height]
  if (!vector(dimensions, 2) || !dimensions.every(value => Number.isInteger(value) && value > 0 && value <= 4096)) throw Error('NATIVE_BEDROCK_TEXTURE_DIMENSIONS_INVALID')
  const root = new THREE.Group(), bones = new Map(), source = new Map(), geometries = new Set(), initial = new Map()
  let cubeCount = 0, faceCount = 0, zeroThicknessCubes = 0
  const rotation = value => F(F(value) * Math.PI / 180)
  function meshCube (parent, cube) {
    for (const face of nativeBedrockCubeFaces(cube, dimensions)) {
      const geometry = new THREE.BufferGeometry(); geometries.add(geometry)
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(face.position, 3))
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(Array(4).fill(face.normal).flat(), 3))
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(face.uv, 2)); geometry.setIndex(face.indices)
      const mesh = new THREE.Mesh(geometry, material); mesh.userData.nativeFace = face.direction; parent.add(mesh); faceCount++
    }
  }
  try {
    for (const item of geometry.bones) {
      if (!item || !known(item, ['name', 'parent', 'pivot', 'rotation', 'mirror', 'cubes']) || !/^[\p{L}\p{N}_ .-]{1,96}$/u.test(item.name ?? '') || bones.has(item.name) || !vector(item.pivot) ||
          (item.rotation !== undefined && !vector(item.rotation)) || (item.mirror !== undefined && typeof item.mirror !== 'boolean') || (item.cubes !== undefined && (!Array.isArray(item.cubes) || item.cubes.length > 64))) throw Error('NATIVE_BEDROCK_BONE_INVALID')
      const bone = new THREE.Group(); bone.name = item.name; bones.set(item.name, bone); source.set(item.name, item)
    }
    for (const item of geometry.bones) {
      const bone = bones.get(item.name), parent = item.parent === undefined ? root : bones.get(item.parent)
      if (!parent || parent === bone) throw Error('NATIVE_BEDROCK_PARENT_INVALID')
      let ancestor = item.parent; const visited = new Set([item.name])
      while (ancestor !== undefined) { if (visited.has(ancestor)) throw Error('NATIVE_BEDROCK_PARENT_CYCLE'); visited.add(ancestor); ancestor = source.get(ancestor)?.parent }
      const parentPivot = source.get(item.parent)?.pivot.map(F)
      const pivot = item.pivot.map(F)
      bone.position.fromArray(pivot.map((value, axis) => F((parentPivot ? F(axis === 1 ? parentPivot[axis] - value : value - parentPivot[axis]) : axis === 1 ? F(24 - value) : value) / 16)))
      bone.rotation.set(...(item.rotation ?? [0, 0, 0]).map(rotation), 'ZYX'); parent.add(bone)
      initial.set(item.name, { position: bone.position.clone(), rotation: bone.rotation.clone() })
      for (const input of item.cubes ?? []) {
        if (!input || !known(input, ['origin', 'size', 'uv', 'inflate', 'rotation', 'pivot', 'mirror']) || !vector(input.origin) || !vector(input.size) ||
            (input.rotation !== undefined && (!vector(input.rotation) || !vector(input.pivot)))) throw Error('NATIVE_BEDROCK_CUBE_INVALID')
        cubeCount++; if (input.size.includes(0)) zeroThicknessCubes++
        const cubePivot = (input.rotation === undefined ? item.pivot : input.pivot).map(F)
        const cube = { ...input, mirror: input.mirror ?? item.mirror ?? false,
          origin: input.origin.map((value, axis) => axis === 1 ? F(F(cubePivot[axis] - F(value)) - F(input.size[axis])) : F(F(value) - cubePivot[axis])) }
        if (input.rotation === undefined) meshCube(bone, cube)
        else {
          const rotated = new THREE.Group(); rotated.userData.nativeCubeRotation = true
          rotated.position.fromArray(cubePivot.map((value, axis) => F(F(axis === 1 ? pivot[axis] - value : value - pivot[axis]) / 16)))
          rotated.rotation.set(...input.rotation.map(rotation), 'ZYX'); bone.add(rotated); meshCube(rotated, cube)
        }
      }
    }
    let disposed = false
    return { root, bones, initial, dimensions, cubeCount, faceCount, zeroThicknessCubes,
      reset () { for (const [name, state] of initial) { const bone = bones.get(name); bone.position.copy(state.position); bone.rotation.copy(state.rotation); bone.scale.setScalar(1); bone.visible = true } },
      dispose () { if (disposed) return; disposed = true; root.removeFromParent(); for (const geometry of geometries) geometry.dispose(); root.clear() } }
  } catch (error) { for (const geometry of geometries) geometry.dispose(); root.clear(); throw error }
}
