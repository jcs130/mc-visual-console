/**
 * 协议端到端测试：假 bot + 真 HTTP/WS，全程不连 Minecraft。
 *
 * 断言的是**协议承诺**，不是实现细节：快照看得到东西、没接管不能动、
 * 接管之后点地真能走、释放之后又动不了。
 */

import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'

import { createFakeBot } from '../fixtures/fake-bot.ts'
import { attach, type Viewer } from '../src/index.ts'

const opened: Viewer[] = []

afterEach(async () => {
  while (opened.length) await opened.pop()!.close()
})

async function start(options: Parameters<typeof attach>[1] = {}) {
  const bot = createFakeBot()
  const viewer = attach(bot, { port: 0, holderTimeoutMs: 0, ...options })
  opened.push(viewer)
  if (!viewer.http.listening) {
    await new Promise<void>((resolve) => viewer.http.once('listening', () => resolve()))
  }
  const base = viewer.url().replace(/\/$/, '')
  return { bot, viewer, base }
}

function connect(viewer: Viewer): Promise<{ ws: WebSocket; messages: Array<Record<string, unknown>> }> {
  const ws = new WebSocket(viewer.url().replace(/^http/, 'ws') + 'ws')
  const messages: Array<Record<string, unknown>> = []
  ws.on('message', (data) => { messages.push(JSON.parse(String(data)) as Record<string, unknown>) })
  return new Promise((resolve) => ws.once('open', () => resolve({ ws, messages })))
}

async function waitFor(messages: Array<Record<string, unknown>>, type: string, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const hit = messages.find((m) => m.type === type)
    if (hit) return hit
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error(`等待 ${type} 超时；已收到：${messages.map((m) => m.type).join(',')}`)
}

describe('mc-viewer 协议', () => {
  it('/health 与 /state 报告 bot 与实体', async () => {
    const { base } = await start()
    const health = JSON.parse(await (await fetch(`${base}/health`)).text()) as {
      ok: boolean; bot: string; viewers: number; holder: string | null
    }
    expect(health.ok).toBe(true)
    expect(health.bot).toBe('fakebot')
    expect(health.holder).toBeNull()

    const snap = JSON.parse(await (await fetch(`${base}/state`)).text()) as {
      entities: unknown[]; holder: string | null; budget: { stateHz: number }
    }
    expect(snap.entities.length).toBeGreaterThanOrEqual(3)
    expect(snap.holder).toBeNull()
    expect(snap.budget.stateHz).toBeGreaterThan(0)
  })

  it('连接即收到 hello，且协议号是 0', async () => {
    const { viewer } = await start()
    const { messages, ws } = await connect(viewer)
    const hello = await waitFor(messages, 'hello')
    expect(hello.protocol).toBe(0)
    ws.close()
  })

  it('没接管时的 moveTo 被拒（not_holder），接管后真能走，释放后又拒', async () => {
    const { bot, viewer } = await start()
    const { messages, ws } = await connect(viewer)
    await waitFor(messages, 'hello')

    // 1) 未接管 → 拒绝
    ws.send(JSON.stringify({ type: 'moveTo', x: 5, z: 5, id: 'a' }))
    const denied = await waitFor(messages, 'error')
    expect(denied.code).toBe('not_holder')
    expect(bot.entity.position.x).toBe(0)

    // 2) 接管
    messages.length = 0
    ws.send(JSON.stringify({ type: 'claim' }))
    const held = await waitFor(messages, 'holder')
    expect(typeof held.holder).toBe('string')
    expect(viewer.holder()).toBe(held.holder)

    // 3) 接管后点地 → bot 真的走了（这是整条链的证明）
    ws.send(JSON.stringify({ type: 'moveTo', x: 5, z: -4, id: 'b' }))
    await new Promise((r) => setTimeout(r, 120))
    expect(bot.entity.position.x).toBe(5)
    expect(bot.entity.position.z).toBe(-4)

    // 4) 释放 → 又拒
    messages.length = 0
    ws.send(JSON.stringify({ type: 'release' }))
    const released = await waitFor(messages, 'holder')
    expect(released.holder).toBeNull()

    ws.send(JSON.stringify({ type: 'lookAt', x: 1, y: 64, z: 1, id: 'c' }))
    const denied2 = await waitFor(messages, 'error')
    expect(denied2.code).toBe('not_holder')
    ws.close()
  })

  it('上游缺 goto 时返回 not_supported 而不是抛错', async () => {
    const { viewer } = await start()
    const { bot } = { bot: createFakeBot() }
    // 造一个没有 goto 的 bot
    const stripped = { ...bot, goto: undefined } as unknown as typeof bot
    const bare = attach(stripped, { port: 0, holderTimeoutMs: 0 })
    opened.push(bare)
    if (!bare.http.listening) await new Promise<void>((r) => bare.http.once('listening', () => r()))
    const { messages, ws } = await connect(bare)
    await waitFor(messages, 'hello')
    ws.send(JSON.stringify({ type: 'claim' }))
    await waitFor(messages, 'holder')
    messages.length = 0
    ws.send(JSON.stringify({ type: 'moveTo', x: 1, z: 1 }))
    const err = await waitFor(messages, 'error')
    expect(err.code).toBe('not_supported')
    ws.close()
    void viewer
  })

  it('超过 maxSessions 的连接被拒（预算生效）', async () => {
    const { viewer } = await start({ budget: { maxSessions: 1 } })
    const first = await connect(viewer)
    await waitFor(first.messages, 'hello')
    const second = await connect(viewer)
    const err = await waitFor(second.messages, 'error')
    expect(err.code).toBe('too_many_sessions')
    first.ws.close()
    second.ws.close()
  })
})
