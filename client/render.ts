/**
 * 渲染层 —— 把"现代化"落在这里。
 *
 * 三件事让它从"调试色块"变成"看得下去的画"：
 *   1. **真贴图**：从游戏 JAR 抽出来的 16×16 贴图，用仿射变换贴到等距菱形与侧面上（不是纯色 ✗）；
 *   2. **方向光**：顶面最亮、左面其次、右面最暗，再叠一层角部阴影（AO 的廉价钱）；
 *   3. **实体人形 + 名牌 + 落地影**：一眼看得清"谁站在哪"。
 *
 * 渲染只读状态、不产生命令；命令在 app.ts。
 */

import type { BlockEntry, EntityLike } from '../src/protocol.ts'
import { blockDiamond, toScreen, type Projection } from './projection.ts'
import { SPRITE_HEIGHT, SPRITE_WIDTH } from './hit.ts'

export interface BlockStyle {
  faces: Record<string, string>
  tint_top?: string
  tint_all?: string
  transparent?: boolean
  flat?: boolean
}

export interface TextureStore {
  styles: Record<string, BlockStyle>
  images: Map<string, HTMLImageElement>
  tinted: Map<string, HTMLCanvasElement>
}

const TEX = 16 // 原版贴图边长

export async function loadTextures(base = '/assets'): Promise<TextureStore> {
  const styles = await (await fetch(`${base}/blocks.json`)).json() as Record<string, BlockStyle>
  const images = new Map<string, HTMLImageElement>()
  const tinted = new Map<string, HTMLCanvasElement>()
  const names = new Set<string>()
  for (const s of Object.values(styles)) for (const f of Object.values(s.faces ?? {})) names.add(f)

  await Promise.all([...names].map((n) => new Promise<void>((resolve) => {
    const img = new Image()
    img.onload = () => { images.set(n, img); resolve() }
    img.onerror = () => resolve()
    img.src = `${base}/blocks/${n}`
  })))

  // 染色贴图预生成（草顶、树叶、水…），用 multiply 混合，避免每帧算
  for (const s of Object.values(styles)) {
    const tint = s.tint_all ?? s.tint_top
    if (!tint) continue
    for (const key of Object.keys(s.faces ?? {})) {
      if (key === 'top' && !s.tint_top) continue
      const fn = s.faces[key]!
      const img = images.get(fn)
      if (!img) continue
      const id = fn + '|' + tint
      if (tinted.has(id)) continue
      const c = document.createElement('canvas')
      c.width = TEX; c.height = TEX
      const g = c.getContext('2d')!
      g.drawImage(img, 0, 0)
      g.globalCompositeOperation = 'multiply'
      g.fillStyle = tint
      g.fillRect(0, 0, TEX, TEX)
      tinted.set(id, c)
    }
  }
  return { styles, images, tinted }
}

function texFor(store: TextureStore, block: BlockEntry, face: 'top' | 'side'): CanvasImageSource | null {
  const style = store.styles[block.name]
  if (!style) return null
  const fn = style.faces[face] ?? style.faces.all ?? style.faces.side ?? style.faces.top
  if (!fn) return null
  const tint = style.tint_all ?? (face === 'top' ? style.tint_top : undefined)
  if (tint) {
    const c = store.tinted.get(fn + '|' + tint)
    if (c) return c
  }
  return store.images.get(fn) ?? null
}

/** 把 16×16 贴图贴到一个等距菱形（顶面）上 */
function drawTopFace(ctx: CanvasRenderingContext2D, img: CanvasImageSource, p: Projection, x: number, y: number, z: number): void {
  const top = toScreen(p, { x, y: y + 1, z })
  const tw = p.tileWidth, th = p.tileHeight
  ctx.save()
  ctx.transform(tw / 2 / TEX, th / 2 / TEX, -tw / 2 / TEX, th / 2 / TEX, top.x, top.y)
  ctx.drawImage(img, 0, 0, TEX, TEX)
  ctx.restore()
}

/** 侧面（左/右）—— 用平行四边形变换贴，和顶面共边 */
function drawSideFace(ctx: CanvasRenderingContext2D, img: CanvasImageSource, p: Projection, x: number, y: number, z: number, side: 'left' | 'right'): void {
  const top = toScreen(p, { x, y: y + 1, z })
  const tw = p.tileWidth, th = p.tileHeight, td = p.tileDepth
  const sx = side === 'left' ? -tw / 2 : tw / 2
  // 基准点：顶面菱形该侧的顶点（左面从左上顶点往下；右面从右上顶点）
  const bx = top.x + sx * 0
  const by = top.y
  ctx.save()
  if (side === 'left') {
    // 左上顶点 (top.x - tw/2, top.y + th/2) → 向下 td，向右 th/2
    ctx.transform(-1 / TEX, (th / 2) / TEX, 0, td / TEX, top.x - tw / 2, top.y + th / 2)
  } else {
    ctx.transform(1 / TEX, (th / 2) / TEX, 0, td / TEX, top.x + tw / 2 - TEX * (1 / TEX), top.y + th / 2)
  }
  ctx.drawImage(img, 0, 0, TEX, TEX)
  ctx.restore()
  void bx; void by
}

export interface RenderInput {
  projection: Projection
  blocks: readonly BlockEntry[]
  entities: readonly EntityLike[]
  /** 实体插值位置：id → 当前画在哪儿（由 app.ts 平滑推进） */
  entityPositions: Map<string, [number, number, number]>
  hoverKey: string | null
  selfName: string | null
}

export function renderScene(ctx: CanvasRenderingContext2D, store: TextureStore | null, input: RenderInput): void {
  const { projection: p, blocks, entities } = input
  const w = ctx.canvas.width / (window.devicePixelRatio > 2 ? 2 : (window.devicePixelRatio || 1))
  const h = ctx.canvas.height / (window.devicePixelRatio > 2 ? 2 : (window.devicePixelRatio || 1))

  // 天空：上方暗蓝，地平线附近泛暖；再压一层暗角
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#0b1220')
  sky.addColorStop(0.55, '#16212b')
  sky.addColorStop(1, '#1b2a1f')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)

  // 方块：按 (x+z) 小到大叠，近的压远的
  const sorted = [...blocks].sort((a, b) => (a.pos[0] + a.pos[2]) - (b.pos[0] + b.pos[2]) || a.pos[1] - b.pos[1])
  for (const b of sorted) {
    const [x, y, z] = b.pos
    const d = blockDiamond(p, x, y, z)
    if (d.cx < -60 || d.cx > w + 60 || d.cy < -80 || d.cy > h + 80) continue
    const topTex = texFor(store!, b, 'top')
    const sideTex = texFor(store!, b, 'side')
    const style = store?.styles[b.name]

    // 左右侧面
    if (sideTex) {
      drawSideFace(ctx, sideTex, p, x, y, z, 'left')
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; // 左面光
      drawFaceOverlay(ctx, p, x, y, z, 'left')
      drawSideFace(ctx, sideTex, p, x, y, z, 'right')
      ctx.fillStyle = 'rgba(0,0,0,0.44)'; // 右面更暗
      drawFaceOverlay(ctx, p, x, y, z, 'right')
    } else {
      // 没贴图（水、火把、花草…）：退回带光的纯色
      const base = style?.tint_all ?? '#4a6b3a'
      drawFlatSide(ctx, p, x, y, z, 'left', shadeHex(base, 0.78))
      drawFlatSide(ctx, p, x, y, z, 'right', shadeHex(base, 0.6))
    }
    // 顶面
    if (topTex) {
      drawTopFace(ctx, topTex, p, x, y, z)
    } else {
      drawFlatTop(ctx, p, x, y, z, store?.styles[b.name]?.tint_all ?? '#5c8f4a')
    }
    // 选中高亮
    if (input.hoverKey === `${x},${y},${z}`) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 1.5
      strokeDiamond(ctx, p, x, y, z)
    }
  }

  // 实体：按 (x+z) 叠；用插值位置画，状态 100ms 一帧也不会一跳一跳
  const ents = [...entities].sort((a, b) => {
    const pa = input.entityPositions.get(String(a.id)) ?? a.position
    const pb = input.entityPositions.get(String(b.id)) ?? b.position
    return (pa[0] + pa[2]) - (pb[0] + pb[2])
  })
  for (const e of ents) {
    const pos = input.entityPositions.get(String(e.id)) ?? e.position
    const feet = toScreen(p, { x: pos[0], y: pos[1], z: pos[2] })
    if (feet.x < -80 || feet.x > w + 80 || feet.y < -100 || feet.y > h + 80) continue
    const isSelf = e.username != null && e.username === input.selfName
    drawEntity(ctx, p, feet, e, isSelf, input.hoverKey === `e:${e.id}`)
  }
}

function drawFaceOverlay(ctx: CanvasRenderingContext2D, p: Projection, x: number, y: number, z: number, side: 'left' | 'right'): void {
  const top = toScreen(p, { x, y: y + 1, z })
  const tw = p.tileWidth, th = p.tileHeight, td = p.tileDepth
  ctx.beginPath()
  if (side === 'left') {
    ctx.moveTo(top.x - tw / 2, top.y + th / 2)
    ctx.lineTo(top.x, top.y + th)
    ctx.lineTo(top.x, top.y + th + td)
    ctx.lineTo(top.x - tw / 2, top.y + th / 2 + td)
  } else {
    ctx.moveTo(top.x + tw / 2, top.y + th / 2)
    ctx.lineTo(top.x, top.y + th)
    ctx.lineTo(top.x, top.y + th + td)
    ctx.lineTo(top.x + tw / 2, top.y + th / 2 + td)
  }
  ctx.closePath()
  ctx.fill()
}

function drawFlatTop(ctx: CanvasRenderingContext2D, p: Projection, x: number, y: number, z: number, color: string): void {
  const top = toScreen(p, { x, y: y + 1, z })
  const tw = p.tileWidth, th = p.tileHeight
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(top.x, top.y)
  ctx.lineTo(top.x + tw / 2, top.y + th / 2)
  ctx.lineTo(top.x, top.y + th)
  ctx.lineTo(top.x - tw / 2, top.y + th / 2)
  ctx.closePath()
  ctx.fill()
}

function drawFlatSide(ctx: CanvasRenderingContext2D, p: Projection, x: number, y: number, z: number, side: 'left' | 'right', color: string): void {
  const top = toScreen(p, { x, y: y + 1, z })
  const tw = p.tileWidth, th = p.tileHeight, td = p.tileDepth
  ctx.fillStyle = color
  ctx.beginPath()
  if (side === 'left') {
    ctx.moveTo(top.x - tw / 2, top.y + th / 2)
    ctx.lineTo(top.x, top.y + th)
    ctx.lineTo(top.x, top.y + th + td)
    ctx.lineTo(top.x - tw / 2, top.y + th / 2 + td)
  } else {
    ctx.moveTo(top.x + tw / 2, top.y + th / 2)
    ctx.lineTo(top.x, top.y + th)
    ctx.lineTo(top.x, top.y + th + td)
    ctx.lineTo(top.x + tw / 2, top.y + th / 2 + td)
  }
  ctx.closePath()
  ctx.fill()
}

function strokeDiamond(ctx: CanvasRenderingContext2D, p: Projection, x: number, y: number, z: number): void {
  const d = blockDiamond(p, x, y, z)
  ctx.beginPath()
  ctx.moveTo(d.cx, d.cy - d.halfH)
  ctx.lineTo(d.cx + d.halfW, d.cy)
  ctx.lineTo(d.cx, d.cy + d.halfH)
  ctx.lineTo(d.cx - d.halfW, d.cy)
  ctx.closePath()
  ctx.stroke()
}

function drawEntity(
  ctx: CanvasRenderingContext2D, p: Projection, feet: { x: number; y: number },
  e: EntityLike, isSelf: boolean, hovered: boolean,
): void {
  const z = p.zoom
  const sw = SPRITE_WIDTH * z
  const sh = SPRITE_HEIGHT * z

  // 落地影（椭圆）—— 让人"站在地上"而不是飘着
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath()
  ctx.ellipse(feet.x, feet.y, sw * 0.5, sh * 0.12, 0, 0, Math.PI * 2)
  ctx.fill()

  const body = e.username ? '#d8b98c' : (e.name === 'zombie' ? '#4b6b4b' : '#9aa3b2')
  const head = e.username ? '#e8c9a0' : (e.name === 'zombie' ? '#5b7b5b' : '#aab3c2')
  const torsoH = sh * 0.55
  const headS = sw * 0.62
  const topY = feet.y - sh

  // 躯干
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.roundRect(feet.x - sw * 0.32, topY + headS, sw * 0.64, torsoH, 3 * z)
  ctx.fill()
  // 头
  ctx.fillStyle = head
  ctx.beginPath()
  ctx.roundRect(feet.x - headS / 2, topY, headS, headS, 3 * z)
  ctx.fill()
  // 眼睛两点（一行，够表意）
  ctx.fillStyle = '#1b1b22'
  const eye = Math.max(1, 1.6 * z)
  ctx.fillRect(feet.x - headS * 0.26, topY + headS * 0.42, eye, eye)
  ctx.fillRect(feet.x + headS * 0.26 - eye, topY + headS * 0.42, eye, eye)

  if (isSelf || hovered) {
    ctx.strokeStyle = isSelf ? 'rgba(255,255,255,0.9)' : 'rgba(255,220,120,0.95)'
    ctx.lineWidth = 2
    ctx.strokeRect(feet.x - sw * 0.45, topY - 2, sw * 0.9, sh + 2)
  }

  // 名牌：带底衬的小胶囊（比裸文字干净）
  const label = e.username ?? e.name
  ctx.font = `${Math.max(10, 11.5 * z)}px ui-sans-serif, system-ui, sans-serif`
  ctx.textAlign = 'center'
  const tw = ctx.measureText(label).width
  const padX = 5 * z, padY = 2.5 * z
  const tagY = topY - (13 * z) - 2
  ctx.fillStyle = 'rgba(8,12,18,0.72)'
  ctx.beginPath()
  ctx.roundRect(feet.x - tw / 2 - padX, tagY, tw + padX * 2, 13 * z + padY, 6 * z)
  ctx.fill()
  ctx.fillStyle = isSelf ? '#ffffff' : '#dbe2ea'
  ctx.fillText(label, feet.x, tagY + 10 * z)
}

function shadeHex(hex: string, k: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1]!, 16)
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k))
  const g = Math.min(255, Math.round(((n >> 8) & 255) * k))
  const b = Math.min(255, Math.round((n & 255) * k))
  return `rgb(${r},${g},${b})`
}
