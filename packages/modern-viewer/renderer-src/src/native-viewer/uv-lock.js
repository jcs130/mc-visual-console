import * as THREE from 'three'

// 1.21.1 BlockMath / FaceBakery.recomputeUVs, checked against the official
// client. Transform the face's UV frame, independently of element geometry.
const normals = { south: [0, 0, 1], north: [0, 0, -1], east: [1, 0, 0], west: [-1, 0, 0], up: [0, 1, 0], down: [0, -1, 0] }
const basis = {
  south: new THREE.Matrix4(), north: new THREE.Matrix4().makeRotationY(Math.PI),
  east: new THREE.Matrix4().makeRotationY(Math.PI / 2), west: new THREE.Matrix4().makeRotationY(-Math.PI / 2),
  up: new THREE.Matrix4().makeRotationX(-Math.PI / 2), down: new THREE.Matrix4().makeRotationX(Math.PI / 2)
}
const round = n => Math.abs(n - Math.round(n)) < 1e-5 ? Math.round(n) : n

export function lockedFaceUV (rectangle, rotation, direction, variant) {
  if (!normals[direction] || ![variant.x || 0, variant.y || 0, rotation].every(a => [0, 90, 180, 270].includes(a))) throw Error('NATIVE_UVLOCK_ROTATION_INVALID')
  const model = new THREE.Matrix4().makeRotationY(-(variant.y || 0) * Math.PI / 180)
    .multiply(new THREE.Matrix4().makeRotationX(-(variant.x || 0) * Math.PI / 180))
  const normal = new THREE.Vector3(...normals[direction]).transformDirection(model)
  const target = Object.keys(normals).find(name => normal.dot(new THREE.Vector3(...normals[name])) > 0.9999)
  if (!target) throw Error('NATIVE_UVLOCK_DIRECTION_UNAVAILABLE')
  const matrix = basis[direction].clone().invert().multiply(model.clone().invert()).multiply(basis[target])
  const centered = new THREE.Matrix4().makeTranslation(0.5, 0.5, 0.5).multiply(matrix).multiply(new THREE.Matrix4().makeTranslation(-0.5, -0.5, -0.5))
  const a = new THREE.Vector3(rectangle[0] / 16, rectangle[1] / 16, 0).applyMatrix4(centered)
  const b = new THREE.Vector3(rectangle[2] / 16, rectangle[3] / 16, 0).applyMatrix4(centered)
  const sameX = Math.sign(rectangle[2] - rectangle[0]) === Math.sign(round(b.x - a.x))
  const sameY = Math.sign(rectangle[3] - rectangle[1]) === Math.sign(round(b.y - a.y))
  const vector = new THREE.Vector3(Math.cos(rotation * Math.PI / 180), Math.sin(rotation * Math.PI / 180), 0).transformDirection(matrix)
  const angle = Math.round(Math.atan2(vector.y, vector.x) * 180 / Math.PI / 90)
  return { rectangle: [sameX ? a.x : b.x, sameY ? a.y : b.y, sameX ? b.x : a.x, sameY ? b.y : a.y].map(n => round(n * 16)), rotation: ((-angle * 90) % 360 + 360) % 360 }
}
