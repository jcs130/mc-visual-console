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
import { startModernViewer } from '../packages/modern-viewer/src/mc-modern-viewer.mts'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, normalize } from 'node:path'

// 客户端页面与资产：接缝协议第一节写的是「GET / 客户端页面（单页）、GET /assets/* 静态资产」。
// 组件自己的 src/server.ts 会服务它；我们这套宿主侧实现原先只重实现了协议、漏了这一段 ⇒
// 真 bot 只有只读的现代画面、没有可操作页。2026-09-23 补上。
const CLIENT_DIR = normalize(join(dirname(fileURLToPath(import.meta.url)), '..', 'client'))
const CLIENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

/** 只服务 client/ 下的文件，且不许路径上跳。命中返回 true。 */
function serveClientFile(res, relPath) {
  if (relPath.includes('..')) {
    res.writeHead(403, { 'content-type': 'text/plain' })
    res.end('forbidden')
    return true
  }
  // 页面里写的是 /assets/app.js 这类路径，而文件在 client/app.js；
  // client/assets/ 下另有构建期资源，两处都试一下。
  for (const candidate of [relPath, join('assets', relPath)]) {
    const file = normalize(join(CLIENT_DIR, candidate))
    if (!file.startsWith(CLIENT_DIR)) continue
    let body
    try {
      body = readFileSync(file)
    } catch {
      continue
    }
    const dot = file.lastIndexOf('.')
    const type = CLIENT_TYPES[file.slice(dot)] ?? 'application/octet-stream'
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
    res.end(body)
    return true
  }
  return false
}

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

// 自绘画布（控制台第四视角）的「点地走」需要方块：客户端 resolvePick 靠 blocks 找落点，
// 没有方块就只能悬停实体、点不动地面。协议原先 blocks 恒为空（画面交给 prismarine-viewer 出），
// 于是「接管之后点地无反应」（2026-09-23 用户反馈定位）。这里补一份可视范围内的地面块：
// 每个菱形柱取从脚上 2 格往下最先遇到的非空气块（＝看到的是顶面）。
const Vec3 = (() => {
  try {
    return require('vec3')
  } catch {
    return null
  }
})()
const SURFACE_ABOVE = 2
const SURFACE_BELOW = 6
let surfaceCache = { key: '', blocks: [] }
let lastSentSurfaceKey = ''

function surfaceBlocks() {
  const c = bot.entity?.position
  if (!c || !Vec3) return []
  const cx = Math.floor(c.x), cy = Math.floor(c.y), cz = Math.floor(c.z)
  const key = `${cx},${cy},${cz},${VIEW_DISTANCE}`
  if (key === surfaceCache.key) return surfaceCache.blocks
  const out = []
  for (let dx = -VIEW_DISTANCE; dx <= VIEW_DISTANCE; dx++) {
    for (let dz = -VIEW_DISTANCE; dz <= VIEW_DISTANCE; dz++) {
      if (Math.abs(dx) + Math.abs(dz) > VIEW_DISTANCE) continue
      for (let dy = SURFACE_ABOVE; dy >= -SURFACE_BELOW; dy--) {
        const b = bot.blockAt(new Vec3(cx + dx, cy + dy, cz + dz))
        if (!b || b.name === 'air' || b.boundingBox === 'empty') continue
        out.push({ pos: [cx + dx, cy + dy, cz + dz], name: b.name })
        break
      }
    }
  }
  surfaceCache = { key, blocks: out }
  return out
}

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
    // 自绘画布的「点地走」要靠方块落点（见 surfaceBlocks 注释）。
    blocks: surfaceBlocks(),
    budget: DEFAULT_BUDGET,
  }
}

function broadcast(msg) {
  const text = JSON.stringify(msg)
  // sessions 是 Map<ws, session>：必须遍历 keys，否则遍历出来的是 [ws, session] 条目，
  // 条目的 readyState/OPEN 都是 undefined（判断恒真），撞上 .send 抛 TypeError，
  // 未捕获直接结束进程（2026-09-23 实测定案：任何一条 :7801 连接接上就炸）。
  for (const ws of sessions.keys()) {
    try {
      if (ws.readyState === 1) ws.send(text)
    } catch {
      sessions.delete(ws) // 单个连接坏掉只摘掉它，不牵连整条服务
    }
  }
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
  const msg = { type: 'delta', seq, bot: snapshot().bot }
  // 脚下的地面块变了（走动了）才带一份；没变不重复发，省带宽。
  const surface = surfaceBlocks()
  if (surfaceCache.key !== lastSentSurfaceKey) {
    lastSentSurfaceKey = surfaceCache.key
    msg.blocks = surface
  }
  broadcast(msg)
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

  // ① 客户端页面与资产（可操作的控制台页）—— 这是「真 bot 上能玩」的入口。
  if (url === '/' || url === '/index.html') {
    if (serveClientFile(res, 'index.html')) return
  }
  if (url.startsWith('/assets/')) {
    if (serveClientFile(res, url.slice('/assets/'.length))) return
  }

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

// 协议口默认只绑回环：它允许 claim 后直接驱动玩家，对外发布等于把控制权交出去。
// 要暴露请显式设 PROTOCOL_HOST（2026-09-23 审查指出端口暴露问题）。
http.listen(PROTOCOL_PORT, process.env.PROTOCOL_HOST ?? '127.0.0.1', () => {
  console.log(`[viewer-service] 协议已挂在 :${PROTOCOL_PORT}/（/health /state + WS）`)
})
