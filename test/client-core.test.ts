/**
 * 客户端纯核心测试：等距投影 + 拾取。
 *
 * 渲染画不出来可以靠肉眼看，但"点这里到底该走过去还是该开菜单"这种事必须能证。
 */

import { describe, expect, it } from 'vitest'

import { ACTION_MENU, LONG_PRESS_MS, pickEntity, pickBlock, resolvePick } from '../client/hit.ts'
import { blockDiamond, clampZoom, inDiamond, makeProjection, toScreen, toWorldOnPlane } from '../client/projection.ts'
import type { BlockEntry, EntityLike } from '../src/protocol.ts'

/** 以 (0,63,0) 为画面中心、无偏移：让断言里的数字一眼可算 */
const P = makeProjection({ center: { x: 0, y: 63, z: 0 } })

const block = (x: number, y: number, z: number, name = 'grass_block'): BlockEntry => ({ pos: [x, y, z], name })
const entity = (id: string, x: number, y: number, z: number, name = 'player', username?: string): EntityLike =>
  ({ id, name, username, position: [x, y, z] })

describe('等距投影', () => {
  it('已知向量：一格的三条轴向', () => {
    // 中心 (0,63,0) 处，原点即 (0,0)
    expect(toScreen(P, { x: 0, y: 63, z: 0 })).toEqual({ x: 0, y: 0 })
    // +x 一格：屏幕右半格宽、下半格高
    expect(toScreen(P, { x: 1, y: 63, z: 0 })).toEqual({ x: 16, y: 8 })
    // +z 一格：左半格宽、下半格高
    expect(toScreen(P, { x: 0, y: 63, z: 1 })).toEqual({ x: -16, y: 8 })
    // 高度 +1：屏幕上升一格深度
    expect(toScreen(P, { x: 0, y: 64, z: 0 })).toEqual({ x: 0, y: -16 })
  })

  it('屏幕→世界 能往返（同一高度平面内）', () => {
    for (const w of [
      { x: 0, z: 0 }, { x: 3, z: -2 }, { x: -7, z: 5 }, { x: 12, z: 12 },
    ]) {
      const s = toScreen(P, { x: w.x, y: 63, z: w.z })
      const back = toWorldOnPlane(P, s, 63)
      expect(back.x).toBeCloseTo(w.x, 6)
      expect(back.z).toBeCloseTo(w.z, 6)
    }
  })

  it('缩放有上下限，且改缩放不改变投影自洽性', () => {
    expect(clampZoom(0.01)).toBeGreaterThan(0.3)
    expect(clampZoom(99)).toBeLessThanOrEqual(3)
    const p2 = makeProjection({ center: { x: 0, y: 63, z: 0 }, zoom: 2 })
    const s = toScreen(p2, { x: 2, y: 63, z: 1 })
    const back = toWorldOnPlane(p2, s, 63)
    expect(back.x).toBeCloseTo(2, 6)
    expect(back.z).toBeCloseTo(1, 6)
  })

  it('菱形命中：格子中心命中、远点不命中', () => {
    const d = blockDiamond(P, 0, 63, 0)
    expect(inDiamond(d.cx, d.cy, d)).toBe(true)
    expect(inDiamond(d.cx + d.halfW, d.cy, d)).toBe(true)   // 边界上算命中
    expect(inDiamond(d.cx + d.halfW + 1, d.cy, d)).toBe(false)
    expect(inDiamond(500, 500, d)).toBe(false)
  })
})

describe('拾取', () => {
  it('单块：指它的顶面菱形就命中它', () => {
    const blocks = [block(0, 63, 0)]
    const d = blockDiamond(P, 0, 63, 0)
    const hit = pickBlock(P, { x: d.cx, y: d.cy }, blocks)
    expect(hit?.block?.pos).toEqual([0, 63, 0])
    expect(hit?.world).toEqual({ x: 0, y: 63, z: 0 })
  })

  it('叠两块：看到的是上面那块（y 高的优先）', () => {
    const blocks = [block(0, 63, 0), block(0, 64, 0)]
    const top = blockDiamond(P, 0, 64, 0)
    const hit = pickBlock(P, { x: top.cx, y: top.cy }, blocks)
    expect(hit?.world.y).toBe(64)
  })

  it('实体优先于地面：同一屏幕点上先给实体', () => {
    const blocks = [block(0, 63, 0)]
    const ents = [entity('7', 0, 64, 0, 'player', 'steve')]
    // 这个点在实体精灵框内，同时也在方块顶面菱形内
    const point = { x: 0, y: -12 }
    expect(pickEntity(P, point, ents)?.entity?.username).toBe('steve')
    expect(pickBlock(P, point, blocks)).not.toBeNull()
    expect(resolvePick(P, point, blocks, ents)?.kind).toBe('entity')
  })

  it('空处点击没有目标（不误触发移动）', () => {
    expect(resolvePick(P, { x: 999, y: 999 }, [block(0, 63, 0)], [])).toBeNull()
  })

  it('长按/右键菜单就是协议的四个 how', () => {
    expect(ACTION_MENU.map((a) => a.how)).toEqual(['detail', 'approach', 'attack', 'use'])
    expect(ACTION_MENU.map((a) => a.label)).toEqual(['详情', '走近', '攻击', '使用'])
    expect(LONG_PRESS_MS).toBeGreaterThan(200)
  })
})
