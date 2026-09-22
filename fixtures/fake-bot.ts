/**
 * 脚本化假 bot —— 测试与 demo 都用它，**不连任何服务器**。
 *
 * 它只实现 ViewerBot 需要的那点能力：一块小地形、几个实体、能走能看。
 * 这样整条协议可以在没有 Minecraft、没有 Mineflayer 的情况下跑通。
 */

import type { ViewerBot } from '../src/adapter.ts'

export interface FakeBotOptions {
  username?: string
  /** 地形半径（方块） */
  radius?: number
}

interface FakePos { x: number; y: number; z: number }

export function createFakeBot(options: FakeBotOptions = {}) {
  const username = options.username ?? 'fakebot'
  const radius = options.radius ?? 8
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()

  const emit = (event: string, ...args: unknown[]): void => {
    for (const h of listeners.get(event) ?? []) h(...args)
  }

  let self: FakePos & { yaw: number; pitch: number; health: number; food: number } = {
    x: 0, y: 64, z: 0, yaw: 0, pitch: 0, health: 20, food: 20,
  }

  /** 一块平地 + 四堵墙：够验证"看得到地形"与"点地移动" */
  const blocks = new Map<string, { name: string; boundingBox?: string }>()
  const key = (p: FakePos) => `${p.x},${p.y},${p.z}`
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      blocks.set(key({ x: dx, y: 63, z: dz }), { name: 'grass_block', boundingBox: 'block' })
    }
  }
  for (let d = -radius; d <= radius; d++) {
    blocks.set(key({ x: d, y: 64, z: -radius }), { name: 'stone', boundingBox: 'block' })
    blocks.set(key({ x: d, y: 64, z: radius }), { name: 'stone', boundingBox: 'block' })
    blocks.set(key({ x: -radius, y: 64, z: d }), { name: 'stone', boundingBox: 'block' })
    blocks.set(key({ x: radius, y: 64, z: d }), { name: 'stone', boundingBox: 'block' })
  }

  const entities: Record<string, unknown> = {}
  const spawn = (id: string, name: string, pos: FakePos, extra: Record<string, unknown> = {}) => {
    entities[id] = { id, name, position: { ...pos }, yaw: 0, pitch: 0, ...extra }
  }
  spawn('1', 'player', { x: 0, y: 64, z: 0 }, { username, health: 20 })
  spawn('2', 'zombie', { x: 3, y: 64, z: -2 }, { health: 20 })
  spawn('3', 'item', { x: -2, y: 64, z: 1 }, {})

  const bot: ViewerBot & { teleport: (p: FakePos) => void; emitter: typeof emit } = {
    username,
    world: {
      getBlock(pos) { return blocks.get(key(pos)) ?? null },
    },
    get entity() {
      return { position: { x: self.x, y: self.y, z: self.z }, yaw: self.yaw, pitch: self.pitch, health: self.health, food: self.food }
    },
    entities,
    players: { '1': { username, entity: entities['1'] } },
    look(yaw, pitch) { self.yaw = yaw; self.pitch = pitch; emit('move') },
    goto(x, y, z) {
      self.x = Math.round(x); self.y = Math.round(y); self.z = Math.round(z)
      const me = entities['1'] as { position: FakePos }
      me.position = { x: self.x, y: self.y, z: self.z }
      emit('move'); emit('physicsTick')
    },
    attack() { emit('physicsTick') },
    activateEntity() { emit('physicsTick') },
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(handler)
    },
    removeListener(event, handler) { listeners.get(event)?.delete(handler) },
    teleport(p) { self = { ...self, ...p }; emit('move') },
    emitter: emit,
  }

  return bot
}
