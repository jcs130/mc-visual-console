import test from 'node:test'
import assert from 'node:assert/strict'
import { agentStatusView, renderAgentStatus, startAgentStatusPolling } from '../../src/native-viewer/agent-status.js'

function status (details = {}) {
  return { mode: 'live_same_player_connection', identity: { player: 'MawAgent' }, connection: { ended: false },
    agent: { available: true, source: 'caller_injected', details: { username: 'MawAgent', online: true, mode: 'thinking',
      goal: '真实采集木材', lastDecision: { at: '2026-10-04T06:00:00.000Z' }, receipts: [], ...details } } }
}
const flush = () => new Promise(resolve => setImmediate(resolve))

test('mode, goal and latest receipt use actual injected fields and do not promote ok=true to a verified effect', () => {
  const view = agentStatusView(status({ mode: 'acting', receipts: [
    { at: '2026-10-04T06:00:01.000Z', action: { type: 'wait' }, result: { ok: true } },
    { at: '2026-10-04T06:00:02.000Z', action: { type: 'spell', operation: 'cast' }, result: { ok: true, code: 'ars_cast_confirmed', effectVerified: false } }
  ] }), 'MawAgent')
  assert.equal(view.name, 'MawAgent')
  assert.equal(view.goal, '真实采集木材')
  assert.match(view.mode, /执行动作.*acting/)
  assert.equal(view.action, 'spell / cast')
  assert.equal(view.receipt, 'ok=true · 效果未验证 · ars_cast_confirmed')
  assert(!view.receipt.includes('成功'))
  assert.notEqual(view.receiptAt, '未提供')
  assert.notEqual(view.decisionAt, '未提供')
})

test('waiting, failed and unknown receipts retain their actual distinctions without substituting current time', () => {
  const waiting = agentStatusView(status())
  assert.match(waiting.mode, /等待模型决策/)
  assert.equal(waiting.action, '未收到动作回执')
  assert.equal(waiting.receiptAt, '未提供')
  const failed = agentStatusView(status({ receipts: [{ action: { type: 'craft' }, result: { ok: false, code: 'ingredient_missing' } }] }))
  assert.equal(failed.receipt, 'ok=false · ingredient_missing')
  assert.equal(failed.receiptAt, '未提供')
  const unknown = agentStatusView(status({ mode: 'paused_unknown', receipts: [{ at: 'invalid', action: { type: 'menu_click' }, result: { ok: false, outcome: 'unknown' } }] }))
  assert.match(unknown.mode, /结果未知，已暂停/)
  assert.equal(unknown.receipt, '结果未知')
  assert.equal(unknown.receiptAt, '时间无效')
})

test('missing provider and foreign identities fail closed; disconnect identifies remaining data as last received state', () => {
  const missing = status(); missing.agent = { available: false, source: 'caller_injected', reason: 'AGENT_STATUS_NOT_PROVIDED' }
  assert.equal(agentStatusView(missing).available, false)
  assert.match(agentStatusView(missing).notice, /尚未提供/)
  assert.equal(agentStatusView(status(), 'SomeoneElse').available, false)
  assert.equal(agentStatusView(status({ username: 'SomeoneElse' })).available, false)
  const foreign = status(); foreign.agent.source = 'invented'
  assert.equal(agentStatusView(foreign).available, false)
  const ended = status(); ended.connection.ended = true
  assert.match(agentStatusView(ended).notice, /已断开.*最后收到/)
  assert.equal(agentStatusView(ended).goal, '真实采集木材')
})

test('a real quota pause is visible without exposing raw provider errors or suggesting a disconnected player', () => {
  const details = { mode: 'paused', lastError: 'MODEL_TASK_FAILED: MODEL_QUOTA_EXCEEDED secret=do-not-display' }
  const view = agentStatusView(status(details))
  assert.match(view.notice, /额度.*决策已暂停.*游戏连接仍在线/)
  assert(!view.notice.includes('secret'))
  assert.equal(agentStatusView(status({ ...details, mode: 'observing' })).notice, '')
  const afterRestart = agentStatusView(status({ mode: 'paused', lastError: null, modelTask: { status: 'failed', error: { message: 'private raw error' } } }))
  assert.match(afterRestart.notice, /最近一次模型任务失败/)
  assert(!afterRestart.notice.includes('private raw error'))
  const ended = status(details); ended.connection.ended = true
  assert.match(agentStatusView(ended).notice, /玩家连接已断开/)
})

test('DOM rendering uses textContent, retains full text in title and clears stale fields on unavailable data', () => {
  const nodes = new Map()
  const element = id => {
    if (!nodes.has(id)) nodes.set(id, { textContent: '', title: '', set innerHTML (_) { throw Error('HTML injection') } })
    return nodes.get(id)
  }
  const goal = '<img src=x onerror=alert(1)>' + '真实目标'.repeat(100)
  renderAgentStatus(agentStatusView(status({ goal })), element)
  assert.equal(nodes.get('agent-goal').title, goal)
  assert(nodes.get('agent-goal').textContent.startsWith('<img'))
  assert(nodes.get('agent-goal').textContent.endsWith('…'))
  renderAgentStatus(agentStatusView(null), element)
  assert.equal(nodes.get('agent-goal').textContent, '未提供')
  assert.equal(nodes.get('agent-action').textContent, '未收到动作回执')
  assert.equal(nodes.get('agent-mode').textContent, '不可用')
})

test('polling waits for each GET result, refreshes at two seconds and clears stale status after an HTTP failure', async () => {
  let nextId = 0, requests = 0, release
  const timers = new Map(), views = []
  const setTimer = (fn, ms) => { timers.set(++nextId, { fn, ms }); return nextId }
  const clearTimer = id => timers.delete(id)
  const stop = startAgentStatusPolling({ setTimer, clearTimer, onView: view => views.push(view), expectedPlayer: () => 'MawAgent',
    fetchStatus: () => {
      requests++
      return requests === 1 ? new Promise(resolve => { release = resolve }) : Promise.resolve({ ok: false })
    } })
  assert.equal(requests, 1)
  assert.equal([...timers.values()].filter(timer => timer.ms === 2000).length, 0)
  release({ ok: true, json: async () => status() })
  await flush()
  assert.equal(views[0].available, true)
  const [id, timer] = [...timers].find(([, timer]) => timer.ms === 2000)
  timers.delete(id); timer.fn()
  await flush()
  assert.equal(requests, 2)
  assert.equal(views[1].available, false)
  assert.equal(views[1].goal, '未提供')
  stop()
  assert.equal(timers.size, 0)
  for (const intervalMs of [999, 3001]) assert.throws(() => startAgentStatusPolling({ intervalMs }), /POLL_INTERVAL_INVALID/)
})

test('request timeout and page close abort outstanding work and do not render a late response', async () => {
  const timers = new Map(), views = []
  let nextId = 0, signal
  const setTimer = (fn, ms) => { timers.set(++nextId, { fn, ms }); return nextId }
  const clearTimer = id => timers.delete(id)
  const stop = startAgentStatusPolling({ setTimer, clearTimer, onView: view => views.push(view), fetchStatus: suppliedSignal => {
    signal = suppliedSignal
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }))
  } })
  const timeout = [...timers.values()].find(timer => timer.ms === 3000)
  timeout.fn()
  await flush()
  assert.equal(signal.aborted, true)
  assert.equal(views.length, 1)
  assert.equal(views[0].available, false)
  stop()
  assert.equal(timers.size, 0)

  let release
  const otherViews = []
  const otherStop = startAgentStatusPolling({ setTimer, clearTimer, onView: view => otherViews.push(view),
    fetchStatus: () => new Promise(resolve => { release = resolve }) })
  otherStop()
  release({ ok: true, json: async () => status() })
  await flush()
  assert.equal(otherViews.length, 0)
  assert.equal(timers.size, 0)
})
