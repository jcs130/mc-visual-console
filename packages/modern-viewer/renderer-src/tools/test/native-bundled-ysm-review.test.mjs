import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as Three from 'three'

test('paused production review fixture redraws new state and heading immediately', async () => {
  // Execute the production fixture's controls, with browser/GPU/asset loading
  // stubbed only at the module boundary. Animation/geometry have separate tests.
  const source = (await readFile(new URL('../fixtures/native-bundled-ysm-review.js', import.meta.url), 'utf8'))
    .replace(/^import .*\r?\n/gm, '')
  let renders = 0, animate, current
  const elements = Object.fromEntries(['main','output','select','#heading','#time','#play'].map(id => [id, { value: '0', dataset: {}, append() {} }]))
  elements.select.value = 'walk'
  const THREE = { ...Three, WebGLRenderer: class {
    domElement = {}
    setPixelRatio() {} setSize() {} dispose() {}
    render() { renders++ }
    setAnimationLoop(callback) { animate = callback }
  } }
  const actor = { root: new Three.Group(), assetInfo: { modelId: 'test-only', sourceHashes: {}, boneCount: 49 }, applyPose() {}, applyMotion() {}, dispose() {} }
  const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor
  await new AsyncFunction('THREE','BundledAppearanceReader','createNativeBundledYsmPlayerActor','applyNativeSelfPlayerMotion','fetch','document','window','performance', source)(
    THREE, class {}, async () => actor, (_actor, frame) => { current = frame; return { clip: frame.presentation.self.inWater ? 'swim' : 'walk', source: 'test-only' } },
    async () => ({ json: async () => ({}) }), { querySelector: id => elements[id] }, { addEventListener() {} }, { now: () => 0 })
  assert.equal(renders, 1); animate(); assert.equal(renders, 1, 'paused animation loop does not render continuously')
  elements.select.value = 'swim'; elements.select.onchange()
  assert.equal(renders, 2); assert.equal(current.presentation.self.inWater, true)
  assert.equal(JSON.parse(elements.output.textContent).clip, 'swim')
  elements['#heading'].value = String(Math.PI); elements['#heading'].onchange()
  assert.equal(renders, 3); assert.equal(current.pose.yaw, Math.PI)
  animate(); assert.equal(renders, 3, 'selector redraw preserves paused mode')
})
