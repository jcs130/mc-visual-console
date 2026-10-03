/** Export a small, version-locked set of local Minecraft sounds for the viewer. */
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const [versionArg, assetsArg, outputArg] = process.argv.slice(2)
if (!versionArg || !assetsArg || !outputArg) {
  console.error('用法：node tools/export-minecraft-viewer-sounds.mjs <1.20.6.json> <启动器 assets 目录> <输出包目录>')
  process.exit(2)
}
const version = JSON.parse(await readFile(path.resolve(versionArg), 'utf8'))
if (version.id !== '1.20.6' || !version.assetIndex?.id || !version.assetIndex?.sha1) {
  throw Error('音效必须来自 1.20.6 客户端的资源索引')
}
const assetsRoot = path.resolve(assetsArg)
const outputRoot = path.resolve(outputArg)
const sha1 = value => createHash('sha1').update(value).digest('hex')
const indexBytes = await readFile(path.join(assetsRoot, 'indexes', `${version.assetIndex.id}.json`))
if (sha1(indexBytes) !== version.assetIndex.sha1) throw Error('资源索引与 1.20.6 客户端不匹配')
const index = JSON.parse(indexBytes.toString('utf8')).objects
const objectFile = hash => path.join(assetsRoot, 'objects', hash.slice(0, 2), hash)
const soundsHash = index['minecraft/sounds.json']?.hash
if (!/^[a-f0-9]{40}$/.test(soundsHash ?? '')) throw Error('资源索引缺少 sounds.json')
const soundsBytes = await readFile(objectFile(soundsHash))
if (sha1(soundsBytes) !== soundsHash) throw Error('sounds.json 内容与资源索引不匹配')
const source = JSON.parse(soundsBytes.toString('utf8'))
const include = key => /^block\.[^.]+\.(break|step|place)$/.test(key)
  || /^entity\.[^.]+\.(ambient|hurt|death)$/.test(key)
  || /^entity\.(player|item|experience_orb|generic|lightning_bolt)\./.test(key)
  || /^block\.(chest|furnace|anvil|bell|wooden_door|iron_door)\./.test(key)
const events = {}
const files = {}
for (const [key, definition] of Object.entries(source)) {
  if (!include(key) || !Array.isArray(definition.sounds)) continue
  const variants = []
  for (const entry of definition.sounds) {
    if (variants.length === 3) break
    if (entry && typeof entry === 'object' && entry.type === 'event') continue
    const raw = typeof entry === 'string' ? entry : entry?.name
    const name = typeof raw === 'string' ? raw.replace(/^minecraft:/, '') : ''
    if (!/^[a-z0-9_/-]+$/.test(name)) continue
    const relative = `${name}.ogg`
    const hash = index[`minecraft/sounds/${relative}`]?.hash
    if (!/^[a-f0-9]{40}$/.test(hash ?? '')) throw Error(`1.20.6 资源缺少 ${relative}`)
    if (variants.some(variant => variant.file === relative)) continue
    files[relative] = hash
    variants.push({ file: relative,
      volume: typeof entry?.volume === 'number' ? entry.volume : 1,
      pitch: typeof entry?.pitch === 'number' ? entry.pitch : 1 })
  }
  if (variants.length) events[key] = variants
}
const soundRoot = path.join(outputRoot, 'public', 'sounds')
for (const [relative, hash] of Object.entries(files)) {
  const sourceFile = objectFile(hash)
  if (sha1(await readFile(sourceFile)) !== hash) throw Error(`音效内容校验失败：${relative}`)
  const target = path.join(soundRoot, relative)
  await mkdir(path.dirname(target), { recursive: true })
  await copyFile(sourceFile, target)
}
await mkdir(soundRoot, { recursive: true })
await writeFile(path.join(soundRoot, 'manifest.json'), JSON.stringify({
  minecraftVersion: '1.20.6', assetIndexId: version.assetIndex.id,
  assetIndexSha1: version.assetIndex.sha1, soundsJsonSha1: soundsHash,
  events, files,
}) + '\n')
console.log(`1.20.6 音效已导出：${Object.keys(events).length} 个事件，${Object.keys(files).length} 个音频文件`)
