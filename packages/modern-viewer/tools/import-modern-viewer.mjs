#!/usr/bin/env node
/**
 * 一键导入「现代画面」的派生资源（不入库的那部分）。
 *
 * 为什么需要这个脚本：packages/modern-viewer/src/ 里入库的只有**我们自己写的**桥接与注入脚本；
 * 真正渲染世界的那套引擎（modern-viewer.js ~11MB、mesher/worker/wasm、minecraft-renderer.js）
 * 与资产包（mod-assets/ ~12MB）来自**千灯纪那套现代画面**（萌悦/千灯纪自有项目），
 * 属于派生资源 —— 不入库是刻意的，也意味着克隆下来跑不了画面，必须由持有者自备。
 *
 * 用法：
 *   node packages/modern-viewer/tools/import-modern-viewer.mjs <千灯纪源码目录>
 *   例：node packages/modern-viewer/tools/import-modern-viewer.mjs D:\\Projects\\QiandengJi\\vendor\\modern-viewer
 *
 * 导入之后：
 *   1) node viewer-service/tools/... ✗ 不需要；接着跑皮肤补丁（可选）：
 *      python packages/modern-viewer/tools/patch_official_avatar.py
 *   2) 起服务：powershell -File viewer-service/serve.ps1   （Windows）
 *      或 docker compose up（viewer-service/Dockerfile，Linux 侧 canvas 工具链）
 */
import { existsSync, mkdirSync, copyFileSync, statSync, readdirSync } from 'node:fs'
import { dirname, join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const target = resolve(here, '..', 'assets')

/** 引擎与静态资源：缺一个，画面就起不来或只剩天空。 */
const FILES = [
  'modern-viewer.js',
  'minecraft-renderer.js',
  'minecraft-renderer.js.meta.json',
  'mesher.js',
  'mesherWasm.js',
  'wasm_mesher_bg.wasm',
  'threeWorker.js',
  'runtime-budget.js',
  'viewer.css',
]

/** 目录：mod-assets 是资产包（12MB）；character-assets 是角色模型；npc-portraits 是 NPC 立绘（都可选）。 */
const DIRS = ['mod-assets', 'character-assets', 'npc-portraits']

function human(bytes) {
  return bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : (bytes / 1024).toFixed(1) + ' KB'
}

function copyDir(from, to, depth = 0) {
  let copied = 0
  let bytes = 0
  if (depth > 4) return { copied, bytes }
  if (!existsSync(to)) mkdirSync(to, { recursive: true })
  for (const name of readdirSync(from)) {
    const src = join(from, name)
    const dst = join(to, name)
    const st = statSync(src)
    if (st.isDirectory()) {
      const sub = copyDir(src, dst, depth + 1)
      copied += sub.copied
      bytes += sub.bytes
    } else {
      copyFileSync(src, dst)
      copied += 1
      bytes += st.size
    }
  }
  return { copied, bytes }
}

function main() {
  const src = process.argv[2]
  if (!src) {
    console.error('用法：node packages/modern-viewer/tools/import-modern-viewer.mjs <千灯纪 modern-viewer 源码目录>')
    console.error('例：  node packages/modern-viewer/tools/import-modern-viewer.mjs D:\\Projects\\QiandengJi\\vendor\\modern-viewer')
    process.exit(2)
  }
  const from = resolve(src)
  if (!existsSync(from)) {
    console.error('✗ 源目录不存在：' + from)
    process.exit(2)
  }
  if (!existsSync(target)) mkdirSync(target, { recursive: true })

  console.log('源  ：' + from)
  console.log('目标：' + target)
  console.log('')

  let ok = 0
  const missing = []
  for (const name of FILES) {
    const src2 = join(from, name)
    if (!existsSync(src2)) { missing.push(name); continue }
    const st = statSync(src2)
    copyFileSync(src2, join(target, name))
    console.log('  ✓ ' + name + '  ' + human(st.size))
    ok += 1
  }

  for (const name of DIRS) {
    const src2 = join(from, name)
    if (!existsSync(src2)) { missing.push(name + '/'); continue }
    const r = copyDir(src2, join(target, name))
    console.log('  ✓ ' + name + '/  ' + r.copied + ' 个文件 / ' + human(r.bytes))
    ok += 1
  }

  console.log('')
  if (missing.length > 0) {
    console.log('⚠ 源目录里没有这些（不是错误，视你的源码树而定）：')
    for (const m of missing) console.log('   · ' + m)
    console.log('')
    console.log('  mod-assets/ 需要由资产生成脚本产出（见 千灯纪-observatory/tools/build_web_mod_assets.py），')
    console.log('  它按 1.21.1 + NeoForge 21.1.248 的注册表抽模型与贴图。缺它画面仍能起，但 mod 方块会退化成占位块。')
    console.log('')
  }
  console.log('导入完成（' + ok + ' 项）。接着：')
  console.log('  1) 可选：python packages/modern-viewer/tools/patch_official_avatar.py   # 默认角色换成原版方块人/史蒂夫')
  console.log('  2) 起服务：powershell -File viewer-service/serve.ps1            # 或 docker compose up')
  console.log('  3) 检查：curl http://127.0.0.1:7800/dungeon/  → 200；curl http://127.0.0.1:7801/health → {"ok":true,…}')
}

main()
