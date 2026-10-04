import test from 'node:test'
import assert from 'node:assert/strict'
import { playerCamera, playerHud } from '../../src/native-viewer/player-camera.js'
const pose = { x: -437.3, y: 64, z: 409.3, yaw: 0, pitch: 0, eyeHeight: 1.62 }
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9)
test('default third person centers the actual player and stays inside received region', () => {
  for (const yaw of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const view = playerCamera({ ...pose, yaw })
    assert.equal(view.showSelf, true)
    assert.deepEqual(view.target, [pose.x, pose.y + 1, pose.z])
    near(Math.hypot(view.position[0] - pose.x, view.position[2] - pose.z), Math.hypot(4.5, 1))
    near(view.position[1] - pose.y, 3)
  }
})
test('first person uses received eyes and correct Mineflayer cardinal and pitch directions', () => {
  const view = playerCamera(pose, 'first')
  assert.equal(view.showSelf, false)
  assert.deepEqual(view.position, [pose.x, pose.y + 1.62, pose.z])
  near(view.target[2] - view.position[2], -1)
  const west = playerCamera({ ...pose, yaw: Math.PI / 2 }, 'first')
  near(west.target[0] - west.position[0], -1)
  const up = playerCamera({ ...pose, pitch: Math.PI / 2 }, 'first')
  near(up.target[1] - up.position[1], 1)
})
test('camera follows respawn and movement without retaining an old orbit origin', () => {
  const moved = playerCamera({ ...pose, x: 100, y: -12, z: 200 })
  assert.deepEqual(moved.target, [100, -11, 200])
  assert.throws(() => playerCamera({ ...pose, x: NaN }))
  assert.throws(() => playerCamera(pose, 'invalid'))
  assert.throws(() => playerCamera({ ...pose, eyeHeight: undefined }, 'first'))
})
test('HUD refuses a different account and never substitutes fake full health or food', () => {
  assert.equal(playerHud({ uuid: 'other', health: 20, food: 20 }, 'self').available, false)
  assert.deepEqual(playerHud({ uuid: 'self', name: 'Explorer', health: 6.3, food: 7 }, 'self'),
    { available: true, name: 'Explorer', health: '6.3 / 未收到', food: '7' })
  assert.equal(playerHud({ uuid: 'self', health: 0, maxHealth: 22, food: 0 }, 'self').health, '0 / 22')
})
