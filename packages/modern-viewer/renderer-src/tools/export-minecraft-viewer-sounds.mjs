/** Export vanilla sounds from version-matched, hash-verified launcher assets. */
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expandMinecraftSounds } from './minecraft-viewer-sound-manifest.mjs'

const [versionArg, assetsArg, outputArg,indexArg] = process.argv.slice(2)
if (!versionArg || !assetsArg || !outputArg) {
  console.error('用法：node tools/export-minecraft-viewer-sounds.mjs <version.json> <启动器 assets 目录> <输出包目录> [匹配原始索引 JSON]')
  process.exit(2)
}
const version = JSON.parse(await readFile(path.resolve(versionArg), 'utf8'))
if (!['1.20.6','1.21.1'].includes(version.id) || !version.assetIndex?.id || !version.assetIndex?.sha1) {
  throw Error('音效必须来自已核验版本客户端的资源索引')
}
const assetsRoot = path.resolve(assetsArg)
const outputRoot = path.resolve(outputArg)
const sha1 = value => createHash('sha1').update(value).digest('hex')
const indexBytes = await readFile(indexArg?path.resolve(indexArg):path.join(assetsRoot, 'indexes', `${version.assetIndex.id}.json`))
if (sha1(indexBytes) !== version.assetIndex.sha1) throw Error(`资源索引与 ${version.id} 客户端不匹配`)
const index = JSON.parse(indexBytes.toString('utf8')).objects
const objectFile = hash => path.join(assetsRoot, 'objects', hash.slice(0, 2), hash)
const soundsHash = index['minecraft/sounds.json']?.hash
if (!/^[a-f0-9]{40}$/.test(soundsHash ?? '')) throw Error('资源索引缺少 sounds.json')
const soundsBytes = await readFile(objectFile(soundsHash))
if (sha1(soundsBytes) !== soundsHash) throw Error('sounds.json 内容与资源索引不匹配')
const source = JSON.parse(soundsBytes.toString('utf8'))
const { events, files, eventMetadata } = expandMinecraftSounds(source, index)
const soundRoot = path.join(outputRoot, 'public', 'sounds')
const fileMetadata={}
for (const [relative, hash] of Object.entries(files)) {
  const sourceFile = objectFile(hash)
  const bytes=await readFile(sourceFile)
  if (sha1(bytes) !== hash) throw Error(`音效内容校验失败：${relative}`)
  fileMetadata[relative]={sha1:hash,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length}
  const target = path.join(soundRoot, relative)
  await mkdir(path.dirname(target), { recursive: true })
  await copyFile(sourceFile, target)
}
await mkdir(soundRoot, { recursive: true })
if(version.id==='1.21.1'){
  await writeFile(path.join(soundRoot,'source-index.json'),indexBytes)
  await writeFile(path.join(soundRoot,'source-sounds.json'),soundsBytes)
}
await writeFile(path.join(soundRoot, 'manifest.json'), JSON.stringify({
  schemaVersion: version.id==='1.21.1'?3:2, minecraftVersion: version.id, assetIndexId: version.assetIndex.id,
  assetIndexSha1: version.assetIndex.sha1, soundsJsonSha1: soundsHash,
  events, files, eventMetadata,...(version.id==='1.21.1'?{fileMetadata}:{}),
}) + '\n')
console.log(`${version.id} 音效已导出：${Object.keys(events).length} 个事件，${Object.keys(files).length} 个音频文件`)
