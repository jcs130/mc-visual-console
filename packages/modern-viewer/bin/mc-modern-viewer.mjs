#!/usr/bin/env node
/**
 * mc-modern-viewer 的独立启动器 —— 单独起"高级 3D 画面层"，不依赖 viewer-service 那个兼任两职的宿主。
 *
 * 它自己做两件事：连一个 mineflayer bot，然后把画面挂到这个 bot 上。
 * 协议/控制台那半（本仓 src/ 的组件）与它无关 —— 那一半可以单独跑、单独发布（零派生资源）。
 *
 * 环境变量（都有默认值，照本机的门是默认值）：
 *   MC_HOST=127.0.0.1  MC_PORT=25702  MC_USERNAME=ag_viewer  MC_VERSION=1.21.1
 *   VIEWER_PORT=7800                        画面端口
 *   MC_VIEWER_PUBLIC_ORIGIN=http://127.0.0.1:<VIEWER_PORT>
 *   MC_PANEL_ORIGIN / MC_CONSOLE_ORIGIN     允许内嵌画面的 origin（本仓控制台是 7801）
 *   MC_GATE_TRANSLATED=1                    过统一外门时必须为 1（画面层自带铁律，否则拒绝启动）
 *
 * 用法：node bin/mc-modern-viewer.mjs
 */
import { createRequire } from 'node:module'
import { startModernViewer } from '../src/mc-modern-viewer.mts'

const MC_HOST = process.env.MC_HOST ?? '127.0.0.1'
const MC_PORT = Number(process.env.MC_PORT ?? 25702)
const MC_USERNAME = process.env.MC_USERNAME ?? 'ag_viewer'
const MC_VERSION = process.env.MC_VERSION ?? '1.21.1'
const VIEWER_PORT = Number(process.env.VIEWER_PORT ?? 7800)

// 依赖解析：本包 src/ 下没有 node_modules（依赖装在宿主 viewer-service/）。
// 与 src/mc-modern-viewer.mts 用同一个锚点，见那里的注释。
const require = createRequire(new URL('../../../viewer-service/deps-anchor.js', import.meta.url))

// 画面层自己的开关与铁律（它不过门会拒绝启动）
process.env.MC_MODERN_VIEWER = '1'
process.env.MC_GATE_TRANSLATED ??= '1'
process.env.MC_MODERN_VIEWER_PORT ??= String(VIEWER_PORT)
process.env.MC_VIEWER_PUBLIC_ORIGIN ??= `http://127.0.0.1:${VIEWER_PORT}`
process.env.MC_PANEL_ORIGIN ??= 'http://127.0.0.1:7801'
process.env.MC_CONSOLE_ORIGIN ??= 'http://127.0.0.1:7801'

const mineflayer = require('mineflayer')

console.log(`[mc-modern-viewer] 连接 ${MC_HOST}:${MC_PORT} 作为 ${MC_USERNAME}（${MC_VERSION}）`)
const bot = mineflayer.createBot({
  host: MC_HOST,
  port: MC_PORT,
  username: MC_USERNAME,
  version: MC_VERSION,
  auth: 'offline',
})

bot.once('spawn', () => {
  console.log('[mc-modern-viewer] 已进入世界，挂画面')
  startModernViewer(() => bot, { port: VIEWER_PORT })
  console.log(`[mc-modern-viewer] 画面：http://127.0.0.1:${VIEWER_PORT}/  （/ 第一人称 · /third/ 环绕 · /dungeon/ 2.5D）`)
})
bot.on('kicked', (reason) => console.error('[mc-modern-viewer] 被踢：', reason))
bot.on('error', (err) => console.error('[mc-modern-viewer] 出错：', err?.message ?? err))
bot.on('end', (reason) => console.error('[mc-modern-viewer] 连接结束：', reason ?? ''))
