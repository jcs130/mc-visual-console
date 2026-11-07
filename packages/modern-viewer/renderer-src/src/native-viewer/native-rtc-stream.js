import { NATIVE_RTC_PROTOCOL, NATIVE_RTC_LABEL, NATIVE_RTC_CHUNK_BYTES, NATIVE_RTC_EVENT_BYTES,
  NATIVE_RTC_SDP_BYTES, validNativeRtcDescription, createNativeRtcDecoder } from './native-rtc-protocol.js'

/** A single bounded upgrade attempt. Failure never retries a game operation. */
export function createNativeRtcStream({ url, onMessage, onFailure,
  RTCPeerConnection: Peer = globalThis.RTCPeerConnection, fetch: fetcher = globalThis.fetch,
  timeoutMs = 15000, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = id => clearTimeout(id) }) {
  if (typeof url !== 'string' || typeof onMessage !== 'function' || typeof onFailure !== 'function' || typeof fetcher !== 'function'
      || !Number.isFinite(timeoutMs) || timeoutMs < 50 || timeoutMs > 30000) throw Error('NATIVE_RTC_OPTIONS_INVALID')
  let closed = false, pc = null, channel = null, firstMessage = false, lastMessage = Date.now(), idleTimer = null
  const request = new AbortController(), decoder = createNativeRtcDecoder(message => {
    if (closed) return
    if (!firstMessage) {
      const value = JSON.parse(message.data)
      if (value?.type !== 'identity') throw Error('NATIVE_RTC_IDENTITY_REQUIRED')
      firstMessage = true; clearTimer(deadline)
    }
    lastMessage = Date.now(); onMessage(message)
  })
  function close() {
    if (closed) return
    closed = true; request.abort(); clearTimer(deadline); clearTimer(idleTimer); decoder.close()
    try { channel?.close() } catch {}
    try { void Promise.resolve(pc?.close()).catch(() => {}) } catch {}
  }
  function fail(reason) { if (closed) return; close(); onFailure(reason) }
  const deadline = setTimer(() => fail('NATIVE_RTC_TIMEOUT'), timeoutMs)
  function checkIdle() {
    if (closed) return
    if (firstMessage && Date.now() - lastMessage > 12000) { fail('NATIVE_RTC_STALE'); return }
    idleTimer = setTimer(checkIdle, 3000)
  }
  async function json(response, maxBytes) {
    if (response.status === 401 || response.status === 403) throw Error('NATIVE_WORLD_STREAM_UNAUTHORIZED')
    if (!response.ok) { void Promise.resolve(response.body?.cancel?.()).catch(() => {}); throw Error('NATIVE_RTC_UNAVAILABLE') }
    if (response.headers.get('content-type')?.split(';')[0] !== 'application/json') throw Error('NATIVE_RTC_RESPONSE_INVALID')
    const reader = response.body.getReader(), chunks = []
    let length = 0
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break
        length += value.byteLength
        if (length > maxBytes) throw Error('NATIVE_RTC_RESPONSE_LIMIT')
        chunks.push(value)
      }
      const bytes = new Uint8Array(length); let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    } finally { await reader.cancel().catch(() => {}) }
  }
  async function start() {
    if (typeof Peer !== 'function') throw Error('NATIVE_RTC_UNSUPPORTED')
    const capabilities = await json(await fetcher(url, { cache: 'no-store', redirect: 'error', signal: request.signal }), 8192)
    if (closed) return
    if (capabilities.schemaVersion !== 1 || capabilities.protocol !== NATIVE_RTC_PROTOCOL || capabilities.enabled !== true
        || capabilities.readOnly !== true || capabilities.maxChunkBytes !== NATIVE_RTC_CHUNK_BYTES
        || capabilities.maxEventBytes !== NATIVE_RTC_EVENT_BYTES || !Array.isArray(capabilities.iceServers)
        || capabilities.iceServers.length > 8) throw Error('NATIVE_RTC_CAPABILITIES_INVALID')
    pc = new Peer({ iceServers: capabilities.iceServers })
    channel = pc.createDataChannel(NATIVE_RTC_LABEL, { ordered: true, protocol: NATIVE_RTC_PROTOCOL })
    channel.binaryType = 'arraybuffer'
    channel.onmessage = event => { if (!closed) try { decoder.receive(event.data) } catch { fail('NATIVE_RTC_STREAM_INVALID') } }
    channel.onclose = channel.onerror = () => fail('NATIVE_RTC_DISCONNECTED')
    pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) fail('NATIVE_RTC_DISCONNECTED') }
    // This passive connection accepts exactly the channel we created.
    pc.ondatachannel = () => fail('NATIVE_RTC_CHANNEL_INVALID')
    await pc.setLocalDescription(await pc.createOffer())
    if (closed) return
    if (pc.iceGatheringState !== 'complete') await new Promise((resolve, reject) => {
      const abort = () => { pc.onicegatheringstatechange = null; reject(Error('NATIVE_RTC_CANCELLED')) }
      request.signal.addEventListener('abort', abort, { once: true })
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.onicegatheringstatechange = null; request.signal.removeEventListener('abort', abort); resolve()
        }
      }
      if (request.signal.aborted) abort(); else pc.onicegatheringstatechange()
    })
    if (closed) return
    const offer = pc.localDescription
    if (!validNativeRtcDescription(offer, 'offer')) throw Error('NATIVE_RTC_OFFER_INVALID')
    const answer = await json(await fetcher(url, { method: 'POST', cache: 'no-store', redirect: 'error', signal: request.signal,
      headers: { 'Content-Type': 'application/json', 'X-Mcvisual-Transport': NATIVE_RTC_PROTOCOL },
      body: JSON.stringify({ protocol: NATIVE_RTC_PROTOCOL, type: 'offer', sdp: offer.sdp }) }), NATIVE_RTC_SDP_BYTES + 8192)
    if (closed) return
    if (answer.schemaVersion !== 1 || answer.protocol !== NATIVE_RTC_PROTOCOL || !validNativeRtcDescription(answer, 'answer')) throw Error('NATIVE_RTC_ANSWER_INVALID')
    await pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp })
    if (!closed) checkIdle()
  }
  void start().catch(error => fail(error.message === 'NATIVE_WORLD_STREAM_UNAUTHORIZED' ? error.message : 'NATIVE_RTC_UNAVAILABLE'))
  return { close, get readyState() { return closed ? 2 : firstMessage ? 1 : 0 } }
}
