import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NativeEntityPresentation } from '../../src/native-viewer/native-entity-presentation.js'
const entity = (x, walk = x, yaw = 0) => ({ position: { x, y: 64, z: 0 }, motion: { tick: 11, tickMs: 50,
  sampledAt: 100, position: { x, y: 64, z: 0 }, previous: { position: { x: x - .1, y: 64, z: 0 } },
  bodyYaw: yaw, headYaw: yaw, pitch: 0, walk: { position: walk, speed: .4, speedOld: .3 } } })
test('200ms received frames produce continuous body and walking phase without rewriting raw facts', () => {
  const buffer = new NativeEntityPresentation(), a = entity(0, 0, 179), b = entity(1, 4, -179), saved = JSON.stringify(b)
  buffer.push(a, 1000); buffer.push(b, 1200)
  const samples = [1250, 1300, 1350, 1400].map(now => buffer.sample(b, now))
  assert.deepEqual(samples.map(e => e.position.x), [.25, .5, .75, 1])
  assert.deepEqual(samples.map(e => e.motion.walk.position), [1, 2, 3, 4])
  assert.equal(samples[1].motion.bodyYaw, 180)
  assert.equal(samples[1].motion.tick, 11)
  assert.equal(samples[1].motion.displayProjection, 'buffered_received_entity_samples')
  assert.equal(JSON.stringify(b), saved)
  assert.equal(buffer.sample(b, 5000).position.x, 1, 'never extrapolate')
})
test('teleport, new buffer and long stream gaps snap without an invented crossing; samples are bounded', () => {
  const buffer = new NativeEntityPresentation()
  buffer.push(entity(0), 1000); buffer.push(entity(10), 1200)
  assert.equal(buffer.sample(entity(10), 1200).position.x, 10)
  buffer.push(entity(11), 3000); assert.equal(buffer.sample(entity(11), 3000).position.x, 11)
  for (let i = 0; i < 100; i++) buffer.push(entity(11 + i / 100), 3100 + i * 50)
  assert.ok(buffer.samples.length <= 16)
  assert.equal(new NativeEntityPresentation().sample(entity(0), 3000).position.x, 0)
})
