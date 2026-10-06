/** Build the JS mesher with a 1.20.6 biome palette for tinted terrain faces. */
import { createRequire } from 'node:module'
import { readFile, stat } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import path from 'node:path'

const GRASS = {
  temperate: 0x91bd67, forest: 0x7db365, jungle: 0x61b85d, arid: 0xb9bf78,
  badlands: 0xabae69, cold: 0xa5bf86, swamp: 0x719c72, cherry: 0x94bd79,
  ocean: 0x91bd67, mushroom: 0x87b36e, nether: 0x9b7967, end: 0x91bd67,
}
const FOLIAGE = {
  temperate: 0x78ad65, forest: 0x67a45e, jungle: 0x56aa62, arid: 0x9dad72,
  badlands: 0x91a367, cold: 0x8eae83, swamp: 0x64966c, cherry: 0x87b47d,
  ocean: 0x78ad65, mushroom: 0x7ba879, nether: 0x8b7266, end: 0x78ad65,
}

export async function buildBiomeTintData(sourceRoot) {
  const sourceRequire = createRequire(path.join(sourceRoot, 'package.json'))
  const mcData = sourceRequire('minecraft-data')('1.20.6')
  const styleSource = await readFile(new URL('./minecraft-viewer-biome-style.js', import.meta.url), 'utf8')
  const resolveStyle = runInNewContext(`${styleSource}\ncortiResolveBiomeStyle`, { globalThis: {} })
  const names = mcData.biomesArray.map(biome => biome.name)
  const oldTints = sourceRequire('minecraft-data/minecraft-data/data/pc/1.16.2/tints.json')
  const waterByBiome = new Map(mcData.tints.water.data.flatMap(({ keys, color }) => keys.map(key => [key, color])))
  const waterDefault = oldTints.water.default
  const tints = {
    grass: { default: GRASS.temperate, data: names.map(name => ({ keys: [name], color: GRASS[resolveStyle(name).group] })) },
    foliage: { default: FOLIAGE.temperate, data: names.map(name => ({ keys: [name], color: FOLIAGE[resolveStyle(name).group] })) },
    water: { default: waterDefault, data: names.map(name => ({ keys: [name], color: waterByBiome.get(name) ?? waterDefault })) },
    redstone: oldTints.redstone,
    constant: oldTints.constant,
  }
  if (names.length < 50 || Object.values(tints).some(entry => !Number.isInteger(entry.default))) {
    throw Error('1.20.6 群系着色数据不完整')
  }
  return tints
}

export async function buildBiomeMesherWorker(sourceRoot, outputRoot, minecraftDataAlias) {
  if (!minecraftDataAlias) throw Error('缺少固定到 1.20.6 的 minecraft-data 别名')
  const sourceRequire = createRequire(path.join(sourceRoot, 'package.json'))
  const { build } = sourceRequire('esbuild')
  const { polyfillNode } = sourceRequire('esbuild-plugin-polyfill-node')
  const tints = await buildBiomeTintData(sourceRoot)
  const workerEntry = path.join(sourceRoot, 'node_modules', 'minecraft-renderer', 'src', 'mesher-legacy', 'mesher.ts')
  const outputFile = path.join(outputRoot, 'public', 'mesher.js')
  const tintsModule = `module.exports = { tints: ${JSON.stringify(tints)} };`
  await build({
    entryPoints: [workerEntry], bundle: true, format: 'iife', platform: 'browser', minify: true,
    legalComments: 'none', outfile: outputFile, target: ['chrome103', 'edge103', 'firefox102', 'safari15.4'],
    define: { 'process.env.NODE_ENV': '"production"' },
    banner: { js: 'globalThis.global = globalThis; globalThis.process = {env: {}, versions: {}};' },
    plugins: [
      { name: 'cortico-1.20.6-biome-tints', setup(context) {
        context.onResolve({ filter: /^minecraft-data$/ }, () => ({ path: minecraftDataAlias }))
        context.onResolve({ filter: /^esbuild-data$/ }, () => ({ path: 'biome-tints', namespace: 'cortico' }))
        context.onLoad({ filter: /^biome-tints$/, namespace: 'cortico' }, () => ({ contents: tintsModule, loader: 'js' }))
      } },
      polyfillNode({ globals: { buffer: true, process: false } }),
    ],
  })
  if ((await stat(outputFile)).size > 8 * 1024 * 1024) throw Error('群系网格 worker 异常膨胀，请检查版本别名')
  return { biomeCount: tints.grass.data.length, outputFile }
}
