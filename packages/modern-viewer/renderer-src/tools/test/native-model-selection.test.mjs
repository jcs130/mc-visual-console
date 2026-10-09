import test from 'node:test'
import assert from 'node:assert/strict'
import { blockPositionSeed, LegacyModelRandom, weightedModel, multipartMatches, defaultBlockSeedEvidence } from '../../src/native-viewer/model-selection.js'
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

// Exact official 1.21.1 blockstate JSON structure: four equal-weight Y rotations
// for these surfaces; snowy grass is a separate single-model state. Models and
// textures still come through the original hash-verified NativeAssetReader.
const terrainBlockstate = model => ({ variants: { '': [0, 90, 180, 270].map(y => ({ model, ...(y ? { y } : {}) })) } })
const grassBlockstate = { variants: { 'snowy=false': terrainBlockstate('minecraft:block/grass_block').variants[''], 'snowy=true': { model: 'minecraft:block/grass_block_snow' } } }

test('original dirt, dirt path and non-snowy grass select their true rotations by absolute position', () => {
  for (const [[x, y, z], , , index] of fixtures) {
    const p = { x, y, z }
    for (const name of ['dirt', 'dirt_path', 'grass_block']) {
      const blockstate = name === 'grass_block' ? grassBlockstate : terrainBlockstate(`minecraft:block/${name}`)
      const state = { name: `minecraft:${name}`, properties: name === 'grass_block' ? { snowy: 'false' } : {} }
      assert.deepEqual(selectBlockVariants(blockstate, state, p), [{ model: `minecraft:block/${name}`, ...(index ? { y: index * 90 } : {}) }])
    }
  }
})

test('snowy grass retains its original snow model without requiring a random draw', () => {
  assert.deepEqual(selectBlockVariants(grassBlockstate, { name: 'minecraft:grass_block', properties: { snowy: 'true' } }), [{ model: 'minecraft:block/grass_block_snow' }])
  assert.throws(() => selectBlockVariants(grassBlockstate, { name: 'minecraft:grass_block', properties: { snowy: 'false' } }), /POSITION_REQUIRED/)
})

test('default seed evidence is limited to original registrations and exact state properties', () => {
  const dirt = defaultBlockSeedEvidence({ name: 'minecraft:dirt', properties: {} })
  assert.equal(dirt.clientSha1, '30c73b1c5da787909b2f73340419fdf13b9def88')
  assert.equal(dirt.getSeedOwner, 'net.minecraft.world.level.block.state.BlockBehaviour')
  assert.deepEqual(dirt.inheritance, ['net.minecraft.world.level.block.Block', 'net.minecraft.world.level.block.state.BlockBehaviour'])
  const grass = defaultBlockSeedEvidence({ name: 'minecraft:grass_block', properties: { snowy: 'false' } })
  assert.equal(grass.inheritance[0], 'net.minecraft.world.level.block.GrassBlock')
  assert.equal(grass.inheritance[1], 'net.minecraft.world.level.block.SpreadingSnowyDirtBlock')
  assert.equal(grass.inheritance[2], 'net.minecraft.world.level.block.SnowyDirtBlock')
  assert.ok(Object.isFrozen(grass.inheritance))
  assert.equal(defaultBlockSeedEvidence({ name: 'minecraft:sand', properties: {} }).inheritance[0], 'net.minecraft.world.level.block.ColoredFallingBlock')
  const p = { x: -428, y: 67, z: 378 }
  for (const state of [
    { name: 'example:dirt', properties: {}, modelSeedVerified: true },
    { name: 'minecraft:oak_door', properties: {}, modelSeedVerified: true },
    { name: 'minecraft:coarse_dirt', properties: {}, modelSeedVerified: true },
    { name: 'minecraft:dirt', properties: { invented: 'true' }, modelSeedVerified: true },
    { name: 'minecraft:grass_block', properties: {} },
    { name: 'minecraft:grass_block', properties: { snowy: 'unknown' } },
    { name: 'minecraft:grass_block', properties: { snowy: true } },
    { name: '__proto__', properties: {}, modelSeedVerified: true }
  ]) {
    assert.equal(defaultBlockSeedEvidence(state), null)
    assert.throws(() => selectBlockVariants(terrainBlockstate('example:weighted'), state, p), /SEED_UNVERIFIED/)
  }
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
