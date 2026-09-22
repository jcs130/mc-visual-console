/**
 * 拾取（hover / click 命中什么）—— 纯函数，可测。
 *
 * 等距画面的两条铁律（照千灯纪 modern-viewer 的交互模型）：
 *   1. **实体优先于地面** —— "悬停识别对象"要比"指着哪一格"更早给出答案；
 *   2. **近的压远的** —— 画的时候按 (x+z) 从小到大叠，拾取就要反过来取最后一个命中的。
 * 另外同一格柱里，看到的是**最高的那一块**（顶面），不是脚下的。
 */

import type { BlockEntry, EntityLike } from '../src/protocol.ts'
import { blockDiamond, inDiamond, toScreen, type Projection } from './projection.ts'

export interface PickTarget {
  kind: 'entity' | 'block'
  entity?: EntityLike
  block?: BlockEntry
  /** 世界坐标（实体的脚点或方块的格点） */
  world: { x: number; y: number; z: number }
  /** 该目标在屏幕上的中心，供 UI 定位气泡 */
  screen: { x: number; y: number }
}

/** 实体精灵在屏幕上占的框（默认 24×32，随缩放走） */
export const SPRITE_WIDTH = 24
export const SPRITE_HEIGHT = 32

function depthOf(world: { x: number; z: number }): number {
  return world.x + world.z
}

/** 实体命中：按绘制顺序扫，取最后一个（= 最近的） */
export function pickEntity(
  p: Projection,
  screen: { x: number; y: number },
  entities: readonly EntityLike[],
): PickTarget | null {
  const sorted = [...entities].sort(
    (a, b) => (a.position[0] + a.position[2]) - (b.position[0] + b.position[2]),
  )
  let hit: PickTarget | null = null
  for (const e of sorted) {
    const feet = toScreen(p, { x: e.position[0], y: e.position[1], z: e.position[2] })
    const w = SPRITE_WIDTH * p.zoom
    const h = SPRITE_HEIGHT * p.zoom
    if (
      screen.x >= feet.x - w / 2 && screen.x <= feet.x + w / 2 &&
      screen.y >= feet.y - h && screen.y <= feet.y + p.tileHeight / 2
    ) {
      hit = {
        kind: 'entity',
        entity: e,
        world: { x: e.position[0], y: e.position[1], z: e.position[2] },
        screen: { x: feet.x, y: feet.y - h / 2 },
      }
    }
  }
  return hit
}

/** 方块命中：命中顶面菱形者里，先取 y 最高，再取 (x+z) 最大 */
export function pickBlock(
  p: Projection,
  screen: { x: number; y: number },
  blocks: readonly BlockEntry[],
): PickTarget | null {
  let best: PickTarget | null = null
  for (const b of blocks) {
    const [x, y, z] = b.pos
    const d = blockDiamond(p, x, y, z)
    if (!inDiamond(screen.x, screen.y, d)) continue
    const better =
      best === null ||
      y > best.world.y ||
      (y === best.world.y && depthOf({ x, z }) > depthOf(best.world))
    if (better) {
      best = {
        kind: 'block',
        block: b,
        world: { x, y, z },
        screen: { x: d.cx, y: d.cy },
      }
    }
  }
  return best
}

/** 应用层唯一入口：先实体、后方块 */
export function resolvePick(
  p: Projection,
  screen: { x: number; y: number },
  blocks: readonly BlockEntry[],
  entities: readonly EntityLike[],
): PickTarget | null {
  return pickEntity(p, screen, entities) ?? pickBlock(p, screen, blocks)
}

/** 右键/长按菜单的四个动作，对应协议里的 action.how */
export const ACTION_MENU = [
  { how: 'detail', label: '详情' },
  { how: 'approach', label: '走近' },
  { how: 'attack', label: '攻击' },
  { how: 'use', label: '使用' },
] as const

/** 长按判定：按住不动超过这个毫秒数，等价于右键 */
export const LONG_PRESS_MS = 500
