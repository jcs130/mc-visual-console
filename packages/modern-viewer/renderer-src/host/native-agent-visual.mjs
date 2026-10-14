import { EventEmitter } from 'node:events'
import { createViewerAgentBridge } from './viewer-agent.mjs'

// Read-only SSE transport for the original shared visualization protocol.
// It observes the action body; it never creates another client or accepts input.
export function createNativeAgentVisualization(bot, { getAgentStatus, now = Date.now, timers = true } = {}) {
  const bridge = createViewerAgentBridge(bot, { now, timers }), subscriptions = new Set()
  function refresh() {
    let value
    try { value = getAgentStatus?.() } catch { /* Optional public state may be temporarily unavailable. */ }
    const own = value?.username === bot.username && value?.online === true
    const status = value?.mode === 'acting' ? 'acting' : value?.mode === 'thinking' ? 'planning'
      : value?.mode?.startsWith('paused') ? 'blocked' : 'waiting'
    bridge.publish({ intent: own && typeof value.goal === 'string' && value.goal
      ? { goal: value.goal.slice(0, 240), step: (value.action || '').slice(0, 160), status, ttlMs: 3500 } : null })
  }
  const timer = timers ? setInterval(() => { if (subscriptions.size) refresh() }, 1000) : null
  timer?.unref?.()
  return {
    flush() { refresh(); bridge.flush(true) },
    subscribe(send) {
      refresh()
      const events = new EventEmitter()
      const socket = { connected: true, on: (...args) => events.on(...args), off: (...args) => events.off(...args),
        emit: (event, value) => socket.connected && send({ event, value }) }
      const off = bridge.subscribeSocket(socket)
      const stop = () => { socket.connected = false; off(); events.removeAllListeners(); subscriptions.delete(stop) }
      subscriptions.add(stop); return stop
    },
    dispose() { clearInterval(timer); bridge.dispose(); for (const stop of subscriptions) stop() }
  }
}
