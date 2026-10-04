import test from 'node:test'
import assert from 'node:assert/strict'
import { blockPositionSeed, LegacyModelRandom, weightedModel, multipartMatches } from '../../src/native-viewer/model-selection.js'
import { selectBlockVariants } from '../../src/native-viewer/model-loader.js'

// Independent Java 21 fixture: Java int/long overflow and java.util.Random;
// the exact formula/random/selection matched official 1.21.1 bytecode first.
const fixtures = [
  [[0, 0, 0], '0', '-4962768465676381896', 0],
  [[1, 2, 3], '-33674130277896', '-3774776766155813106', 2],
  [[-2, 64, -1], '-78123834207996', '-7980205256155807754', 2],
  [[17, 64, 17], '12548440408943', '-1871916195057354620', 0],
  [[-100, 300, -101], '-80177237896214', '-1900506848763377662', 2],
  [[3, 65, -2], '-64807958914262', '-8073416349704422891', 3],
  [[-30000000, -64, 30000000], '-36386240128100', '4085448494266116610', 2]
]
test('position seed and weighted variants match independent Java at negative and large positions', () => {
  const variants = [0, 1, 2, 3].map(index => ({ model: `minecraft:test_${index}` }))
  for (const [[x, y, z], seed, random, index] of fixtures) {
    const p = { x, y, z }
    assert.equal(blockPositionSeed(p), BigInt(seed))
    assert.equal(new LegacyModelRandom(BigInt(seed)).nextLong(), BigInt(random))
    assert.equal(weightedModel(variants, p), variants[index])
  }
})

test('weighted selection requires position and a verified block seed implementation', () => {
  const blockstate = { variants: { '': [{ model: 'minecraft:stone' }, { model: 'minecraft:stone_mirrored' }] } }
  assert.throws(() => selectBlockVariants(blockstate, { name: 'test:custom_seed', properties: {} }, { x: 0, y: 0, z: 0 }), /UNVERIFIED/)
  assert.throws(() => selectBlockVariants(blockstate, { name: 'minecraft:stone', properties: {} }), /POSITION_REQUIRED/)
  assert.throws(() => weightedModel([{ weight: 0 }], { x: 0, y: 0, z: 0 }), /WEIGHT_INVALID/)
})

test('multipart uses actual properties including nested OR/AND and negated alternatives', () => {
  const properties = { east: 'true', west: 'false', facing: 'north' }
  assert.equal(multipartMatches({ OR: [{ east: 'true' }, { west: 'true' }] }, properties), true)
  assert.equal(multipartMatches({ AND: [{ east: 'true' }, { facing: '!south|east' }] }, properties), true)
  assert.equal(multipartMatches({ east: 'false' }, properties), false)
  const parts = selectBlockVariants({ multipart: [{ when: { east: 'true' }, apply: { model: 'test:part' } }, { when: { west: 'true' }, apply: { model: 'test:other' } }] }, { name: 'test:fence', properties })
  assert.deepEqual(parts, [{ model: 'test:part' }])
  assert.throws(() => multipartMatches({ missing: 'true' }, properties), /PROPERTY_UNAVAILABLE/)
})
