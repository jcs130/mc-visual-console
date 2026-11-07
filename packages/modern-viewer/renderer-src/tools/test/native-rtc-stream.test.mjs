import test from 'node:test'
import assert from 'node:assert/strict'
import { createNativeRtcDecoder, validNativeRtcDescription, NATIVE_RTC_PROTOCOL, NATIVE_RTC_EVENT_BYTES } from '../../src/native-viewer/native-rtc-protocol.js'
import { createNativeEventStream } from '../../src/native-viewer/native-event-stream.js'

const sdp = 'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n'
const tick = () => new Promise(resolve => setImmediate(resolve))
const bytes = value => new TextEncoder().encode('data: ' + JSON.stringify(value) + '\n\n')
const capabilities = { schemaVersion: 1, protocol: NATIVE_RTC_PROTOCOL, enabled: true, readOnly: true,
  iceServers: [], maxChunkBytes: 16384, maxEventBytes: NATIVE_RTC_EVENT_BYTES }

test('ordered chunks preserve large original state and UTF-8 across every boundary', () => {
  const expected = [{ type: 'identity', player: '可米🌏' }, { type: 'snapshot', epoch: 7, terrainSequence: 22,
    item: { id: 'touhou_little_maid:maid_info', components: { name: '大背包', profile: '原始纹理' } }, data: '魔法🌏'.repeat(10000) }]
  const wire = Buffer.concat(expected.map(bytes)), received = [], decoder = createNativeRtcDecoder(event => received.push(JSON.parse(event.data)))
  for (let offset = 0; offset < wire.length; offset += 16381) decoder.receive(wire.subarray(offset, offset + 16381))
  assert.deepEqual(received, expected); assert.equal(decoder.bufferedBytes, 0)
  decoder.close(); decoder.receive(bytes({ ignored: true })); assert.equal(received.length, 2)
})

test('SSE comments, CRLF and multiline data preserve ordinary event semantics', () => {
  const received = [], decoder = createNativeRtcDecoder(event => received.push(event.data))
  decoder.receive(new TextEncoder().encode(':alive\r\n\r\ndata: {"type":\r\ndata: "identity"}\r\n\r\n'))
  assert.deepEqual(received, ['{"type":\n"identity"}'])
})

test('invalid binary, over-budget messages, malformed UTF-8 and unterminated events fail closed', () => {
  for (const value of ['text', new Uint8Array(0), new Uint8Array(16385), new Uint8Array([255])]) {
    assert.throws(() => createNativeRtcDecoder(() => {}).receive(value))
  }
  const decoder = createNativeRtcDecoder(() => { throw Error('must not emit an incomplete event') })
  const chunk = new Uint8Array(16384).fill(65)
  for (let i = 0; i < NATIVE_RTC_EVENT_BYTES / chunk.length; i++) decoder.receive(chunk)
  assert.throws(() => decoder.receive(new Uint8Array([65])), /EVENT_LIMIT/)
})

test('signaling accepts a data-only SDP and rejects media, wrong kinds and oversized input', () => {
  assert.equal(validNativeRtcDescription({ type: 'offer', sdp }, 'offer'), true)
  for (const value of [{ type: 'answer', sdp }, { type: 'offer', sdp: sdp + 'm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' },
    { type: 'offer', sdp: 'v=0\r\nm=video 9 RTP/AVP 96\r\n' }, { type: 'offer', sdp: sdp + 'x'.repeat(65536) }]) {
    assert.equal(validNativeRtcDescription(value, 'offer'), false)
  }
})

function fixture({ status = 200, fetchHook = null } = {}) {
  const sources = [], peers = [], requests = [], messages = [], unavailable = [], transports = [], timers = new Map()
  let timerId = 0
  class Source {
    constructor(url) { this.url = url; this.readyState = 1; sources.push(this) }
    close() { this.readyState = 2 }
    message(value) { this.onmessage?.({ data: JSON.stringify(value) }) }
  }
  class Peer {
    constructor() { peers.push(this); this.iceGatheringState = 'complete'; this.connectionState = 'new' }
    createDataChannel(label, options) {
      this.channel = { label, ...options, readyState: 'connecting', close() { this.readyState = 'closed'; this.onclose?.() } }
      return this.channel
    }
    async createOffer() { return { type: 'offer', sdp } }
    async setLocalDescription(value) { this.localDescription = value }
    async setRemoteDescription(value) { this.remoteDescription = value; this.channel.readyState = 'open' }
    close() { this.connectionState = 'closed' }
    message(value) { this.channel.onmessage?.({ data: bytes(value) }) }
  }
  const stream = createNativeEventStream({ url: '/watch/body/events', statusUrl: '/watch/body/status.json', rtcUrl: '/watch/body/webrtc',
    RTCPeerConnection: Peer, EventSource: Source, onMessage: event => messages.push(JSON.parse(event.data)),
    onUnavailable: value => unavailable.push(value), onTransport: value => transports.push(value),
    setTimer: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id }, clearTimer: id => timers.delete(id),
    fetch: async (url, init) => {
      requests.push({ url, init })
      if (fetchHook) return fetchHook(url, init)
      return new Response(JSON.stringify(init.method === 'POST' ? { schemaVersion: 1, protocol: NATIVE_RTC_PROTOCOL, type: 'answer', sdp } : capabilities),
        { status, headers: { 'Content-Type': 'application/json' } })
    } })
  return { stream, sources, peers, requests, messages, unavailable, transports, timers }
}

test('SSE stays usable while connecting; only fresh RTC identity commits the switch', async () => {
  const f = fixture(); await tick()
  f.sources[0].message({ type: 'identity', player: 'old source' })
  assert.equal(f.sources[0].readyState, 1); assert.equal(f.peers[0].channel.ordered, true)
  const oldCallback = f.sources[0].onmessage
  f.peers[0].message({ type: 'identity', player: 'same body' })
  assert.equal(f.sources[0].readyState, 2); assert.equal(f.transports.at(-1).transport, 'webrtc')
  oldCallback({ data: '{"type":"late stale snapshot"}' })
  f.peers[0].message({ type: 'snapshot', epoch: 2, terrainSequence: 8 })
  assert.equal(f.messages.length, 3); assert.equal(f.messages.at(-1).terrainSequence, 8)
  assert.ok(f.requests.every(row => row.url === '/watch/body/webrtc'))
  f.stream.close(); assert.equal(f.timers.size, 0); assert.equal(f.peers[0].connectionState, 'closed')
})

test('RTC disconnect falls back once to the original read-only stream and ignores late RTC data', async () => {
  const f = fixture(); await tick(); f.peers[0].message({ type: 'identity' })
  const late = f.peers[0].channel.onmessage
  f.peers[0].channel.close()
  assert.equal(f.sources.length, 2); assert.equal(f.sources[1].url, '/watch/body/events')
  late({ data: bytes({ type: 'snapshot', epoch: 99 }) })
  f.sources[1].message({ type: 'identity', epoch: 3 })
  assert.equal(f.messages.length, 2); assert.equal(f.peers.length, 1)
  assert.equal(f.transports.at(-1).phase, 'fallback'); assert.deepEqual(f.unavailable, ['NATIVE_WORLD_STREAM_DISCONNECTED'])
  f.stream.close(); assert.equal(f.timers.size, 0)
})

for (const status of [401, 403]) test(`RTC authorization ${status} stops both transports`, async () => {
  const f = fixture({ status }); await tick()
  assert.equal(f.stream.readyState, 2); assert.equal(f.sources[0].readyState, 2); assert.equal(f.peers.length, 0)
  assert.deepEqual(f.unavailable, ['NATIVE_WORLD_STREAM_UNAUTHORIZED']); assert.equal(f.timers.size, 0)
})

test('disabled RTC, bad negotiation and first-packet mismatch retain working SSE', async () => {
  const disabled = fixture({ status: 404 }); await tick()
  assert.equal(disabled.sources[0].readyState, 1); assert.equal(disabled.peers.length, 0); disabled.stream.close()
  const invalid = fixture(); await tick(); invalid.peers[0].message({ type: 'snapshot' })
  assert.equal(invalid.sources.length, 1); assert.equal(invalid.sources[0].readyState, 1)
  assert.equal(invalid.messages.length, 0); assert.equal(invalid.peers[0].connectionState, 'closed'); invalid.stream.close()
})

test('closing while signaling is pending aborts fetch and rejects late completion', async () => {
  let finish
  const f = fixture({ fetchHook: () => new Promise(resolve => { finish = resolve }) })
  f.stream.close(); assert.equal(f.requests[0].init.signal.aborted, true)
  finish(new Response(JSON.stringify(capabilities), { headers: { 'Content-Type': 'application/json' } })); await tick()
  assert.equal(f.peers.length, 0); assert.equal(f.messages.length, 0); assert.equal(f.timers.size, 0)
})

test('negotiation deadline keeps SSE and does not initiate an automatic second attempt', async () => {
  const f = fixture(); await tick()
  const [id, timer] = [...f.timers].find(([, timer]) => timer.ms === 15000)
  f.timers.delete(id); timer.fn()
  assert.equal(f.sources[0].readyState, 1); assert.equal(f.peers.length, 1)
  assert.equal(f.transports.at(-1).reason, 'NATIVE_RTC_TIMEOUT'); assert.equal(f.timers.size, 0)
  f.stream.close()
})
