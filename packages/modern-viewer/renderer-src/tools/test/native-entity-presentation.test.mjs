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

const aquatic=(tick,counter)=>{const e=entity(tick/10);e.motion={...e.motion,tick,sampledAt:tick*50,aquatic:{tail:counter,tailOld:counter-1,spikes:counter/20,spikesOld:(counter-1)/20,tentacleAngle:counter/10,tentacleAngleOld:(counter-1)/10,xBodyRot:counter,xBodyRotOld:counter-1,zBodyRot:counter*2,zBodyRotOld:(counter-1)*2,bodyYaw:counter,attackTime:counter,targetId:8}};return e}
test('aquatic animation projects the bounded received interval independently of endpoint position projection',()=>{
 const buffer=new NativeEntityPresentation(),a=aquatic(10,10),b=aquatic(14,14),saved=JSON.stringify(b)
 buffer.push(a,1000);buffer.push(b,1200)
 const samples=[1150,1200,1250,1300,1400,5000].map(now=>buffer.sample(b,now))
 assert.deepEqual(samples.map(e=>e.motion.displayAnimation?.age),[10,10,11,12,14,14])
 assert.deepEqual(samples.map(e=>e.motion.tick),[14,14,14,14,14,14],'raw authoritative tick remains latest')
 assert.deepEqual(samples.map(e=>e.motion.displayAnimation.aquatic.tail),[10,10,11,12,14,14])
 assert.deepEqual(samples.map(e=>e.motion.displayAnimation.aquatic.tailOld),[10,10,11,12,14,14],'already-projected counters are not interpolated twice')
 assert.deepEqual(samples.map(e=>e.motion.displayAnimation.aquatic.attackTime),[10,10,11,12,14,14])
 assert.equal(JSON.stringify(b),saved)
 const single=new NativeEntityPresentation();single.push(a,1000);assert.equal(single.sample(a,100000).motion.displayAnimation.age,10,'one sample cannot extrapolate an animation tick')
})
test('aquatic target-reset counters do not blend a previous target into the received new target',()=>{
 const buffer=new NativeEntityPresentation(),a=aquatic(10,40),b=aquatic(14,0);b.motion.aquatic.targetId=9
 buffer.push(a,1000);buffer.push(b,1200)
 assert.equal(buffer.sample(b,1300).motion.displayAnimation?.aquatic.attackTime,0)
})
