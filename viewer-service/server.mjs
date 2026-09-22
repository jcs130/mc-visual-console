/**
 * Linux 侧 viewer 服务 —— 复用 prismarine-viewer 出画面，外加本仓库的接管协议。
 *
 * 为什么在容器里跑：prismarine-viewer 的服务端要原生 node-canvas（图集与实体光栅化），
 * 而 canvas 在 Windows 上要 Visual Studio 工具链；千灯纪那套也是在 Linux 容器里构建的。
 * 所以：**画面交给它（成熟实现），协议与权限交给我们**。
 *
 * 环境变量：
 *   MC_HOST=127.0.0.1  MC_PORT=25565  MC_USERNAME=viewer-bot  MC_VERSION=1.21.11
 *   VIEWER_PORT=7800   VIEW_DISTANCE=6  FIRST_PERSON=0  PROTOCOL_PORT=7801
 *
 * 两条端口：
 *   VIEWER_PORT  —— prismarine-viewer 自己的页面与 socket.io（画面）
 *   PROTOCOL_PORT —— 本仓库的协议（/health /state + WS：claim/release/moveTo/lookAt/action/camera/set）
 */

import { createRequire } from 'node:module'
import { startModernViewer } from './modern-viewer/mc-modern-viewer.mts'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'

const require = createRequire(import.meta.url)

const MC_HOST = process.env.MC_HOST ?? '127.0.0.1'
const MC_PORT = Number(process.env.MC_PORT ?? 25702)   // 只连统一外门 25702（25565/25567 是真人 NeoForge 口，裸连会读到错乱世界）
const MC_USERNAME = process.env.MC_USERNAME ?? 'ag_xiaozhi'   // 必须 ag_ 开头；名字=UUID=身份，定死别改
const MC_VERSION = process.env.MC_VERSION ?? '1.21.1'   // 门是 1.21.1 + offline；1.21.1 在 prismarine-viewer 支持列表内，无需别名补丁
const VIEWER_PORT = Number(process.env.VIEWER_PORT ?? 7800)
const VIEW_DISTANCE = Number(process.env.VIEW_DISTANCE ?? 6)
const FIRST_PERSON = process.env.FIRST_PERSON === '1'
const PROTOCOL_PORT = Number(process.env.PROTOCOL_PORT ?? 7801)

const PROTOCOL_VERSION = 0
const DEFAULT_BUDGET = { maxSessions: 2, stateHz: 10, maxEntities: 200, maxBlocksPerChunk: 4096 }
const HOLDER_ONLY = new Set(['moveTo', 'lookAt', 'action', 'camera', 'set'])

console.log(`[viewer-service] 连接 ${MC_HOST}:${MC_PORT} 作为 ${MC_USERNAME}（${MC_VERSION}）`)

const mineflayer = require('mineflayer')
const bot = mineflayer.createBot({
  host: MC_HOST,
  port: MC_PORT,
  username: MC_USERNAME,
  version: MC_VERSION,
  auth: 'offline',
})

let viewerReady = false
let viewerHandle = null
let pathfinderReady = false
let Movements = null
let goals = null

bot.once('spawn', () => {
  console.log(`[viewer-service] 已进入世界，位置 ${JSON.stringify(bot.entity.position)}`)
  // ① 画面：换成「现代画面」（萌悦/千灯纪 modern-viewer 的桥接）
  //    它自带的铁律：过门时必须 MC_GATE_TRANSLATED=1，否则拒绝启动（防画错世界）
  try {
    viewerHandle = startModernViewer(() => bot, { port: VIEWER_PORT })
    viewerReady = true
    console.log(`[viewer-service] 现代画面已启动（modern-viewer，端口 :${VIEWER_PORT}）`)
  } catch (err) {
    console.error('[viewer-service] 现代画面启动失败：', err?.message ?? err)
  }
  // ② 走位：mineflayer-pathfinder（和 A 仓同一套）
  try {
    const pf = require('mineflayer-pathfinder')
    Movements = pf.Movements
    goals = pf.goals
    bot.loadPlugin(pf.pathfinder)
    pathfinderReady = true
    console.log('[viewer-service] pathfinder 已装载')
  } catch (err) {
    console.warn('[viewer-service] pathfinder 不可用（moveTo 会回 not_supported）：', err?.message ?? err)
  }
})

bot.on('error', (err) => console.error('[viewer-service] bot 错误：', err?.message ?? err))
bot.on('end', (why) => console.warn('[viewer-service] 断开：', why))

// ------------------------------------------------------------------ 我们的协议

let seq = 0
let holder = null
let holderTimer = null
let dirty = true
const sessions = new Map()

const opus = () => ({
  ok: true,
  bot: MC_USERNAME,
  inWorld: bot.entity != null,
  viewers: sessions.size,
  holder,
  viewer: viewerReady ? `http://127.0.0.1:${VIEWER_PORT}/` : null,
})

function snapshot() {
  const entities = Object.values(bot.entities ?? {}).slice(0, DEFAULT_BUDGET.maxEntities).map((e) => ({
    id: String(e.id), name: e.name ?? 'unknown', username: e.username,
    position: [e.position.x, e.position.y, e.position.z], yaw: e.yaw, pitch: e.pitch,
  }))
  return {
    seq,
    bot: {
      username: MC_USERNAME,
      position: [bot.entity?.position.x ?? 0, bot.entity?.position.y ?? 0, bot.entity?.position.z ?? 0],
      yaw: bot.entity?.yaw ?? 0, pitch: bot.entity?.pitch ?? 0,
      health: bot.health, food: bot.food,
    },
    holder,
    viewDistance: VIEW_DISTANCE,
    entities,
    blocks: [],   // 画面由 prismarine-viewer 出；协议里不再重复传方块
    budget: DEFAULT_BUDGET,
  }
}

function broadcast(msg) {
  const text = JSON.stringify(msg)
  for (const ws of sessions) if (ws.readyState === ws.OPEN) ws.send(text)
}

function setHolder(next, reason) {
  holder = next
  if (holderTimer) { clearTimeout(holderTimer); holderTimer = null }
  if (next) holderTimer = setTimeout(() => setHolder(null, 'timeout'), 10 * 60 * 1000)
  broadcast({ type: 'holder', holder, reason })
}

function markDirty() { dirty = true }
setInterval(() => {
  if (!dirty) return
  dirty = false
  seq += 1
  broadcast({ type: 'delta', seq, bot: snapshot().bot })
}, Math.round(1000 / DEFAULT_BUDGET.stateHz))

for (const ev of ['move', 'physicsTick', 'entityMoved', 'entitySpawned', 'entityGone', 'health', 'death', 'blockUpdate']) {
  bot.on(ev, markDirty)
}

async function handle(ws, session, cmd) {
  const reply = (m) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m))
  if (HOLDER_ONLY.has(cmd.type) && holder !== session.id) {
    return reply({ type: 'error', id: cmd.id, code: 'not_holder', message: '当前不是你接管' })
  }
  try {
    switch (cmd.type) {
      case 'claim':
        if (holder && holder !== session.id && !cmd.force) {
          return reply({ type: 'error', id: cmd.id, code: 'not_holder', message: `已被 ${holder} 接管；抢占请带 force` })
        }
        return setHolder(session.id, holder ? 'preempted' : 'claimed')
      case 'release':
        return holder === session.id ? setHolder(null, 'released') : undefined
      case 'moveTo': {
        if (!pathfinderReady) return reply({ type: 'error', id: cmd.id, code: 'not_supported', message: 'pathfinder 未装载' })
        bot.pathfinder.setMovements(new Movements(bot))
        await bot.pathfinder.goto(new goals.GoalNear(cmd.x, cmd.y ?? Math.floor(bot.entity.position.y), cmd.z, cmd.range ?? 1))
        return undefined
      }
      case 'lookAt': {
        const p = bot.entity.position
        const dx = cmd.x - p.x, dy = cmd.y - p.y, dz = cmd.z - p.z
        await bot.look(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)), true)
        return undefined
      }
      case 'action': {
        if (cmd.how === 'attack') { const e = bot.entities[cmd.on]; if (e) await bot.attack(e); return undefined }
        if (cmd.how === 'use') { const e = bot.entities[cmd.on]; if (e) await bot.activateEntity(e); return undefined }
        return reply({ type: 'notice', level: 'info', text: `action ${cmd.how} 由界面层处理` })
      }
      case 'camera':
        return reply({ type: 'notice', level: 'info', text: `camera ${cmd.mode} 属于画面层（modern-viewer 的视角）` })
      case 'set':
        return undefined
      default:
        return reply({ type: 'error', id: cmd.id, code: 'bad_request', message: '未知命令' })
    }
  } catch (err) {
    reply({ type: 'error', id: cmd.id, code: 'internal', message: err?.message ?? String(err) })
  }
}

const http = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0]
  if (url === '/health' || url === '/state') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(url === '/health' ? opus() : snapshot()))
    return
  }
  res.writeHead(404)
  res.end('not found')
})

const wss = new WebSocketServer({ server: http })
wss.on('connection', (ws) => {
  if (sessions.size >= DEFAULT_BUDGET.maxSessions) {
    ws.send(JSON.stringify({ type: 'error', code: 'too_many_sessions', message: '观战连接已满' }))
    ws.close()
    return
  }
  const session = { id: `s${sessions.size + 1}-${Date.now().toString(36)}` }
  sessions.set(ws, session)
  ws.send(JSON.stringify({ type: 'hello', protocol: PROTOCOL_VERSION, snapshot: snapshot() }))
  ws.send(JSON.stringify({ type: 'holder', holder }))
  ws.on('message', (data) => {
    let cmd
    try { cmd = JSON.parse(String(data)) } catch { return }
    if (cmd && typeof cmd.type === 'string') void handle(ws, session, cmd)
  })
  ws.on('close', () => {
    sessions.delete(ws)
    if (holder === session.id) setHolder(null, 'disconnected')
  })
  ws.on('error', () => {})
})

http.listen(PROTOCOL_PORT, '0.0.0.0', () => {
  console.log(`[viewer-service] 协议已挂在 :${PROTOCOL_PORT}/（/health /state + WS）`)
})
