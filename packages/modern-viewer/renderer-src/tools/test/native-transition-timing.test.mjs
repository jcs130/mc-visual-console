import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createNativeTransitionTiming } from '../../src/native-viewer/native-transition-timing.js'
import { shell } from './fixtures/native-console-dom.mjs'

test('bounded action and slow-world records preserve phase ownership, terrain overlap and monotonic commit origin', () => {
  const document = shell(), viewport = document.createElement('div')
  let time = 100, revision = 1, committed = 10, building = false
  const timing = createNativeTransitionTiming({ document, viewport, now: () => time, timeOrigin: 123,
    context: () => ({ view: 'first', snapshotRevision: revision, terrainRequested: 11,
      terrainCommitted: committed, terrainBuilding: building, terrainCommittedAt: 90, persona: 'MUST NOT COPY' }) })
  const action = timing.begin('mode', 'click', 'third'); time += 4; timing.finish(action)
  let frame = timing.worldStart(100); time += 7
  timing.worldFinish(frame, { cameraMs: 2, roomMs: 3, mainCpuDrawMs: 1 })
  building = true; frame = timing.worldStart(170); revision++; committed++; time += 8
  timing.worldFinish(frame, { cameraMs: 1, roomMs: 4, mainCpuDrawMs: 2 })
  let value = JSON.parse(viewport.dataset.transitionTiming)
  assert.equal(value.timeOrigin, 123); assert.equal(value.transitions[0].syncMs, 4)
  assert.equal(value.transitions[0].world.cameraMs, 2)
  assert.equal(value.slowWorldFrames[0].gapMs, 70)
  assert.equal(value.slowWorldFrames[0].precedingWorld.cameraMs, 2)
  assert.equal(value.slowWorldFrames[0].cameraMs, 1)
  assert.equal(value.slowWorldFrames[0].snapshotOverlap, true)
  assert.equal(value.slowWorldFrames[0].terrainOverlap, true)
  assert.equal(value.slowWorldFrames[0].gapTerrainOverlap, true)
  assert.equal(value.slowWorldFrames[0].after.terrainCommittedAt, 90)
  assert.ok(!viewport.dataset.transitionTiming.includes('MUST NOT COPY'))
  document.hidden = true; document.dispatch('visibilitychange'); time += 1000
  document.hidden = false; document.dispatch('visibilitychange')
  frame = timing.worldStart(1170); timing.worldFinish(frame, { cameraMs: 0, roomMs: 0, mainCpuDrawMs: 0 })
  value = JSON.parse(viewport.dataset.transitionTiming)
  assert.equal(value.visibility.epoch, 2)
  assert.deepEqual(value.visibilityChanges.map(row => row.hidden), [true, false])
  assert.equal(value.slowWorldFrames.at(-1).gapFromVisibilityEpoch, 0)
  assert.equal(value.slowWorldFrames.at(-1).before.visibility.epoch, 2)
  assert.equal(value.slowWorldFrames.at(-1).gapVisibilityChanged, true)
  for (let n = 0; n < 100; n++) {
    time += 60; timing.finish(timing.begin('menu', 'state'))
    frame = timing.worldStart(1300 + n * 60); timing.worldFinish(frame, { mainCpuDrawMs: 1 })
    document.dispatch('visibilitychange')
  }
  value = JSON.parse(viewport.dataset.transitionTiming)
  for (const key of ['transitions', 'slowWorldFrames', 'visibilityChanges']) assert.equal(value[key].length, 8)
  const last = viewport.dataset.transitionTiming
  frame = timing.worldStart(1300 + 99 * 60 + 16); timing.worldFinish(frame, { mainCpuDrawMs: 1 })
  assert.equal(viewport.dataset.transitionTiming, last, 'steady fast frames do not serialize histories')
  timing.dispose(); assert.equal(document.listeners.get('visibilitychange').length, 0)
})

test('expired actions and failing observation sinks cannot interrupt callbacks', () => {
  const document = shell(), viewport = document.createElement('div'); let time = 0
  const timing = createNativeTransitionTiming({ document, viewport, now: () => time })
  const row = timing.begin('menu', 'click'); time = 5001
  assert.equal(timing.previewStart(row), null)
  timing.finish(row); const frame = timing.worldStart(10); timing.worldFinish(frame, {})
  assert.equal(JSON.parse(viewport.dataset.transitionTiming).transitions[0].world, undefined)
  const broken = createNativeTransitionTiming({ document, viewport: { get dataset() { throw Error('disconnected sink') } } })
  assert.doesNotThrow(() => { const row = broken.begin('mode', 'click'); broken.finish(row); document.dispatch('visibilitychange'); broken.dispose() })
  timing.dispose()
})

test('cold menu icon bursts cannot evict the six-action sequence before its deferred preview phase', () => {
  const viewport = { dataset: {} }, timing = createNativeTransitionTiming({ viewport })
  const open = timing.begin('menu', 'click')
  for (let n = 0; n < 100; n++) timing.finish(timing.begin('menu', 'icon'))
  const first = timing.previewStart(open); assert.ok(first)
  timing.previewFinish(open, { ...first, status: 'ready', context: 'cold', cpuDrawMs: 1 })
  for (let n = 0; n < 5; n++) timing.finish(timing.begin('menu', 'click'))
  const value = JSON.parse(viewport.dataset.transitionTiming)
  assert.equal(value.iconCallbacks, 100); assert.equal(value.transitions.length, 8)
  assert.equal(value.transitions.filter(row => row.reason === 'icon').length, 2)
  assert.equal(value.transitions.find(row => row.sequence === open.sequence).readyPreview.context, 'cold')
  timing.dispose()
})
