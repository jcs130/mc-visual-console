/**
 * 可视化后台客户端（M0 正式版）—— 原生 TS + 画布 2D，无框架。
 *
 * 能力（对齐千灯纪 modern-viewer 的交互模型）：
 *   2.5D 等距视角 · 悬停识别对象 · 接管后点击地面移动 · 右键或长按出动作菜单 · 滚轮缩放 · 拖拽平移
 *
 * 它只做两件事：把协议画的出来（hello/delta/holder）与把人的意图变成命令（moveTo/action/camera…）。
 * 业务语义（谁能操作、走到哪危险）不在这里，在宿主。
 */

import { ACTION_MENU, LONG_PRESS_MS, resolvePick, SPRITE_HEIGHT, SPRITE_WIDTH, type PickTarget } from './hit.ts'
import {
  blockDiamond, clampZoom, inDiamond, makeProjection, toScreen, toWorldOnPlane, withZoom,
  type Projection,
} from './projection.ts'
import type {
  BlockEntry, ClientCommand, EntityLike, ErrorCode, ServerMessage, StateSnapshot,
} from '../src/protocol.ts'

interface Ui {
  canvas: HTMLCanvasElement
  holder: HTMLElement
  counts: HTMLElement
  zoomLabel: HTMLElement
  banner: HTMLElement
  tooltip: HTMLElement
  menu: HTMLElement
  log: HTMLElement
  claimBtn: HTMLButtonElement
  releaseBtn: HTMLButtonElement
}

const ui = {
  canvas: document.getElementById('scene') as HTMLCanvasElement,
  holder: document.getElementById('holder') as HTMLElement,
  counts: document.getElementById('counts') as HTMLElement,
  zoomLabel: document.getElementById('zoom') as HTMLElement,
  banner: document.getElementById('banner') as HTMLElement,
  tooltip: document.getElementById('tooltip') as HTMLElement,
  menu: document.getElementById('menu') as HTMLElement,
  log: document.getElementById('log') as HTMLElement,
  claimBtn: document.getElementById('claim') as HTMLButtonElement,
  releaseBtn: document.getElementById('release') as HTMLButtonElement,
} satisfies Ui

const ctx = ui.canvas.getContext('2d')!

let proj: Projection = makeProjection({ zoom: 1 })
let blocks: BlockEntry[] = []
let entities: EntityLike[] = []
let holder: string | null = null
let me: string | null = null
let seq = 0
let ws: WebSocket | null = null
let connected = false

let hover: PickTarget | null = null
let menuTarget: PickTarget | null = null
let pressed: { x: number; y: number; at: number; moved: boolean } | null = null
let longPressTimer: number | null = null
let dragging: { x: number; y: number; originX: number; originY: number } | null = null

function logLine(text: string): void {
  const el = ui.log
  el.textContent = `${new Date().toLocaleTimeString()}  ${text}\n${el.textContent ?? ''}`.slice(0, 2000)
}

function send(cmd: ClientCommand): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) { logLine('未连接，命令丢弃：' + cmd.type); return }
  ws.send(JSON.stringify(cmd))
  logLine('→ ' + cmd.type)
}

function refreshBanner(): void {
  const can = holder !== null && holder === mySessionId()
  ui.banner.textContent = holder === null
    ? '观战中（只读）—— 想操作先接管'
    : (can ? '你已接管，可以操作' : `已被 ${holder} 接管（只读）`)
  ui.banner.classList.toggle('mine', can)
}

/** 服务端分配的会话 id 就藏在 holder 里；我们用它判断"当前是不是我" */
let sessionId: string | null = null
function mySessionId(): string | null { return sessionId }

// ---------------------------------------------------------------- 协议入站

function applySnapshot(s: StateSnapshot): void {
  seq = s.seq
  blocks = s.blocks
  entities = s.entities
  holder = s.holder
  me = s.bot.username
  if (sessionId === null && s.holder) sessionId = s.holder
  proj = makeProjection({ ...proj, center: { x: s.bot.position[0], y: s.bot.position[1], z: s.bot.position[2] } })
  refreshBanner()
  render()
}

function applyDelta(m: Extract<ServerMessage, { type: 'delta' }>): void {
  seq = m.seq
  if (m.blocks?.length) {
    const gone = new Set(m.blocks.filter((b) => b.name === 'air').map((b) => b.pos.join(',')))
    if (gone.size) blocks = blocks.filter((b) => !gone.has(b.pos.join(',')))
    for (const b of m.blocks) {
      if (b.name === 'air') continue
      const i = blocks.findIndex((x) => x.pos[0] === b.pos[0] && x.pos[1] === b.pos[1] && x.pos[2] === b.pos[2])
      if (i >= 0) blocks[i] = b
      else blocks.push(b)
    }
  }
  if (m.entities?.length) {
    for (const e of m.entities) {
      const i = entities.findIndex((x) => String(x.id) === String(e.id))
      if (i >= 0) entities[i] = e
      else entities.push(e)
    }
  }
  if (m.bot?.position) proj = makeProjection({ ...proj, center: { x: m.bot.position[0], y: m.bot.position[1], z: m.bot.position[2] } })
  render()
}

function onMessage(ev: MessageEvent): void {
  let m: ServerMessage
  try { m = JSON.parse(String(ev.data)) as ServerMessage } catch { return }
  switch (m.type) {
    case 'hello':
      logLine(`hello protocol=${m.protocol}`)
      applySnapshot(m.snapshot)
      break
    case 'delta':
      applyDelta(m)
      break
    case 'holder':
      holder = m.holder
      if (m.holder) sessionId = m.holder
      refreshBanner()
      logLine(`holder → ${m.holder ?? '无'}`)
      break
    case 'notice':
      logLine(`[${m.level}] ${m.text}`)
      break
    case 'error':
      logLine(`✗ ${m.code}: ${m.message}`)
      if ((m.code as ErrorCode) === 'not_holder') ui.banner.classList.add('shake')
      setTimeout(() => ui.banner.classList.remove('shake'), 400)
      break
  }
}

function connect(): void {
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'
  ws = new WebSocket(url)
  ws.onopen = () => { connected = true; logLine('ws 已连接'); refreshBanner() }
  ws.onmessage = onMessage
  ws.onclose = () => { connected = false; sessionId = null; holder = null; refreshBanner(); logLine('ws 断开，3 秒后重连'); setTimeout(connect, 3000) }
  ws.onerror = () => logLine('ws 错误')
}

// ---------------------------------------------------------------- 渲染

function fitCanvas(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = ui.canvas.clientWidth
  const h = ui.canvas.clientHeight
  if (ui.canvas.width !== Math.round(w * dpr) || ui.canvas.height !== Math.round(h * dpr)) {
    ui.canvas.width = Math.round(w * dpr)
    ui.canvas.height = Math.round(h * dpr)
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  proj = makeProjection({ ...proj, originX: w / 2, originY: h / 2 })
}

const faceTop = '#5c8f4a', faceLeft = '#3f6b33', faceRight = '#2f5226'
const entityColors: Record<string, string> = {
  player: '#e0b060', zombie: '#4a7a4a', item: '#c0c0d0', unknown: '#8888a0',
}

function shade(name: string): [string, string, string] {
  if (name.includes('stone')) return ['#8a8a8a', '#6f6f6f', '#5a5a5a']
  if (name.includes('water')) return ['#3a6ea8', '#2f5a8a', '#264a72']
  if (name.includes('sand')) return ['#d8c680', '#bda96a', '#a08f56']
  if (name.includes('wood') || name.includes('log')) return ['#8a6a44', '#6f5436', '#5a442c']
  if (name.includes('leaves')) return ['#4a7a35', '#3a6328', '#2c4d1f']
  return [faceTop, faceLeft, faceRight]
}

function render(): void {
  fitCanvas()
  const w = ui.canvas.clientWidth
  const h = ui.canvas.clientHeight
  ctx.clearRect(0, 0, w, h)

  // 天空 + 地面渐变（有画面感，也便于区分"没画出来"和"没数据"）
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#101820')
  sky.addColorStop(1, '#1d2a1c')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)

  // 方块：按 (x+z) 从小到大叠，近的压远的
  const sorted = [...blocks].sort((a, b) => (a.pos[0] + a.pos[2]) - (b.pos[0] + b.pos[2]) || a.pos[1] - b.pos[1])
  for (const b of sorted) {
    const [x, y, z] = b.pos
    const d = blockDiamond(proj, x, y, z)
    if (d.cx < -40 || d.cx > w + 40 || d.cy < -40 || d.cy > h + 40) continue
    const top = toScreen(proj, { x, y: y + 1, z })
    const [f0, f1, f2] = shade(b.name)
    const depth = proj.tileDepth
    // 左面
    ctx.fillStyle = f1
    ctx.beginPath()
    ctx.moveTo(top.x - proj.tileWidth / 2, top.y)
    ctx.lineTo(top.x, top.y + proj.tileHeight / 2)
    ctx.lineTo(top.x, top.y + proj.tileHeight / 2 + depth)
    ctx.lineTo(top.x - proj.tileWidth / 2, top.y + depth)
    ctx.closePath()
    ctx.fill()
    // 右面
    ctx.fillStyle = f2
    ctx.beginPath()
    ctx.moveTo(top.x + proj.tileWidth / 2, top.y)
    ctx.lineTo(top.x, top.y + proj.tileHeight / 2)
    ctx.lineTo(top.x, top.y + proj.tileHeight / 2 + depth)
    ctx.lineTo(top.x + proj.tileWidth / 2, top.y + depth)
    ctx.closePath()
    ctx.fill()
    // 顶面
    ctx.fillStyle = f0
    ctx.beginPath()
    ctx.moveTo(top.x, top.y)
    ctx.lineTo(top.x + proj.tileWidth / 2, top.y + proj.tileHeight / 2)
    ctx.lineTo(top.x, top.y + proj.tileHeight)
    ctx.lineTo(top.x - proj.tileWidth / 2, top.y + proj.tileHeight / 2)
    ctx.closePath()
    ctx.fill()
  }

  // 实体：按 (x+z) 叠
  const ents = [...entities].sort((a, b) => (a.position[0] + a.position[2]) - (b.position[0] + b.position[2]))
  for (const e of ents) {
    const feet = toScreen(proj, { x: e.position[0], y: e.position[1], z: e.position[2] })
    const sw = SPRITE_WIDTH * proj.zoom
    const sh = SPRITE_HEIGHT * proj.zoom
    if (feet.x < -60 || feet.x > w + 60 || feet.y < -80 || feet.y > h + 80) continue
    const isSelf = e.username === me
    ctx.fillStyle = entityColors[e.name] ?? entityColors.unknown!
    ctx.beginPath()
    ctx.roundRect(feet.x - sw / 2, feet.y - sh, sw, sh, Math.max(2, 4 * proj.zoom))
    ctx.fill()
    if (isSelf) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke() }
    if (e.username) {
      ctx.font = `${Math.max(9, 11 * proj.zoom)}px ui-sans-serif, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillStyle = isSelf ? '#ffffff' : '#dcdcdc'
      ctx.fillText(e.username, feet.x, feet.y - sh - 3)
    }
  }

  // 悬停高亮
  if (hover) {
    if (hover.kind === 'block' && hover.block) {
      const d = blockDiamond(proj, hover.world.x, hover.world.y, hover.world.z)
      if (inDiamond(hover.screen.x, hover.screen.y, d)) {
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(d.cx, d.cy - d.halfH)
        ctx.lineTo(d.cx + d.halfW, d.cy)
        ctx.lineTo(d.cx, d.cy + d.halfH)
        ctx.lineTo(d.cx - d.halfW, d.cy)
        ctx.closePath()
        ctx.stroke()
      }
    } else if (hover.kind === 'entity') {
      const { x, y } = hover.screen
      const sw = SPRITE_WIDTH * proj.zoom
      const sh = SPRITE_HEIGHT * proj.zoom
      ctx.strokeStyle = 'rgba(255,220,120,0.95)'
      ctx.lineWidth = 2
      ctx.strokeRect(x - sw / 2 - 2, y - sh / 2 - 2, sw + 4, sh + 4)
    }
  }

  ui.counts.textContent = `${entities.length} 实体 · ${blocks.length} 方块 · seq ${seq}`
  ui.zoomLabel.textContent = `${Math.round(proj.zoom * 100)}%`
}

// ---------------------------------------------------------------- 交互

function pointerPos(ev: MouseEvent | Touch): { x: number; y: number } {
  const r = ui.canvas.getBoundingClientRect()
  return { x: ev.clientX - r.left, y: ev.clientY - r.top }
}

function updateHover(pos: { x: number; y: number }): void {
  hover = resolvePick(proj, pos, blocks, entities)
  if (!hover) { ui.tooltip.hidden = true; render(); return }
  const label = hover.kind === 'entity'
    ? `${hover.entity?.username ?? hover.entity?.name}（${hover.entity?.name}）`
    : `${hover.block?.name} @ ${hover.world.x},${hover.world.y},${hover.world.z}`
  ui.tooltip.hidden = false
  ui.tooltip.textContent = label
  ui.tooltip.style.left = Math.min(window.innerWidth - 220, hover.screen.x + 12) + 'px'
  ui.tooltip.style.top = Math.max(8, hover.screen.y - 8) + 'px'
  render()
}

function openMenu(target: PickTarget, pos: { x: number; y: number }): void {
  menuTarget = target
  ui.menu.hidden = false
  ui.menu.innerHTML = ''
  const title = document.createElement('div')
  title.className = 'menu-title'
  title.textContent = target.kind === 'entity'
    ? `${target.entity?.username ?? target.entity?.name}`
    : `${target.block?.name} @ ${target.world.x},${target.world.y},${target.world.z}`
  ui.menu.appendChild(title)
  for (const item of ACTION_MENU) {
    const b = document.createElement('button')
    b.textContent = item.label
    b.onclick = () => {
      if (target.kind === 'entity') send({ type: 'action', on: String(target.entity!.id), how: item.how })
      else logLine(`${item.label}（方块没有动作，只有实体有）`)
      closeMenu()
    }
    ui.menu.appendChild(b)
  }
  ui.menu.style.left = Math.min(window.innerWidth - 180, pos.x + 8) + 'px'
  ui.menu.style.top = Math.min(window.innerHeight - 200, pos.y + 8) + 'px'
}

function closeMenu(): void { menuTarget = null; ui.menu.hidden = true }

function primaryClick(pos: { x: number; y: number }): void {
  const t = resolvePick(proj, pos, blocks, entities)
  if (!t) return
  if (t.kind === 'entity') { openMenu(t, pos); return }
  // 点地面 → 走过去（服务端会校验持有权；没接管会回 not_holder）
  const plane = t.world.y + 1
  const target = toWorldOnPlane(proj, pos, plane)
  send({ type: 'moveTo', x: Math.round(target.x), z: Math.round(target.z) })
}

ui.canvas.addEventListener('mousemove', (ev) => {
  const pos = pointerPos(ev)
  if (dragging) {
    proj = makeProjection({ ...proj, originX: dragging.originX + (pos.x - dragging.x), originY: dragging.originY + (pos.y - dragging.y) })
    render()
    return
  }
  if (pressed) pressed.moved = pressed.moved || Math.hypot(pos.x - pressed.x, pos.y - pressed.y) > 6
  updateHover(pos)
})

ui.canvas.addEventListener('mousedown', (ev) => {
  const pos = pointerPos(ev)
  if (ev.button === 1 || (ev.button === 0 && ev.shiftKey)) {
    dragging = { x: pos.x, y: pos.y, originX: proj.originX, originY: proj.originY }
    return
  }
  if (ev.button === 0) pressed = { x: pos.x, y: pos.y, at: Date.now(), moved: false }
})

ui.canvas.addEventListener('mouseup', (ev) => {
  const pos = pointerPos(ev)
  if (dragging) { dragging = null; return }
  if (ev.button === 0 && pressed) {
    const quick = Date.now() - pressed.at < LONG_PRESS_MS
    if (quick && !pressed.moved) primaryClick(pos)
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
  // 让光标下的世界点尽量不动（缩放像"往那儿推"）
  const after = toWorldOnPlane(next, pos, next.center.y)
  const center = {
    x: next.center.x + (before.x - after.x),
    y: next.center.y,
    z: next.center.z + (before.z - after.z),
  }
  proj = makeProjection({ ...next, originX: proj.originX, originY: proj.originY, center })
  render()
}, { passive: false })

// 触屏：长按 = 右键
ui.canvas.addEventListener('touchstart', (ev) => {
  const t = ev.touches[0]
  if (!t) return
  const pos = pointerPos(t)
  longPressTimer = window.setTimeout(() => {
    const target = resolvePick(proj, pos, blocks, entities)
    if (target) openMenu(target, pos)
    longPressTimer = null
  }, LONG_PRESS_MS)
}, { passive: true })

ui.canvas.addEventListener('touchend', (ev) => {
  if (longPressTimer) { window.clearTimeout(longPressTimer); longPressTimer = null }
  const t = ev.changedTouches[0]
  if (!t) return
  const pos = pointerPos(t)
  const target = resolvePick(proj, pos, blocks, entities)
  if (target && target.kind === 'block') primaryClick(pos)
}, { passive: true })

document.addEventListener('click', (ev) => {
  if (!ui.menu.hidden && !ui.menu.contains(ev.target as Node)) closeMenu()
})

ui.claimBtn.onclick = () => send({ type: 'claim' })
ui.releaseBtn.onclick = () => send({ type: 'release' })
window.addEventListener('resize', render)

// 键盘：C 接管 / R 释放 / Esc 关菜单（方便演示）
window.addEventListener('keydown', (ev) => {
  if (ev.key === 'c' || ev.key === 'C') send({ type: 'claim' })
  else if (ev.key === 'r' || ev.key === 'R') send({ type: 'release' })
  else if (ev.key === 'Escape') closeMenu()
})

connect()
render()
logLine(connected ? '就绪' : '连接中…')
