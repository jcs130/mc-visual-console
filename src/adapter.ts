/**
 * 上游形状 —— 组件只认这些能力，不认"真的 mineflayer"。
 *
 * 这样：测试用假 bot（fixtures/fake-bot.ts）就能跑完整条协议，不必连服务器；
 * 将来 mineflayer 换实现、或者换成别的协议库，也只是换一个适配器。
 */

import type { EntityLike, Vec3Tuple } from './protocol.ts'

/** bot 自己的一份状态 */
export interface BotSelf {
  position: { x: number; y: number; z: number }
  yaw: number
  pitch: number
  health?: number
  food?: number
}

/** 只取组件真正用到的那几个方法；缺哪个，对应命令返回 not_supported */
export interface ViewerBot {
  readonly username: string
  world: {
    getBlock(pos: { x: number; y: number; z: number }): { name: string; boundingBox?: string } | null
  }
  entity: BotSelf
  /** 含自己在内的全部可见实体 */
  entities: Record<string, unknown>
  players: Record<string, { username?: string; entity?: unknown }>
  look?(yaw: number, pitch: number): Promise<void> | void
  goto?(x: number, y: number, z: number, opts?: { range?: number }): Promise<void> | void
  attack?(entityId: string | number): Promise<void> | void
  activateEntity?(entityId: string | number): Promise<void> | void
  on(event: string, handler: (...args: unknown[]) => void): void
  removeListener?(event: string, handler: (...args: unknown[]) => void): void
}

export function normalizeId(id: string | number): string {
  return typeof id === 'number' ? String(id) : id
}

export function toTuple(p: { x: number; y: number; z: number }): Vec3Tuple {
  return [p.x, p.y, p.z]
}

/**
 * 把上游实体对象（mineflayer Entity 或假 bot 的替身）折成 EntityLike。
 * 不认识的对象一律跳过，不抛错 —— 组件不该因为一个怪实体整条流挂掉。
 */
export function toEntityLike(raw: unknown, selfId?: string): EntityLike | null {
  if (typeof raw !== 'object' || raw === null) return null
  const e = raw as {
    id?: string | number
    name?: string
    username?: string
    position?: { x: number; y: number; z: number }
    yaw?: number
    pitch?: number
    health?: number
  }
  if (e.id === undefined || e.id === null || !e.position) return null
  const id = normalizeId(e.id)
  return {
    id,
    name: e.name ?? (e.username ? 'player' : 'unknown'),
    username: e.username,
    position: toTuple(e.position),
    yaw: e.yaw,
    pitch: e.pitch,
    health: e.health,
    self: selfId !== undefined && selfId === id,
  }
}
