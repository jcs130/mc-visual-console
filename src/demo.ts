/**
 * M0 demo：假 bot + 真 HTTP/WS，打开浏览器就能接管、点地走。
 *
 *   corepack pnpm dev:demo        → 打印地址，浏览器打开即可
 *
 * 注意：这个 demo **不连任何 Minecraft 服务器**，走的是 fixtures/fake-bot.ts 的
 * 脚本化地形与实体。接真服务器是宿主（Cortico 的 World / dsh 的插件）的事。
 */

import { attach } from './server.ts'
import { createFakeBot } from '../fixtures/fake-bot.ts'

const port = Number(process.env.PORT ?? 7799)
const bot = createFakeBot({ username: 'demo-bot' })
const viewer = attach(bot, {
  host: '127.0.0.1',
  port,
  viewDistance: 6,
  log: (line) => console.log(`[${line.level}] ${line.text}`),
})

// 每 3 秒动一下，方便肉眼确认"状态在推、增量在动"
setInterval(() => {
  const p = bot.entity.position
  bot.teleport({ x: p.x + (Math.random() < 0.5 ? 1 : -1), y: p.y, z: p.z })
}, 3000)

console.log(`\n  mc-viewer M0 demo\n  打开： ${viewer.url()}\n  点「claim(接管)」→ 点「走到 (10, -20)」\n  状态每 ${1000 / viewer.snapshot().budget.stateHz}ms 合并一帧\n`)
process.on('SIGINT', () => { void viewer.close().then(() => process.exit(0)) })
