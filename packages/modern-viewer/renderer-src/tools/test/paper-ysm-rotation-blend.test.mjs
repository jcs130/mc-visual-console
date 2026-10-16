import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { PaperYsmAnimation } from '../../src/modern-viewer/paper-ysm-animation.js'

function fixture () {
  const root = new THREE.Group(), bones = new Map([['Root', root]])
  const initial = new Map([['Root', { position: root.position.clone(), rotation: root.rotation.clone() }]])
  const model = { bones, initial, reset () { root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.scale.setScalar(1) } }
  const main = { format_version: '1.8.0', animations: {
    idle: { loop: true, bones: {} }, swim: { loop: true, bones: { Root: { rotation: [80, 0, 0] } } },
    swim_stand: { loop: true, bones: {} }
  } }
  const animator = new PaperYsmAnimation(model, main)
  const apply = (now, water = true, speed = 2) => animator.apply({ motion: { onGround: !water, inWater: water, horizontalSpeed: speed } }, now)
  const direction = () => new THREE.Vector3(0, 1, 0).applyQuaternion(root.quaternion)
  const expect = degrees => assert.ok(direction().distanceTo(new THREE.Vector3(0, Math.cos(degrees * Math.PI / 180), Math.sin(degrees * Math.PI / 180))) < 1e-8,
    `expected ${degrees} degrees, received ${root.rotation.x * 180 / Math.PI}`)
  return { apply, expect }
}

test('ordinary YSM water rotations interpolate through quarter/half poses and back without destination aliasing', () => {
  const { apply, expect } = fixture()
  apply(1000, false, 0); apply(1100); expect(0)
  apply(1155); expect(12.5)
  apply(1210); expect(40)
  apply(1265); expect(67.5)
  apply(1320); expect(80)
  apply(1400, true, 0); expect(80)
  apply(1455, true, 0); expect(67.5)
  apply(1510, true, 0); expect(40)
  apply(1620, true, 0); expect(0)
})

test('interrupted ordinary water rotations start at the displayed quaternion rather than an authored endpoint', () => {
  const { apply, expect } = fixture()
  apply(1000, false, 0); apply(1100); apply(1155); expect(12.5)
  apply(1200, true, 0); expect(12.5)
  apply(1310, true, 0); expect(6.25)
  apply(1420, true, 0); expect(0)
})
