import test from 'node:test'
import assert from 'node:assert/strict'
import { NativeSnapshotCadence } from '../native-snapshot-cadence.mjs'
const p = (x = -432, y = 72, z = 400) => ({ x, y, z })

test('small movements and head turns retain geometry while large or vertical movement recenters', () => {
  const cadence = new NativeSnapshotCadence()
  assert.equal(cadence.required(p(), 0), true); cadence.completed(p(), 0, true)
  assert.equal(cadence.required({ ...p(-429), yaw: 3 }, 1000), false)
  assert.equal(cadence.required(p(-428), 1000), true); cadence.completed(p(-428), 1000, true)
  assert.equal(cadence.required(p(-428, 68), 1100), false)
  assert.equal(cadence.required(p(-428, 68), 1500), true)
})

test('a burst of block updates is coalesced without forgetting a pending change', () => {
  const cadence = new NativeSnapshotCadence()
  cadence.completed(p(), 1000, true)
  for (let i = 0; i < 100; i++) cadence.invalidate()
  assert.equal(cadence.required(p(), 1200), false)
  assert.equal(cadence.dirty, true)
  assert.equal(cadence.required(p(), 1500), true)
  cadence.completed(p(), 1500, true)
  assert.equal(cadence.required(p(), 2000), false)
})

test('respawn/disconnect reset discards the old anchor and bypasses its throttle', () => {
  const cadence = new NativeSnapshotCadence()
  cadence.completed(p(), 2000, true); cadence.reset()
  assert.equal(cadence.center, null)
  assert.equal(cadence.required(p(700, -20, -600), 2100), true)
  cadence.completed(p(700, -20, -600), 2100, true)
  assert.equal(cadence.required(p(700, -20, -600), 2150, true), true)
  assert.throws(() => cadence.required(p(), NaN), /CLOCK_INVALID/)
})

test('a budget-reduced terrain volume recenters before the player crosses its actual edge', () => {
  const cadence = new NativeSnapshotCadence()
  cadence.completed(p(), 1000, true, { minX: -433, maxX: -431, minY: 48, maxY: 96, minZ: 399, maxZ: 401 })
  assert.equal(cadence.required(p(), 1500), false)
  assert.equal(cadence.required(p(-431), 1500), true, 'actual bounds override the larger normal movement threshold')
})
