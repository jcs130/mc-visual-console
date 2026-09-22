/**
 * 等距（2.5D）投影 —— 纯函数，可测。
 *
 * 用经典 dimetric：屏幕 x 由 (x - z) 决定，屏幕 y 由 (x + z) 与高度 -y 决定。
 * 这就是"地牢 2.5D 视角"的数学底子，也是我们把画面做成 2D 画布而不是 three.js 的原因：
 * 它够用、够轻、够好测。
 *
 * 约定：世界坐标 y 向上为增长；屏幕坐标 y 向下为增长。
 */

export interface ScreenPoint { x: number; y: number }
export interface WorldPoint { x: number; y: number; z: number }

export interface Projection {
  /** 一格在屏幕上的宽（缩放后） */
  tileWidth: number
  /** 一格在屏幕上的高（缩放后） */
  tileHeight: number
  /** 一格高度在屏幕上的偏移（缩放后） */
  tileDepth: number
  /** 缩放倍率（滚轮改它） */
  zoom: number
  /** 画布原点（视口中心） */
  originX: number
  originY: number
  /** 相机聚焦的世界点（大致画在屏幕中心） */
  center: { x: number; y: number; z: number }
}

export const BASE_TILE_WIDTH = 32
export const BASE_TILE_HEIGHT = 16
export const BASE_TILE_DEPTH = 16

export const MIN_ZOOM = 0.35
export const MAX_ZOOM = 3

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export function makeProjection(partial: Partial<Projection> = {}): Projection {
  const zoom = clampZoom(partial.zoom ?? 1)
  return {
    zoom,
    tileWidth: BASE_TILE_WIDTH * zoom,
    tileHeight: BASE_TILE_HEIGHT * zoom,
    tileDepth: BASE_TILE_DEPTH * zoom,
    originX: partial.originX ?? 0,
    originY: partial.originY ?? 0,
    center: partial.center ?? { x: 0, y: 64, z: 0 },
  }
}

export function withZoom(p: Projection, zoom: number): Projection {
  return makeProjection({ ...p, zoom })
}

/** 世界 → 屏幕（含高度） */
export function toScreen(p: Projection, world: WorldPoint): ScreenPoint {
  const dx = world.x - p.center.x
  const dy = world.y - p.center.y
  const dz = world.z - p.center.z
  return {
    x: p.originX + (dx - dz) * (p.tileWidth / 2),
    y: p.originY + (dx + dz) * (p.tileHeight / 2) - dy * p.tileDepth,
  }
}

/**
 * 屏幕 → 世界，**落在给定的高度平面上**。
 *
 * 2D 投影天生丢一维：同一个屏幕点对应一条射线。所以反解必须指定 y 平面。
 * 点地面移动时我们就是这样用的：先假设地面高度，再拿方块表校正（见 hit.ts）。
 */
export function toWorldOnPlane(p: Projection, screen: ScreenPoint, planeY: number): { x: number; z: number } {
  const sx = (screen.x - p.originX) / (p.tileWidth / 2)
  const sy = (screen.y - p.originY + (planeY - p.center.y) * p.tileDepth) / (p.tileHeight / 2)
  // sx = dx - dz, sy = dx + dz  ⇒  dx = (sx + sy)/2, dz = (sy - sx)/2
  const dx = (sx + sy) / 2
  const dz = (sy - sx) / 2
  return { x: p.center.x + dx, z: p.center.z + dz }
}

/** 画一格立方体的六个面里我们需要的三个轮廓点（顶面菱形），供命中检测用 */
export function blockDiamond(p: Projection, x: number, y: number, z: number): { cx: number; cy: number; halfW: number; halfH: number } {
  const top = toScreen(p, { x, y: y + 1, z })
  return { cx: top.x, cy: top.y + p.tileHeight / 2, halfW: p.tileWidth / 2, halfH: p.tileHeight / 2 }
}

/** 点是否落在某格的菱形内（等距下"看起来指着这一格"的判据） */
export function inDiamond(px: number, py: number, d: { cx: number; cy: number; halfW: number; halfH: number }): boolean {
  if (d.halfW <= 0 || d.halfH <= 0) return false
  return Math.abs(px - d.cx) / d.halfW + Math.abs(py - d.cy) / d.halfH <= 1
}
