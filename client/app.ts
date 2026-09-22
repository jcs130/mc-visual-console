/**
 * 控制器 —— 协议、输入、相机。
 *
 * 分工：render.ts 负责"画得好不好看"，这里负责"数据从哪来、意图往哪去"。
 * 状态每 100ms 一帧（服务端节拍），但画面按 requestAnimationFrame 跑，实体位置做插值，
 * 所以看起来是连续的，不是一格一格跳。
 */

import { ACTION_MENU, LONG_PRESS_MS, resolvePick, type PickTarget } from './hit.ts'
import { clampZoom, makeProjection, toWorldOnPlane, withZoom, type Projection } from './projection.ts'
import { loadTextures, renderScene, type TextureStore } from './render.ts'
import type {
  BlockEntry, ClientCommand, EntityLike, ErrorCode, ServerMessage, StateSnapshot,
} from '../src/protocol.ts'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
const ui = {
  canvas: $<HTMLCanvasElement>('scene'),
  holder: $('holder'), counts: $('counts'), zoomLabel: $('zoom'),
  banner: $('banner'), tooltip: $('tooltip'), menu: $('menu'), log: $('log'),
  people: $('people'),
  claimBtn: $<HTMLButtonElement>('claim'), releaseBtn: $<HTMLButtonElement>('release'),
}
const ctx = ui.canvas.getContext('2d')!

let store: TextureStore | null = null
let proj: Projection = makeProjection({ zoom: 1 })
let blocks: BlockEntry[] = []
let entities: EntityLike[] = []
let holder: string | null = null
let me: string | null = null
let sessionId: string | null = null
let seq = 0

/** 实体插值：服务端给目标位置，画面自己推进到那儿 */
const drawn = new Map<string, [number, number, number]>()
const targets = new Map<string, [number, number, number]>()

let hover: PickTarget | null = null
let hoverKey: string | null = null
let pressed: { x: number; y: number; at: number; moved: boolean } | null = null
let longPress: number | null = null
let dragging: { x: number; y: number; ox: number; oy: number } | null = null
let ws: WebSocket | null = null

function logLine(text: string): void {
  ui.log.textContent = `${new Date().toLocaleTimeString()}  ${text}\n${ui.log.textContent ?? ''}`.slice(0, 2400) ?? ''
}

function send(cmd: ClientCommand): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) { logLine('未连接，丢弃：' + cmd.type); return }
  ws.send(JSON.stringify(cmd))
  logLine('→ ' + cmd.type)
}

function refreshBanner(): void {
  const mine = holder !== null && holder === sessionId
  ui.banner.textContent = holder === null
    ? '观战中（只读）· 想操作先接管'
    : (mine ? '你已接管，可以操作' : `已被 ${holder} 接管（只读）`)
  ui.banner.classList.toggle('mine', mine)
  ui.holder.textContent = holder ? `持有：${holder}` : '持有：无'
}

function renderPeople(): void {
  const rows = [...entities]
    .sort((a, b) => (a.username ? 0 : 1) - (b.username ? 0 : 1) || String(a.id).localeCompare(String(b.id)))
    .slice(0, 12)
    .map((e) => {
      const isSelf = e.username != null && e.username === me
      const label = e.username ?? e.name
      const [x, y, z] = e.position
      return `<li${isSelf ? ' class="me"' : ''}><b>${label}</b><span>${Math.round(x)}, ${Math.round(y)}, ${Math.round(z)}</span></li>`
    })
  ui.people.innerHTML = rows.join('') || '<li class="empty">附近暂时没有人</li>'
}

// ------------------------------------------------------------------ 协议入站

function applySnapshot(s: StateSnapshot): void {
  seq = s.seq
  blocks = s.blocks
  entities = s.entities
  holder = s.holder
  me = s.bot.username
  if (s.holder) sessionId = s.holder
  targets.clear()
  drawn.clear()
  for (const e of entities) {
    targets.set(String(e.id), e.position)
    drawn.set(String(e.id), e.position)
  }
  proj = makeProjection({ ...proj, center: { x: s.bot.position[0], y: s.bot.position[1], z: s.bot.position[2] } })
  refreshBanner(); renderPeople()
}

function applyDelta(m: Extract<ServerMessage, { type: 'delta' }>): void {
  seq = m.seq
  for (const b of m.blocks ?? []) {
    const [x, y, z] = b.pos
    const i = blocks.findIndex((k) => k.pos[0] === x && k.pos[1] === y && k.pos[2] === z)
    if (b.name === 'air') { if (i >= 0) blocks.splice(i, 1); continue }
    if (i >= 0) blocks[i] = b; else blocks.push(b)
  }
  for (const e of m.entities ?? []) {
    const i = entities.findIndex((k) => String(k.id) === String(e.id))
    if (i >= 0) entities[i] = e; else entities.push(e)
    targets.set(String(e.id), e.position)
    if (!drawn.has(String(e.id))) drawn.set(String(e.id), e.position)
  }
  renderPeople()
}

function onMessage(ev: MessageEvent): void {
  let m: ServerMessage
  try { m = JSON.parse(String(ev.data)) as ServerMessage } catch { return }
  switch (m.type) {
    case 'hello': logLine(`hello protocol=${m.protocol}`); applySnapshot(m.snapshot); break
    case 'delta': applyDelta(m); break
    case 'holder':
      holder = m.holder
      if (m.holder) sessionId = m.holder
      refreshBanner(); logLine(`持有 → ${m.holder ?? '无'}`); break
    case 'notice': logLine(`[${m.level}] ${m.text}`); break
    case 'error':
      logLine(`✗ ${m.code}: ${m.message}`)
      if ((m.code as ErrorCode) === 'not_holder') {
        ui.banner.classList.add('shake')
        setTimeout(() => ui.banner.classList.remove('shake'), 400)
      }
      break
  }
}

function connect(): void {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws')
  ws.onopen = () => { logLine('ws 已连接'); refreshBanner() }
  ws.onmessage = onMessage
  ws.onclose = () => { sessionId = null; holder = null; refreshBanner(); logLine('ws 断开，3 秒后重连'); setTimeout(connect, 3000) }
  ws.onerror = () => logLine('ws 错误')
}

// ------------------------------------------------------------------ 相机与主循环

function fitCanvas(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = ui.canvas.clientWidth, h = ui.canvas.clientHeight
  ui.canvas.width = Math.round(w * dpr)
  ui.canvas.height = Math.round(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  proj = makeProjection({ ...proj, originX: w / 2, originY: h / 2 })
}

let following = true

function frame(): void {
  fitCanvas()

  // 相机平滑跟随 bot（点地移动时画面会跟过去，而不是瞬移）
  const self = entities.find((e) => e.username === me)
  const target = self ? drawn.get(String(self.id)) ?? self.position : null
  if (following && target) {
    const k = 0.12
    proj = makeProjection({
      ...proj,
      center: {
        x: proj.center.x + (target[0] - proj.center.x) * k,
        y: proj.center.y + (target[1] - proj.center.y) * k,
        z: proj.center.z + (target[2] - proj.center.z) * k,
      },
    })
  }

  // 实体插值（同样用 lerp；服务端 100ms 一帧也不影响顺滑）
  for (const [id, t] of targets) {
    const d = drawn.get(id) ?? t
    drawn.set(id, [d[0] + (t[0] - d[0]) * 0.25, d[1] + (t[1] - d[1]) * 0.25, d[2] + (t[2] - d[2]) * 0.25])
  }

  renderScene(ctx, store, {
    projection: proj, blocks, entities, entityPositions: drawn, hoverKey, selfName: me,
  })

  ui.counts.textContent = `${entities.length} 实体 · ${blocks.length} 方块 · seq ${seq}`
  ui.zoomLabel.textContent = `${Math.round(proj.zoom * 100)}%`
  requestAnimationFrame(frame)
}

// ------------------------------------------------------------------ 交互

function pointerPos(ev: MouseEvent | Touch): { x: number; y: number } {
  const r = ui.canvas.getBoundingClientRect()
  return { x: ev.clientX - r.left, y: ev.clientY - r.top }
}

function updateHover(pos: { x: number; y: number }): void {
  hover = resolvePick(proj, pos, blocks, entities)
  hoverKey = hover
    ? (hover.kind === 'block'
      ? `${hover.world.x},${hover.world.y},${hover.world.z}`
      : `e:${hover.entity!.id}`)
    : null
  if (!hover) { ui.tooltip.hidden = true; return }
  ui.tooltip.hidden = false
  ui.tooltip.textContent = hover.kind === 'entity'
    ? `${hover.entity?.username ?? hover.entity?.name} · ${hover.entity?.name}`
    : `${hover.block?.name} @ ${hover.world.x},${hover.world.y},${hover.world.z}`
  ui.tooltip.style.left = Math.min(window.innerWidth - 230, hover.screen.x + 12) + 'px'
  ui.tooltip.style.top = Math.max(48, hover.screen.y - 10) + 'px'
}

function openMenu(t: PickTarget, pos: { x: number; y: number }): void {
  ui.menu.hidden = false
  ui.menu.innerHTML = ''
  const title = document.createElement('div')
  title.className = 'menu-title'
  title.textContent = t.kind === 'entity'
    ? `${t.entity?.username ?? t.entity?.name}`
    : `${t.block?.name} @ ${t.world.x},${t.world.y},${t.world.z}`
  ui.menu.appendChild(title)
  for (const item of ACTION_MENU) {
    const b = document.createElement('button')
    b.textContent = item.label
    b.onclick = () => {
      if (t.kind === 'entity') send({ type: 'action', on: String(t.entity!.id), how: item.how })
      else logLine(`${item.label}：方块没有动作，动作只对实体有意义`)
      closeMenu()
    }
    ui.menu.appendChild(b)
  }
  ui.menu.style.left = Math.min(window.innerWidth - 180, pos.x + 8) + 'px'
  ui.menu.style.top = Math.min(window.innerHeight - 210, pos.y + 8) + 'px'
}

function closeMenu(): void { ui.menu.hidden = true }

function primaryClick(pos: { x: number; y: number }): void {
  const t = resolvePick(proj, pos, blocks, entities)
  if (!t) return
  if (t.kind === 'entity') { openMenu(t, pos); return }
  const landed = toWorldOnPlane(proj, pos, t.world.y + 1)
  send({ type: 'moveTo', x: Math.round(landed.x), z: Math.round(landed.z) })
}

ui.canvas.addEventListener('mousemove', (ev) => {
  const pos = pointerPos(ev)
  if (dragging) {
    following = false
    proj = makeProjection({ ...proj, originX: dragging.ox + (pos.x - dragging.x), originY: dragging.oy + (pos.y - dragging.y) })
    return
  }
  if (pressed) pressed.moved = pressed.moved || Math.hypot(pos.x - pressed.x, pos.y - pressed.y) > 6
  updateHover(pos)
})

ui.canvas.addEventListener('mousedown', (ev) => {
  const pos = pointerPos(ev)
  if (ev.button === 1 || (ev.button === 0 && ev.shiftKey)) {
    dragging = { x: pos.x, y: pos.y, ox: proj.originX, oy: proj.originY }
    return
  }
  if (ev.button === 0) pressed = { x: pos.x, y: pos.y, at: Date.now(), moved: false }
})

ui.canvas.addEventListener('mouseup', (ev) => {
  const pos = pointerPos(ev)
  if (dragging) { dragging = null; return }
  if (ev.button === 0 && pressed) {
    if (Date.now() - pressed.at < LONG_PRESS_MS && !pressed.moved) primaryClick(pos)
    pressed = null
  }
})

ui.canvas.addEventListener('contextmenu', (ev) => {
  ev.preventDefault()
  const pos = pointerPos(ev)
  const t = resolvePick(proj, pos, blocks, entities)
  if (t) openMenu(t, pos)
})

ui.canvas.addEventListener('wheel', (ev) => {
  ev.preventDefault()
  const pos = pointerPos(ev)
  const before = toWorldOnPlane(proj, pos, proj.center.y)
  const next = withZoom(proj, clampZoom(proj.zoom * (ev.deltaY < 0 ? 1.12 : 1 / 1.12)))
  const after = toWorldOnPlane(next, pos, next.center.y)
  proj = makeProjection({
    ...next, originX: proj.originX, originY: proj.originY,
    center: { x: next.center.x + (before.x - after.x), y: next.center.y, z: next.center.z + (before.z - after.z) },
  })
}, { passive: false })

ui.canvas.addEventListener('touchstart', (ev) => {
  const t = ev.touches[0]
  if (!t) return
  const pos = pointerPos(t)
  longPress = window.setTimeout(() => {
    const target = resolvePick(proj, pos, blocks, entities)
    if (target) openMenu(target, pos)
    longPress = null
  }, LONG_PRESS_MS)
}, { passive: true })

ui.canvas.addEventListener('touchend', (ev) => {
  if (longPress) { window.clearTimeout(longPress); longPress = null }
  const t = ev.changedTouches[0]
  if (!t) return
  const pos = pointerPos(t)
  const target = resolvePick(proj, pos, blocks, entities)
  if (target && target.kind === 'block') primaryClick(pos)
}, { passive: true })

document.addEventListener('click', (ev) => {
  if (!ui.menu.hidden && !ui.menu.contains(ev.target as Node)) closeMenu()
})

ui.claimBtn.onclick = () => { following = true; send({ type: 'claim' }) }
ui.releaseBtn.onclick = () => send({ type: 'release' })
$('recenter').onclick = () => { following = true; logLine('相机回到 bot') }
window.addEventListener('resize', fitCanvas)
window.addEventListener('keydown', (ev) => {
  if (ev.key === 'c' || ev.key === 'C') send({ type: 'claim' })
  else if (ev.key === 'r' || ev.key === 'R') send({ type: 'release' })
  else if (ev.key === 'f' || ev.key === 'F') { following = true; logLine('相机回到 bot') }
  else if (ev.key === 'Escape') closeMenu()
})

// ------------------------------------------------------------------ 启动

void (async () => {
  try {
    store = await loadTextures()
    logLine(`贴图就绪：${Object.keys(store.styles).length} 种方块`)
  } catch (err) {
    logLine('贴图加载失败，退回纯色：' + (err instanceof Error ? err.message : String(err)))
  }
  connect()
  requestAnimationFrame(frame)
})()
