/** Check every 1.20.6 state against the exported renderer models. */
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import minecraftData from 'minecraft-data'
import prismarineBlock from 'prismarine-block'
import { verifyViewerContentAssets } from './viewer-content-assets.mjs'

const [jarArg, rootArg] = process.argv.slice(2)
if (!jarArg || !rootArg) {
  console.error('用法：node tools/verify-minecraft-viewer-assets.mjs <1.20.6.jar> <输出包目录>')
  process.exit(2)
}
const root = path.resolve(rootArg)
const version = '1.20.6'
const source = JSON.parse(await readFile(path.join(root, 'public', 'asset-source.json'), 'utf8'))
const client = JSON.parse(await readFile(path.join(root, 'viewer-client.json'), 'utf8'))
if (source.minecraftVersion !== version || client.minecraftVersion !== version ||
  client.clientJarSha256 !== source.clientJarSha256) throw Error('资源或浏览器 bundle 版本不符')
const jarHash = createHash('sha256').update(await readFile(path.resolve(jarArg))).digest('hex')
if (source.clientJarSha256 !== jarHash) throw Error('资源不是从指定的 1.20.6 客户端 JAR 导出')
const browserHash = createHash('sha256').update(await readFile(path.join(root, 'dist', 'modern-viewer.js'))).digest('hex')
if (client.browserBundleSha256 !== browserHash) throw Error('浏览器 bundle 与构建清单不符')
if (client.viewerContent) {
  const content=await verifyViewerContentAssets(root,jarHash,{required:true})
  if(content.manifestSha256!==client.viewerContent.manifestSha256)throw Error('内容资源与浏览器构建清单不符')
}

for (const relative of ['dist/modern-viewer.js', 'public/mesher.js', 'public/mesherWasm.js',
  'public/threeWorker.js', `public/textures/${version}.png`]) {
  if (!(await stat(path.join(root, relative)).catch(() => null))?.isFile()) throw Error(`缺少 ${relative}`)
}

const mc = minecraftData(version)
if (!mc) throw Error(`minecraft-data 缺少 ${version}`)
const Block = prismarineBlock(version)
const baked = JSON.parse(await readFile(path.join(root, 'public', 'blocksStates', `${version}.json`), 'utf8'))
const errors = []
const sha256 = content => createHash('sha256').update(content).digest('hex')
for (const [filename, expected] of Object.entries(source.iconHashes ?? {})) {
  const actual = sha256(await readFile(path.join(root, 'public', 'icons', filename)))
  if (actual !== expected) errors.push(`物品图标内容变化：${filename}`)
}
if (Object.keys(source.iconHashes ?? {}).length !== source.itemIcons || source.itemIcons < 1600) {
  errors.push('物品图标清单不完整')
}
for (const [relative, expected] of Object.entries(source.textureHashes ?? {})) {
  const actual = sha256(await readFile(path.join(root, 'public', 'textures', version, relative)))
  if (actual !== expected) errors.push(`纹理内容变化：${relative}`)
}
if (Object.keys(source.textureHashes ?? {}).length !== source.textures + source.derivedTextures) {
  errors.push('纹理数量与 JAR 清单不符')
}
for (const [filename, expected] of Object.entries(source.renderAssetHashes ?? {})) {
  const actual = sha256(await readFile(path.join(root, 'render-assets', filename)))
  if (actual !== expected) errors.push(`渲染资源内容变化：${filename}`)
}
const renderModels = JSON.parse(await readFile(path.join(root, 'render-assets', 'blockStatesModels.json'), 'utf8'))
const blockAtlas = JSON.parse(await readFile(path.join(root, 'render-assets', 'blocksAtlases.json'), 'utf8')).latest.textures
const itemAtlas = JSON.parse(await readFile(path.join(root, 'render-assets', 'itemsAtlases.json'), 'utf8')).latest.textures
for (const name of Object.keys(mc.blocksByName)) {
  if (!renderModels.blockstates.latest[name]) errors.push(`${name}: 现代渲染器方块状态缺失`)
}
for (const [name, model] of Object.entries(renderModels.models.latest)) {
  for (const texture of Object.values(model.textures ?? {})) {
    if (typeof texture !== 'string' || texture.startsWith('#')) continue
    const atlas = name.startsWith('item/') && texture.startsWith('item/') ? itemAtlas : blockAtlas
    const key = atlas === itemAtlas ? texture.slice(5) : texture.replace(/^block\//, '')
    if (!atlas[key]) errors.push(`${name}: 渲染纹理缺失 ${texture}`)
    if (name.startsWith('item/') && texture.startsWith('trims/items/')) {
      const trimKey = texture.replace('trims/items/', 'trims/')
      if (!itemAtlas[trimKey]) errors.push(`${name}: 物品图集纹饰缺失 ${texture}`)
    }
  }
}
const paintings = JSON.parse(await readFile(path.join(root, 'render-assets', 'painting-records.json'), 'utf8'))
for (const [name] of paintings) {
  if (!(await stat(path.join(root, 'public', 'textures', version, 'painting', `${name}.png`)).catch(() => null))?.isFile()) {
    errors.push(`画作纹理缺失：${name}`)
  }
}
let states = 0
for (const [key, block] of Object.entries(mc.blocksByStateId)) {
  const id = Number(key)
  const entry = baked[block.name]
  if (!entry) { errors.push(`${id} ${block.name}: 无模型`); continue }
  const variants = Object.keys(entry.variants ?? {})
  if (!variants.length && !entry.multipart?.length) { errors.push(`${id} ${block.name}: 无状态变体`); continue }
  if (variants.length) {
    const properties = Block.fromStateId(id).getProperties()
    const matches = variants.some((key) => !key || key.split(',').every((pair) => {
      const [name, value] = pair.split('=')
      return String(properties[name]) === value
    }))
    if (!matches) { errors.push(`${id} ${block.name}: 状态变体未覆盖 ${JSON.stringify(properties)}`); continue }
  }
  states++
}
const emptyModels = new Set()
let nullTextures = 0
function checkModel(name, item) {
  const model = item?.model
  if (!model) { errors.push(`${name}: 模型载荷缺失`); return }
  if (!Object.keys(model.textures ?? {}).length && !model.elements?.length) emptyModels.add(name)
  for (const texture of Object.values(model.textures ?? {})) if (texture === null) nullTextures++
  for (const element of model.elements ?? []) {
    for (const face of Object.values(element.faces ?? {})) if (face.texture === null) nullTextures++
  }
}
for (const [name, entry] of Object.entries(baked)) {
  for (const value of Object.values(entry.variants ?? {})) {
    for (const item of Array.isArray(value) ? value : [value]) checkModel(name, item)
  }
  for (const part of entry.multipart ?? []) {
    for (const item of Array.isArray(part.apply) ? part.apply : [part.apply]) checkModel(name, item)
  }
}
for (const color of ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink',
  'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']) {
  const name = `${color}_bed`
  const entry = baked[name]
  if (!entry) { errors.push(`${name}: 床方块实体缺失`); continue }
  for (const part of ['head', 'foot']) for (const facing of ['north', 'east', 'south', 'west']) {
    const model = entry.variants?.[`part=${part},facing=${facing}`]?.model
    if (!model?.elements?.length) errors.push(`${name}: ${part}/${facing} 不是实体床几何体`)
  }
  if (!renderModels.models.latest[`block/bed/${color}_head`] || !renderModels.models.latest[`block/bed/${color}_foot`]) {
    errors.push(`${name}: 现代渲染器床实体模型缺失`)
  }
}
for (const [name, textures] of [
  ['chest', ['normal', 'normal_left', 'normal_right']],
  ['trapped_chest', ['trapped', 'trapped_left', 'trapped_right']],
  ['ender_chest', ['ender']],
]) {
  for (const value of Object.values(baked[name]?.variants ?? {})) {
    const model = value.model
    if (!model?.elements?.length || !model.textures?.chest) errors.push(`${name}: 箱子实体几何或纹理缺失`)
  }
  for (const texture of textures) {
    if (!renderModels.models.latest[`block/viewer/chest_${texture}`] ||
        !blockAtlas[`entity/chest/${texture}`]) errors.push(`${name}: ${texture} 箱子实体资源缺失`)
  }
}
for (const wood of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove',
  'cherry', 'bamboo', 'crimson', 'warped']) {
  for (const [suffix, form, texture] of [
    ['sign', 'standing', `entity/signs/${wood}`],
    ['wall_sign', 'wall', `entity/signs/${wood}`],
    ['hanging_sign', 'hanging', `entity/signs/hanging/${wood}`],
    ['wall_hanging_sign', 'wall_hanging', `entity/signs/hanging/${wood}`],
  ]) {
    const name = `${wood}_${suffix}`
    const variants = Object.values(baked[name]?.variants ?? {})
    if (!variants.length || variants.some(value => !value.model?.elements?.length ||
        !value.model?.textures?.[form.includes('hanging') ? 'wood' : 'sign'])) {
      errors.push(`${name}: 告示牌实体几何或纹理缺失`)
    }
    if (!renderModels.models.latest[`block/viewer/sign/${wood}_${form}`] || !blockAtlas[texture]) {
      errors.push(`${name}: 告示牌实体资源缺失`)
    }
  }
}
for (const name of emptyModels) if (!['air', 'cave_air', 'void_air'].includes(name)) errors.push(`${name}: 空模型`)
if (nullTextures) errors.push(`${nullTextures} 处纹理未解析`)
if (errors.length) throw Error(`资源校验失败 ${errors.length} 项：\n${errors.slice(0, 25).join('\n')}`)
console.log(`Minecraft ${version}: ${states} 个 state ID 全覆盖，${Object.keys(baked).length} 个方块，${source.itemIcons} 张物品图标，${source.textures} 张原版纹理 + ${source.derivedTextures} 张按原版规则生成的纹饰、${paintings.length} 幅画作；渲染纹理引用无缺失；JAR SHA-256 ${jarHash}`)
