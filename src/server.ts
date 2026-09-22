/**
 * HTTP + WS 服务端 —— 宿主唯一需要挂载的东西。
 *
 * 职责边界（照 docs/PROTOCOL.md §四）：
 *   组件负责：快照与增量、接管持有者记录、命令校验与转发、预算与节流、判活接口。
 *   组件不负责：谁能接管（宿主决定）、走到哪里危险（宿主决定）、渲染（客户端负责）。
 */

import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, type WebSocket } from 'ws'

import { toEntityLike, toTuple, type ViewerBot } from './adapter.ts'
import {
  DEFAULT_BUDGET, HOLDER_ONLY, PROTOCOL_VERSION,
  type BlockEntry, type BotState, type Budget, type ClientCommand, type EntityLike,
  type ErrorCode, type ServerMessage, type StateSnapshot,
} from './protocol.ts'

/** 客户端目录：与仓库根同级（src/ 的上一级） */
const CLIENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'client')
const CLIENT_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
}

export interface ViewerOptions {
  /** 监听地址；缺省 127.0.0.1（宿主想对外再自己包一层） */
  host?: string
  /** 监听端口；0 = 让系统挑一个（测试用） */
  port?: number
  /** 视野半径（方块）；默认 6，对齐千灯纪 modern-viewer */
  viewDistance?: number
  /** 预算覆盖 */
  budget?: Partial<Budget>
  /** 接管超时（毫秒）；0 = 不超时。默认 10 分钟，防"点了接管然后人跑了" */
  holderTimeoutMs?: number
  /** 客户端页面；缺省用内置的最小页面（M0 的正式客户端后续替换） */
  page?: string
  /** 结构化的日志出口，默认 no-op */
  log?: (line: { level: 'info' | 'warn'; text: string }) => void
}

export interface Viewer {
  readonly http: HttpServer
  /** 交给宿主挂载：把路由接到自己的 server 上（Cortico/dsh 都走这条路） */
  readonly handler: (req: IncomingMessage, res: ServerResponse) => boolean
  readonly url: () => string
  readonly snapshot: () => StateSnapshot
  readonly holder: () => string | null
  readonly viewers: () => number
  /** 推一条给人看的提示 */
  readonly notice: (text: string, level?: 'info' | 'warn') => void
  readonly close: () => Promise<void>
  /** 立刻重算并广播一帧（宿主改了预算/视距后调用） */
  readonly flush: () => void
}

interface Session {
  socket: WebSocket
  id: string
}

const MINIMAL_PAGE = `<!doctype html><meta charset="utf-8">
<title>mc-viewer</title>
<style>body{font:14px/1.6 ui-monospace,monospace;margin:0;background:#111;color:#ddd}
header{padding:8px 12px;background:#1b1b1b;border-bottom:1px solid #333}
main{display:grid;grid-template-columns:1fr 1fr;gap:0;height:calc(100vh - 40px)}
section{padding:12px;overflow:auto;border-right:1px solid #333}
button{margin:2px;padding:4px 8px;background:#2a2a2a;color:#ddd;border:1px solid #444;border-radius:4px;cursor:pointer}
button:hover{background:#333}pre{white-space:pre-wrap}</style>
<header>mc-viewer M0 最小页面 · <span id="holder">holder: -</span> · <span id="count">0 entity</span></header>
<main>
  <section>
    <h3>接管</h3>
    <button id="claim">claim(接管)</button><button id="release">release(释放)</button>
    <h3>点地移动</h3>
    <button id="m1">走到 (10, -20)</button><button id="m2">走到 (-30, 40)</button>
    <h3>动作</h3>
    <button id="look">扭头看 (0,64,0)</button>
  </section>
  <section><h3>状态</h3><pre id="log"></pre></section>
</main>
<script>
const log = (m) => { const el = document.getElementById('log'); el.textContent = new Date().toLocaleTimeString() + '  ' + m + '\\n' + el.textContent }
const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws')
const send = (o) => { ws.send(JSON.stringify({ as: 'operator', ...o })) }
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.type === 'hello') { document.getElementById('holder').textContent = 'holder: ' + (m.snapshot.holder ?? '-'); document.getElementById('count').textContent = m.snapshot.entities.length + ' entity'; log('hello protocol=' + m.protocol) }
  else if (m.type === 'delta') { if (m.entities) { document.getElementById('count').textContent = m.entities.length + ' entity'; } }
  else if (m.type === 'holder') { document.getElementById('holder').textContent = 'holder: ' + (m.holder ?? '-'); log('holder -> ' + m.holder) }
  else { log(m.type + ' ' + JSON.stringify(m)) }
}
ws.onopen = () => log('ws open')
document.getElementById('claim').onclick = () => send({ type: 'claim' })
document.getElementById('release').onclick = () => send({ type: 'release' })
document.getElementById('m1').onclick = () => send({ type: 'moveTo', x: 10, z: -20 })
document.getElementById('m2').onclick = () => send({ type: 'moveTo', x: -30, z: 40 })
document.getElementById('look').onclick = () => send({ type: 'lookAt', x: 0, y: 64, z: 0 })
</script>`

export function attach(bot: ViewerBot, options: ViewerOptions = {}): Viewer {
  const budget: Budget = { ...DEFAULT_BUDGET, ...options.budget }
  const viewDistance = options.viewDistance ?? 6
  const holderTimeoutMs = options.holderTimeoutMs ?? 10 * 60 * 1000
  const log = options.log ?? (() => {})
  const page = options.page ?? readFileSync(path.join(CLIENT_DIR, 'index.html'), 'utf8')

  const sessions = new Map<WebSocket, Session>()
  let seq = 0
  let holder: string | null = null
  let holderTimer: NodeJS.Timeout | null = null
  let dirty = true
  let flushTimer: NodeJS.Timeout | null = null
  /** 最近一帧的实体/方块，用于算增量 */
  let lastEntities = new Map<string, string>()
  let lastBlocks = new Map<string, string>()

  const selfId = (): string | undefined => {
    const self = Object.values(bot.entities ?? {}).find(
      (e) => (e as { username?: string })?.username === bot.username,
    ) as { id?: string | number } | undefined
    return self?.id === undefined ? undefined : String(self.id)
  }

  function collectEntities(): EntityLike[] {
    const out: EntityLike[] = []
    const sid = selfId()
    for (const raw of Object.values(bot.entities ?? {})) {
      const e = toEntityLike(raw, sid)
      if (e) out.push(e)
      if (out.length >= budget.maxEntities) break
    }
    return out
  }

  function collectBlocks(): BlockEntry[] {
    // M0：只取脚下附近一圈，作为"能看到东西"的最小证据。
    // 正式实现按区块增量取（见 docs/PROTOCOL.md §三 的 budget.maxBlocksPerChunk）。
    const out: BlockEntry[] = []
    const { x, y, z } = bot.entity.position
    const r = Math.min(viewDistance, 12)
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dy = -2; dy <= 1; dy++) {
          const pos = { x: Math.round(x) + dx, y: Math.round(y) + dy, z: Math.round(z) + dz }
          const b = bot.world.getBlock(pos)
          if (b) out.push({ pos: toTuple(pos), name: b.name })
          if (out.length >= budget.maxBlocksPerChunk) return out
        }
      }
    }
    return out
  }

  function botState(): BotState {
    const p = bot.entity
    return {
      username: bot.username,
      position: toTuple(p.position),
      yaw: p.yaw,
      pitch: p.pitch,
      health: p.health,
      food: p.food,
    }
  }

  function snapshot(): StateSnapshot {
    const entities = collectEntities()
    const blocks = collectBlocks()
    return {
      seq,
      bot: botState(),
      holder,
      viewDistance,
      entities,
      blocks,
      budget,
    }
  }

  function send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
  }

  function broadcast(msg: ServerMessage): void {
    for (const { socket } of sessions.values()) send(socket, msg)
  }

  function notice(text: string, level: 'info' | 'warn' = 'info'): void {
    log({ level, text })
    broadcast({ type: 'notice', level, text })
  }

  function setHolder(next: string | null, reason?: string): void {
    holder = next
    if (holderTimer) { clearTimeout(holderTimer); holderTimer = null }
    if (next && holderTimeoutMs > 0) {
      holderTimer = setTimeout(() => {
        notice(`接管超时，自动释放（${next}）`, 'warn')
        setHolder(null, 'timeout')
      }, holderTimeoutMs)
    }
    broadcast({ type: 'holder', holder, reason })
    dirty = true
  }

  /** 约 100ms 合并一帧，不逐事件抖 */
  function markDirty(): void {
    dirty = true
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      flush()
    }, Math.max(1, Math.round(1000 / budget.stateHz)))
  }

  function flush(): void {
    if (!dirty) return
    dirty = false
    seq += 1
    const entities = collectEntities()
    const blocks = collectBlocks()

    // 增量：只带变化项（成本很低，且实测能显著减少流量）
    const nextE = new Map<string, string>()
    const changedE: EntityLike[] = []
    for (const e of entities) {
      const k = JSON.stringify([e.name, e.position, e.yaw, e.pitch, e.health])
      nextE.set(String(e.id), k)
      if (lastEntities.get(String(e.id)) !== k) changedE.push(e)
    }
    const nextB = new Map<string, string>()
    const changedB: BlockEntry[] = []
    for (const b of blocks) {
      const k = b.name
      const id = b.pos.join(',')
      nextB.set(id, k)
      if (lastBlocks.get(id) !== k) changedB.push(b)
    }
    lastEntities = nextE
    lastBlocks = nextB

    broadcast({ type: 'delta', seq, bot: botState(), entities: changedE, blocks: changedB })
  }

  const noSupport = (ws: WebSocket, cmd: ClientCommand, feature: string): void => {
    send(ws, {
      type: 'error', id: cmd.id, code: 'not_supported',
      message: `上游没有提供 ${feature}()` ,
    })
  }

  async function handle(session: Session, cmd: ClientCommand): Promise<void> {
    const ws = session.socket
    if (HOLDER_ONLY.has(cmd.type) && holder !== session.id) {
      send(ws, { type: 'error', id: cmd.id, code: 'not_holder', message: '当前不是你接管' })
      return
    }
    try {
      switch (cmd.type) {
        case 'claim': {
          if (holder && holder !== session.id && !cmd.force) {
            send(ws, { type: 'error', id: cmd.id, code: 'not_holder', message: `已被 ${holder} 接管；要抢占请带 force` })
            return
          }
          setHolder(session.id, holder ? 'preempted' : 'claimed')
          return
        }
        case 'release': {
          if (holder === session.id) setHolder(null, 'released')
          return
        }
        case 'moveTo': {
          if (!bot.goto) return noSupport(ws, cmd, 'goto')
          const y = cmd.y ?? (bot.world.getBlock({ x: Math.floor(cmd.x), y: Math.floor(bot.entity.position.y), z: Math.floor(cmd.z) }) ? Math.floor(bot.entity.position.y) : Math.floor(bot.entity.position.y))
          await bot.goto(cmd.x, y, cmd.z, { range: cmd.range ?? 1 })
          return
        }
        case 'lookAt': {
          if (!bot.look) return noSupport(ws, cmd, 'look')
          const dx = cmd.x - bot.entity.position.x
          const dy = cmd.y - bot.entity.position.y
          const dz = cmd.z - bot.entity.position.z
          const yaw = Math.atan2(-dx, -dz)
          const pitch = Math.atan2(dy, Math.hypot(dx, dz))
          await bot.look(yaw, pitch)
          return
        }
        case 'action': {
          if (cmd.how === 'attack') {
            if (!bot.attack) return noSupport(ws, cmd, 'attack')
            await bot.attack(cmd.on)
            return
          }
          if (cmd.how === 'use') {
            if (!bot.activateEntity) return noSupport(ws, cmd, 'activateEntity')
            await bot.activateEntity(cmd.on)
            return
          }
          // detail / approach 是"给人看的"，由宿主的界面层处理；组件只回执
          send(ws, { type: 'notice', level: 'info', text: `action ${cmd.how} 由宿主界面处理（组件不干预）` })
          return
        }
        case 'camera': {
          send(ws, { type: 'notice', level: 'info', text: `camera ${cmd.mode} 是客户端职责（组件只转发）` })
          return
        }
        case 'set': {
          if (cmd.viewDistance !== undefined) { /* 视距是宿主的策略，这里只记不擅自改 */ }
          if (cmd.stateHz !== undefined) budget.stateHz = Math.max(1, Math.min(60, cmd.stateHz))
          markDirty()
          return
        }
      }
    } catch (err) {
      send(ws, {
        type: 'error', id: (cmd as { id?: string }).id, code: 'internal',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const wss = new WebSocketServer({ noServer: true })

  wss.on('connection', (socket) => {
    if (sessions.size >= budget.maxSessions) {
      send(socket, { type: 'error', code: 'too_many_sessions', message: `观战连接已满（${budget.maxSessions}）` })
      socket.close()
      return
    }
    const session: Session = { socket, id: `s${sessions.size + 1}-${Date.now().toString(36)}` }
    sessions.set(socket, session)
    send(socket, { type: 'hello', protocol: PROTOCOL_VERSION, snapshot: snapshot() })
    send(socket, { type: 'holder', holder })

    socket.on('message', (data) => {
      let parsed: unknown
      try { parsed = JSON.parse(String(data)) } catch { 
        send(socket, { type: 'error', code: 'bad_request', message: '不是合法 JSON' }); return 
      }
      const cmd = parsed as ClientCommand
      if (!cmd || typeof cmd.type !== 'string') {
        send(socket, { type: 'error', code: 'bad_request', message: '命令缺少 type' }); return
      }
      void handle(session, cmd)
    })
    socket.on('close', () => {
      sessions.delete(socket)
      if (holder === session.id) setHolder(null, 'disconnected')
    })
    socket.on('error', (err) => log({ level: 'warn', text: `ws error: ${err.message}` }))
    markDirty()
  })

  function upgrade(req: IncomingMessage, socket: import('node:stream').Duplex, head: Buffer): boolean {
    const url = req.url ?? '/'
    if (!url.startsWith('/ws')) return false
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
    return true
  }

  function handler(req: IncomingMessage, res: ServerResponse): boolean {
    const url = (req.url ?? '/').split('?')[0]!
    if (url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, bot: bot.username, viewers: sessions.size, holder }))
      return true
    }
    if (url === '/state') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(snapshot()))
      return true
    }
    if (url === '/command' && req.method === 'POST') {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        let cmd: ClientCommand
        try { cmd = JSON.parse(body) } catch {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ code: 'bad_request', message: '不是合法 JSON' }))
          return
        }
        // HTTP 通道没有会话语义，占位一个伪 session 以便复用同一套校验
        const fake: Session = { socket: { readyState: 1, send: (s: string) => res.write(s) } as unknown as WebSocket, id: 'http' }
        void handle(fake, cmd).finally(() => res.end())
      })
      return true
    }
    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(page)
      return true
    }
    // 静态资产：/assets/* → client/ 目录（app.js 由 esbuild 打包产出）
    if (url.startsWith('/assets/')) {
      const rel = url.slice('/assets/'.length)
      if (rel.includes('..')) { res.writeHead(400); res.end('bad path'); return true }
      let file = path.join(CLIENT_DIR, rel); if (!existsSync(file)) file = path.join(CLIENT_DIR, 'assets', rel)
      if (!existsSync(file)) { res.writeHead(404); res.end('not found'); return true }
      res.writeHead(200, { 'content-type': CLIENT_MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' })
      res.end(readFileSync(file))
      return true
    }
    return false
  }

  const http = createServer((req, res) => {
    if (!handler(req, res)) { res.writeHead(404); res.end('not found') }
  })
  http.on('upgrade', (req, socket, head) => {
    if (!upgrade(req, socket as unknown as import('node:stream').Duplex, head as Buffer)) {
      socket.destroy()
    }
  })

  // 挂事件：状态一变就标脏，由 flushTimer 合并成约 100ms 一帧
  const watched = ['move', 'physicsTick', 'entityMoved', 'entitySpawned', 'entityGone', 'blockUpdate', 'playerJoined', 'playerLeft', 'health', 'death']
  for (const ev of watched) {
    try { bot.on(ev, () => markDirty()) } catch { /* 上游没有这个事件就跳过 */ }
  }

  const listenHost = options.host ?? '127.0.0.1'
  const listenPort = options.port ?? 0
  let actualPort = listenPort
  http.listen(listenPort, listenHost, () => {
    const addr = http.address()
    if (addr && typeof addr === 'object') actualPort = addr.port
    log({ level: 'info', text: `mc-viewer listening on http://${listenHost}:${actualPort}/` })
  })

  return {
    http,
    handler,
    url: () => `http://${listenHost}:${actualPort}/`,
    snapshot,
    holder: () => holder,
    viewers: () => sessions.size,
    notice,
    flush,
    close: async () => {
      for (const { socket } of sessions.values()) socket.close()
      sessions.clear()
      if (flushTimer) clearTimeout(flushTimer)
      if (holderTimer) clearTimeout(holderTimer)
      wss.close()
      await new Promise<void>((resolve) => http.close(() => resolve()))
    },
  }
}
