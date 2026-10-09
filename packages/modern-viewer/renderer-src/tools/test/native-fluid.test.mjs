import test from 'node:test'
import assert from 'node:assert/strict'
import { waterGeometry, faceOccluded, boxesCover, nativeAtan2, weightedFluidHeight } from '../../src/native-viewer/native-fluid.js'

const empty = { name: 'minecraft:air', solid: false, blocksMotion: false, canOcclude: false, dynamicShape: false, occlusionBoxes: [], fluid: { name: 'minecraft:empty', empty: true, height: 0 } }
const stone = { ...empty, name: 'minecraft:stone', solid: true, blocksMotion: true, canOcclude: true, occlusionBoxes: [[0, 0, 0, 1, 1, 1]] }
const water = height => ({ ...empty, name: 'minecraft:water', fluid: { name: 'minecraft:water', empty: false, height: Math.fround(height) } })
const p = { x: 0, y: 64, z: 0 }, key = p => `${p.x},${p.y},${p.z}`
const fixture = entries => { const map = new Map(entries); return pos => map.get(key(pos)) ?? empty }

test('fluid flow angle matches official Mth including its native approximation', () => {
  for (const [y, x, angle] of [[0, 0, 0], [1, 0, Math.PI / 2], [-0.25, 0.75, -0.3217508771562922], [-0.3, -0.8, -2.78282145140904], [1e-8, -1, 3.1415926436067116], [1, -1, 2.356194516948653]]) assert.ok(Math.abs(nativeAtan2(y, x) - angle) < 1e-15)
})

test('native source weighting retains shallow water gradients and excludes solid neighbors', () => {
  assert.equal(weightedFluidHeight(Math.fround(8 / 9), -1, -1, () => { throw Error('should not read diagonal') }), 0.888888955116272)
  assert.equal(weightedFluidHeight(0.2, 1, 0.2, () => 0.2), 1)
  const result = waterGeometry(p, fixture([['0,64,0', water(Math.fround(8 / 9))]]))
  assert.equal(result.quads.length, 6)
  assert.ok(result.corners.nw < 8 / 9 && result.corners.nw > 0.65)
  assert.equal(result.quads.find(q => q.face === 'up').texture, 'minecraft:block/water_still')
  assert.equal(result.atlasShrinkVerified, false)
})

test('same-fluid neighbors hide interior faces and solids clip water sides and bottom', () => {
  const surrounded = fixture([['0,64,0', water(8 / 9)], ['0,64,-1', water(8 / 9)], ['0,64,1', water(8 / 9)], ['-1,64,0', water(8 / 9)], ['1,64,0', water(8 / 9)], ['-1,64,-1', water(8 / 9)], ['-1,64,1', water(8 / 9)], ['1,64,-1', water(8 / 9)], ['1,64,1', water(8 / 9)], ['0,63,0', stone]])
  const result = waterGeometry(p, surrounded)
  assert.deepEqual(result.quads.map(q => q.face), ['up'])
  assert.equal(result.corners.nw, Math.fround(0.888888955116272 - Math.fround(0.001)))
  const blocked = waterGeometry(p, fixture([['0,64,0', water(8 / 9)], ['1,64,0', stone]]))
  assert.equal(blocked.quads.some(q => q.face === 'east'), false)
})

test('flowing water uses actual level gradient and original flow texture', () => {
  const result = waterGeometry(p, fixture([['0,64,0', water(8 / 9)], ['1,64,0', water(2 / 9)]]))
  assert.ok(result.flow.x > 0.99); assert.equal(result.flow.z, 0)
  const top = result.quads.find(q => q.face === 'up')
  assert.equal(top.texture, 'minecraft:block/water_flow')
  assert.notDeepEqual(top.uv, [0, 0, 0, 1, 1, 1, 1, 0])
})

test('voxel occlusion unions boxes rather than treating slabs or gaps as full cubes', () => {
  assert.equal(boxesCover([[0, 0, 0.5, 1], [0.5, 0, 1, 1]], [0, 0], [1, 1]), true)
  assert.equal(boxesCover([[0, 0, 0.4, 1], [0.6, 0, 1, 1]], [0, 0], [1, 1]), false)
  const slab = { ...stone, occlusionBoxes: [[0, 0, 0, 1, 0.5, 1]] }
  assert.equal(faceOccluded(slab, 'east', 0.4), true)
  assert.equal(faceOccluded(slab, 'east', 0.9), false)
  assert.equal(faceOccluded(stone, 'up', 0.9), false)
  assert.equal(faceOccluded(stone, 'up', 1), true)
})

test('missing fluid metadata and dynamic shapes fail explicitly instead of inventing water geometry', () => {
  assert.throws(() => waterGeometry(p, fixture([['0,64,0', water(8 / 9)], ['1,64,0', { ...stone, dynamicShape: true }]])), /OCCLUSION_UNAVAILABLE/)
  assert.throws(() => waterGeometry(p, fixture([['0,64,0', water(8 / 9)], ['1,64,0', { ...stone, canOcclude: undefined }]])), /METADATA_UNAVAILABLE/)
  assert.throws(() => waterGeometry(p, fixture([])), /TYPE_UNSUPPORTED/)
  assert.throws(() => waterGeometry(p, fixture([['0,64,0', water(8 / 9)], ['1,64,0', { ...empty, name: 'mod:unknown_leaves' }]])), /OVERLAY_PROVIDER_UNSUPPORTED/)
})
