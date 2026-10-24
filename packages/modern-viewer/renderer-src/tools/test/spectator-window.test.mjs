import { test } from 'node:test'
import assert from 'node:assert/strict'
import { startSpectatorPublisher } from '../../host/spectator-publisher.mjs'
import { decodeChunk } from '../../host/spectator-protocol.mjs'
const uuid = '00000000-0000-3000-8000-000000000001', hash = 'a'.repeat(64)
const build = { viewerBuild: hash + ':' + hash, browserBundleSha256: hash, consoleBundleSha256: hash }
const status = { schemaVersion: 1, readOnly: true, mode: 'paper_server_observation', identity: { confirmed: true, playerUuid: uuid },
  connection: { ended: false }, viewer: { available: true, registrySha256: hash }, build }
async function runWindow(t, advertised) {
  const bytes = Buffer.alloc(12 * 65536, 7), chunks = [], receipts = new Set(), events = new Map()
  let socket, outstanding = 0, maximum = 0, completed
  const done = new Promise(resolve => { completed = resolve })
  class Socket {
    constructor() { socket = this; this.readyState = 0; queueMicrotask(() => { this.readyState = 1; this.emit('open', {}) }) }
    addEventListener(name, handler) { const rows = events.get(name) ?? []; rows.push(handler); events.set(name, rows) }
    emit(name, value) { for (const handler of events.get(name) ?? []) handler(value) }
    message(value) { this.emit('message', { data: JSON.stringify(value) }) }
    close() { this.readyState = 3; for (const timer of receipts) clearTimeout(timer); this.emit('close', {}) }
    send(value) {
      if (typeof value === 'string') {
        const message = JSON.parse(value)
        if (message.type === 'auth') queueMicrotask(() => this.message({ type: 'ready', protocol: 'mc-spectator/1', playerUuid: uuid, build,
          ...(advertised === undefined ? {} : { maxInFlightChunks: advertised }) }))
        if (message.type === 'source') queueMicrotask(() => this.message({ type: 'accepted' }))
        if (message.type === 'end') completed()
        return
      }
      const chunk = decodeChunk(value); chunks.push(chunk); outstanding++; maximum = Math.max(maximum, outstanding)
      const timer = setTimeout(() => { receipts.delete(timer); outstanding--; this.message({ type: 'ack', id: chunk.id, sequence: chunk.sequence }) }, 10)
      receipts.add(timer)
    }
  }
  const fetcher = async url => new Response(String(url).endsWith('status.json') ? JSON.stringify(status) : bytes, { headers: { 'content-type': 'application/json' } })
  const publisher = await startSpectatorPublisher({ sourceUrl: 'http://127.0.0.1:4444/', portalUrl: 'http://127.0.0.1:5555/', channelId: 'test',
    token: 'pub_' + 'a'.repeat(43), WebSocket: Socket, fetch: fetcher, pollIntervalMs: 60000, readyTimeoutMs: 1000 })
  t.after(() => publisher.close())
  socket.message({ type: 'request', id: 1, method: 'GET', path: 'manifest.json' })
  await done
  assert.deepEqual(Buffer.concat(chunks.map(c => c.bytes)), bytes); assert.deepEqual(chunks.map(c => c.sequence), Array.from({ length: 12 }, (_, i) => i))
  assert.equal(outstanding, 0); assert.equal(publisher.state().pendingRequests, 0)
  return { maximum, publisher }
}
test('negotiated bounded window fills four slots while keeping exact bytes/order and waiting for every acknowledgement', async t => {
  const result = await runWindow(t, 4); assert.equal(result.maximum, 4); assert.equal(result.publisher.state().maxInFlightChunks, 4)
})
test('legacy relays without flow negotiation retain stop-and-wait behavior', async t => {
  const result = await runWindow(t, undefined); assert.equal(result.maximum, 1); assert.equal(result.publisher.state().maxInFlightChunks, 1)
})
