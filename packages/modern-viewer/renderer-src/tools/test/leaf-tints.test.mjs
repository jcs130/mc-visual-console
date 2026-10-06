import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { normalizeUntintedLeafModels } from '../minecraft-viewer-leaf-tints.mjs'
import { buildBiomeTintData } from '../build-minecraft-viewer-biome-worker.mjs'

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url))
const sourceRequire = createRequire(path.join(sourceRoot, 'package.json'))

test('removes unused leaf tint indices without changing base models, textures or other leaves', () => {
  const face = { texture: '#all', tintindex: 0, cullface: 'up' }
  const base = { elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { up: face } }] }
  const leaf = texture => ({ parent: 'block/leaves', textures: { all: `block/${texture}` } })
  const original = { models: { latest: {
    'block/leaves': base,
    'block/cherry_leaves': leaf('cherry_leaves'),
    'block/azalea_leaves': leaf('azalea_leaves'),
    'block/flowering_azalea_leaves': leaf('flowering_azalea_leaves'),
    'block/oak_leaves': leaf('oak_leaves'),
  } } }
  const normalized = normalizeUntintedLeafModels(original)
  for (const name of ['cherry_leaves', 'azalea_leaves', 'flowering_azalea_leaves']) {
    const model = normalized.models.latest[`block/${name}`]
    assert.equal(model.elements[0].faces.up.tintindex, undefined)
    assert.equal(model.elements[0].faces.up.texture, '#all')
    assert.equal(model.elements[0].faces.up.cullface, 'up')
    assert.equal(model.textures.all, `block/${name}`)
  }
  assert.equal(normalized.models.latest['block/oak_leaves'], original.models.latest['block/oak_leaves'])
  assert.equal(normalized.models.latest['block/leaves'], base)
  assert.equal(face.tintindex, 0)
})

async function loadRenderer(tints) {
  const { build } = sourceRequire('esbuild')
  const rendererRoot = path.dirname(sourceRequire.resolve('minecraft-renderer/package.json'))
  const result = await build({
    stdin: { contents: `
      export { World } from ${JSON.stringify(path.join(rendererRoot, 'src/mesher-shared/world.ts'))};
      export { getSectionGeometry, setBlockStatesData } from ${JSON.stringify(path.join(rendererRoot, 'src/mesher-shared/models.ts'))};
      export { renderBlockThreeAttr } from ${JSON.stringify(path.join(rendererRoot, 'src/mesher-shared/standaloneRenderer.ts'))};
      export { TintPalette } from ${JSON.stringify(path.join(rendererRoot, 'src/three/shaders/tintPalette.ts'))};
      export { getTint as getWasmTint } from ${JSON.stringify(path.join(rendererRoot, 'src/wasm-mesher/bridge/render-from-wasm.ts'))};
      export { default as createBlockProvider } from 'mc-assets/dist/worldBlockProvider';`, resolveDir: sourceRoot },
    bundle: true, write: false, format: 'cjs', platform: 'node',
    external: ['minecraft-data', 'prismarine-chunk', 'prismarine-block', 'vec3', 'three'],
    plugins: [{ name: 'actual-biome-worker-tints', setup(context) {
      // Expose the dependency's existing WASM tint function for this test only.
      context.onLoad({ filter: /[\\/]bridge[\\/]render-from-wasm\.ts$/ }, async ({ path: file }) => ({
        contents: `${await readFile(file, 'utf8')}\nexport { getTint };`, loader: 'ts', resolveDir: path.dirname(file),
      }))
      context.onResolve({ filter: /^esbuild-data$/ }, () => ({ path: 'tints', namespace: 'test' }))
      context.onLoad({ filter: /^tints$/, namespace: 'test' }, () => ({
        contents: `module.exports = { tints: ${JSON.stringify(tints)} }`, loader: 'js',
      }))
    } }],
  })
  const module = { exports: {} }
  runInNewContext(result.outputFiles[0].text, {
    module, exports: module.exports, require: sourceRequire,
    console, Buffer, setTimeout, clearTimeout, performance, structuredClone,
  })
  return module.exports
}

// Run this integration test against the official JAR exports used in the build:
// MC_VIEWER_ASSETS_ROOT=<output package root> node --test tools/test/leaf-tints.test.mjs
test('official 1.20.6 models produce original cherry color in terrain and held geometry', {
  skip: !process.env.MC_VIEWER_ASSETS_ROOT && 'Set MC_VIEWER_ASSETS_ROOT to an official 1.20.6 exported viewer package',
}, async () => {
  const assetsRoot = process.env.MC_VIEWER_ASSETS_ROOT
  const loadJson = async name => JSON.parse(await readFile(path.join(assetsRoot, name), 'utf8'))
  const original = await loadJson('render-assets/blockStatesModels.json')
  const atlas = await loadJson('render-assets/blocksAtlases.json')
  const manifest = await loadJson('public/asset-source.json')
  assert.equal(manifest.minecraftVersion, '1.20.6')
  assert.equal(manifest.clientJarSha256, '02dfd345ac1ad55692d5dbc8486ac7e4fea72cd54ac494a79cd48963048e56b2')
  const texture = await readFile(path.join(assetsRoot, 'public/textures/1.20.6/block/cherry_leaves.png'))
  assert.equal(createHash('sha256').update(texture).digest('hex'), '0280f50c8daeed2b51b2cee8d94461fdc95aab74654c57d727323e49a76136ba')
  const before = JSON.stringify(original)
  const normalized = normalizeUntintedLeafModels(original)
  const tints = await buildBiomeTintData(sourceRoot)
  const renderer = await loadRenderer(tints)
  const palette = renderer.TintPalette.fromTintsData(tints)
  const data = sourceRequire('minecraft-data')('1.20.6')
  const Chunk = sourceRequire('prismarine-chunk')('1.20.6')
  const Block = sourceRequire('prismarine-block')('1.20.6')
  const { Vec3 } = sourceRequire('vec3')

  const resolvedFaces = (models, name, stateId = data.blocksByName[name].defaultState) => {
    const provider = renderer.createBlockProvider(models, atlas, '1.20.6')
    const block = Block.fromStateId(stateId, data.biomesByName.plains.id)
    assert.equal(block.name, name)
    const resolved = provider.getAllResolvedModels0_1(block)
    const faces = resolved.flat(2).flatMap(model => model.elements.flatMap(element => Object.values(element.faces)))
    assert.equal(faces.length, 6)
    for (const face of faces) assert.equal(face.texture.debugName, `block/${name}`)
    return { faces, resolved, block }
  }
  assert.ok(resolvedFaces(original, 'cherry_leaves').faces.every(face => face.tintindex === 0))
  for (const name of ['cherry_leaves', 'azalea_leaves', 'flowering_azalea_leaves']) {
    const { minStateId, maxStateId } = data.blocksByName[name]
    for (let stateId = minStateId; stateId <= maxStateId; stateId++) {
      assert.ok(resolvedFaces(normalized, name, stateId).faces.every(face => face.tintindex === undefined))
    }
    const { resolved, block } = resolvedFaces(normalized, name)
    for (const face of resolvedFaces(normalized, name).faces) {
      assert.deepEqual(Array.from(renderer.getWasmTint(face, name, {}, 'cherry_grove')), [1, 1, 1])
      assert.equal(palette.getTintIndex(face.tintindex, name, {}, 'cherry_grove'), 0)
    }
    const held = renderer.renderBlockThreeAttr(resolved, block, 'plains', data)
    assertNeutral(held.colors)
  }
  for (const name of ['oak_leaves', 'mangrove_leaves', 'birch_leaves', 'spruce_leaves']) {
    assert.ok(resolvedFaces(normalized, name).faces.every(face => face.tintindex === 0))
    assert.equal(normalized.models.latest[`block/${name}`], original.models.latest[`block/${name}`])
    for (const face of resolvedFaces(normalized, name).faces) {
      assert.ok(palette.getTintIndex(face.tintindex, name, {}, 'cherry_grove') > 0)
    }
  }

  function terrain(models, name, biome) {
    renderer.setBlockStatesData(models, atlas, false, false, '1.20.6', { blocks: data.blocksArray })
    const chunk = new Chunk({ minY: 0, worldHeight: 16 })
    const pos = new Vec3(8, 8, 8)
    chunk.setBlockStateId(pos, data.blocksByName[name].defaultState)
    chunk.setBiome(pos, data.biomesByName[biome].id)
    const world = new renderer.World('1.20.6')
    Object.assign(world.config, { worldMinY: 0, worldMaxY: 16, enableLighting: false, smoothLighting: false, shadingTheme: 'vanilla' })
    world.addColumn(0, 0, chunk.toJson())
    const attr = renderer.getSectionGeometry(0, 0, 0, world)
    assert.equal(attr.hadErrors, false)
    assert.equal(attr.positions.length, 72)
    return attr.colors
  }
  const oldColors = terrain(original, 'cherry_leaves', 'cherry_grove')
  assert.ok(oldColors[1] > oldColors[0]) // reproduces the green vertex multiplier
  for (const name of ['cherry_leaves', 'azalea_leaves', 'flowering_azalea_leaves']) {
    for (const biome of ['cherry_grove', 'plains', 'desert']) assertNeutral(terrain(normalized, name, biome))
  }
  const tintColor = (group, key) => {
    const rgb = tints[group].data.find(row => row.keys.includes(key)).color
    return [(rgb >>> 16) & 255, (rgb >>> 8) & 255, rgb & 255]
  }
  for (const name of ['oak_leaves', 'mangrove_leaves']) {
    for (const biome of ['cherry_grove', 'desert']) assertTint(terrain(normalized, name, biome), tintColor('foliage', biome))
  }
  for (const name of ['birch_leaves', 'spruce_leaves']) {
    for (const biome of ['cherry_grove', 'desert']) assertTint(terrain(normalized, name, biome), tintColor('constant', name))
  }
  assert.equal(JSON.stringify(original), before)
})

function assertNeutral(colors) {
  assert.ok(colors.length > 0)
  for (let i = 0; i < colors.length; i += 3) {
    assert.ok(Math.abs(colors[i] - colors[i + 1]) < 1e-6)
    assert.ok(Math.abs(colors[i] - colors[i + 2]) < 1e-6)
  }
}

function assertTint(colors, rgb) {
  assert.ok(colors.length > 0)
  for (let i = 0; i < colors.length; i += 3) {
    assert.ok(Math.abs(colors[i] / colors[i + 1] - rgb[0] / rgb[1]) < 1e-6)
    assert.ok(Math.abs(colors[i] / colors[i + 2] - rgb[0] / rgb[2]) < 1e-6)
  }
}
