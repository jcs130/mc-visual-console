import { SPECTATOR_PROTOCOL, CHUNK_BYTES, MAX_BODY_BYTES, CHANNEL_PATTERN,
  observationPath, validatedSource, encodeChunk } from './spectator-protocol.mjs';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
const compress = promisify(gzip);

const loopback = hostname => ['127.0.0.1', '[::1]'].includes(hostname);
export function spectatorAddresses(sourceUrl, portalUrl, channelId) {
  const source = new URL(sourceUrl), portal = new URL(portalUrl);
  if (source.protocol !== 'http:' || !loopback(source.hostname) || source.username || source.password
      || source.pathname !== '/' || source.search || source.hash) throw Error('SPECTATOR_SOURCE_MUST_BE_LOOPBACK');
  if (portal.protocol !== 'https:' && !(portal.protocol === 'http:' && loopback(portal.hostname))
      || portal.username || portal.password || portal.pathname !== '/' || portal.search || portal.hash
      || !CHANNEL_PATTERN.test(channelId ?? '')) throw Error('SPECTATOR_PORTAL_URL_INVALID');
  portal.protocol = portal.protocol === 'https:' ? 'wss:' : 'ws:';
  portal.pathname = `/api/v1/live/${channelId}/source`;
  return { source, socket: portal };
}

function sourceHeader(value) {
  return { schemaVersion: value.schemaVersion, readOnly: value.readOnly, mode: value.mode,
    identity: { confirmed: value.identity?.confirmed, playerUuid: value.identity?.playerUuid },
    connection: { ended: value.connection?.ended }, viewer: { available: value.viewer?.available, registrySha256: value.viewer?.registrySha256 },
    build: { viewerBuild: value.build?.viewerBuild, browserBundleSha256: value.build?.browserBundleSha256, consoleBundleSha256: value.build?.consoleBundleSha256 } };
}

/** Adds an outbound observation stream to a viewer already observing the action
 * body. It neither imports Mineflayer nor logs into Minecraft nor runs a model.
 * Close affects only this publisher and its own loopback HTTP reads.
 */
export async function startSpectatorPublisher({ sourceUrl, portalUrl, channelId, token,
  WebSocket: Socket = globalThis.WebSocket, fetch: fetcher = globalThis.fetch,
  pollIntervalMs = 3000, readyTimeoutMs = 12000, signal }) {
  const { source, socket } = spectatorAddresses(sourceUrl, portalUrl, channelId);
  if (!/^pub_[A-Za-z0-9_-]{43}$/.test(token ?? '') || typeof Socket !== 'function') throw Error('SPECTATOR_PUBLISHER_CONFIGURATION');
  if(signal?.aborted)throw Error('SPECTATOR_PUBLISHER_CANCELLED');
  const ws = new Socket(socket), requests = new Map(), waits = new Map();
  let closed = false, ready = false, binding = null, poll = null, polling = false, lastError = null;
  let transferredRawBytes = 0, transferredWireBytes = 0;
  let resolveReady, rejectReady, resolveDone;
  const connected = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const done = new Promise(resolve => { resolveDone = resolve; });
  const send = value => { if (ws.readyState === 1) ws.send(JSON.stringify(value)); };
  function close(reason = 'SPECTATOR_PUBLISHER_CLOSED') {
    if (closed) return;
    closed = true; clearInterval(poll); clearTimeout(deadline);
    signal?.removeEventListener('abort',abort);
    for (const controller of requests.values()) controller.abort(); requests.clear();
    for (const wait of waits.values()) { clearTimeout(wait.timer); wait.reject(Error(reason)); } waits.clear();
    if (ws.readyState === 0 || ws.readyState === 1) ws.close(1000, 'publisher closed');
    if (!ready) rejectReady(Error(reason));
    resolveDone({ reason, readOnly: true });
  }
  const deadline = setTimeout(() => close('SPECTATOR_PUBLISHER_READY_TIMEOUT'), readyTimeoutMs);
  deadline.unref?.();
  const abort=()=>close('SPECTATOR_PUBLISHER_CANCELLED');
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)abort();
  async function readStatus() {
    const response = await fetcher(new URL('status.json', source), { redirect: 'error', signal: AbortSignal.timeout(6000) });
    if (response.status !== 200 || response.headers.get('content-type')?.split(';')[0] !== 'application/json') throw Error('SPECTATOR_SOURCE_STATUS_UNAVAILABLE');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 1024 * 1024) throw Error('SPECTATOR_SOURCE_STATUS_LIMIT');
    const status = JSON.parse(bytes.toString('utf8'));
    validatedSource(status, binding.playerUuid, binding.build);
    return sourceHeader(status);
  }
  async function publishStatus() {
    if (polling || closed) return;
    polling = true;
    try { send({ type: 'source', status: await readStatus() }); }
    catch (e) { lastError = e.message; close('SPECTATOR_SOURCE_UNAVAILABLE'); }
    finally { polling = false; }
  }
  async function sendPart(id, sequence, part, signal, encoding) {
    if (closed || signal.aborted) throw Error('SPECTATOR_REQUEST_CANCELLED');
    let wire = encodeChunk(id, sequence, part);
    if (encoding === 'gzip-chunks-v1') wire = Buffer.concat([wire.subarray(0, 8), await compress(part, { level: 3 })]);
    if (closed || signal.aborted) throw Error('SPECTATOR_REQUEST_CANCELLED');
    const key = `${id}:${sequence}`;
    let complete, failed;
    const acknowledged = new Promise((resolve, reject) => { complete = resolve; failed = reject; });
    const abort = () => {
      const waiter = waits.get(key);
      if (waiter) { waits.delete(key); clearTimeout(waiter.timer); waiter.reject(Error('SPECTATOR_REQUEST_CANCELLED')); }
    };
    const timer = setTimeout(() => { waits.delete(key); failed(Error('SPECTATOR_ACK_TIMEOUT')); }, 15000);
    timer.unref?.(); waits.set(key, { resolve: complete, reject: failed, timer });
    signal.addEventListener('abort', abort, { once: true });
    // Keep compression/sends ordered, but do not idle for a network round trip
    // after every small SSE/asset chunk. A negotiated four-chunk window is
    // bounded to 256 KiB/request and still stops completely at HTTP backpressure.
    const receipt = acknowledged.finally(() => { clearTimeout(timer); waits.delete(key); signal.removeEventListener('abort', abort); });
    void receipt.catch(() => {}); // A later window receipt may fail before its turn to be awaited.
    try { ws.send(wire); transferredRawBytes += part.length; transferredWireBytes += wire.length - 8; }
    catch (error) { failed(error); throw error; }
    return { receipt };
  }
  async function serve(value) {
    const contentType = observationPath(value.path);
    if (!Number.isInteger(value.id) || value.id < 1 || value.id > 0xffffffff || value.method !== 'GET'
        || !contentType || requests.has(value.id) || requests.size >= 32) throw Error('SPECTATOR_REQUEST_REJECTED');
    const controller = new AbortController(); requests.set(value.id, controller);
    let reader;
    try {
      const response = await fetcher(new URL(value.path, source), { redirect: 'error', signal: controller.signal });
      const actualType = response.headers.get('content-type')?.split(';')[0]?.trim();
      // Older native hosts used application/json for all hash-checked non-PNG
      // files, including original GLSL. Preserve its bytes as inert text/plain.
      const legacyShaderType = contentType === 'text/plain' && actualType === 'application/json';
      if (response.status !== 200 || actualType !== contentType && !legacyShaderType) {
        send({ type: 'response', id: value.id, status: response.status === 404 ? 404 : 502, contentType });
        await response.body?.cancel(); return;
      }
      if (value.path !== 'events' && Number(response.headers.get('content-length')) > MAX_BODY_BYTES) throw Error('SPECTATOR_BODY_LIMIT');
      // Independent chunks have no cross-request compression dictionary. PNG
      // and OGG are already compressed; JSON/SSE benefit most on the home uplink.
      const encoding = binding.compression === 'gzip-chunks-v1' && ['application/json', 'text/event-stream', 'text/plain'].includes(contentType) ? 'gzip-chunks-v1' : 'identity';
      send({ type: 'response', id: value.id, status: 200, contentType, encoding });
      reader = response.body.getReader();
      let size = 0, sequence = 0;
      const inFlight = [], window = binding.maxInFlightChunks ?? 1;
      for (;;) {
        const { done: ended, value: bytes } = await reader.read();
        if (ended) break;
        size += bytes.length;
        if (value.path !== 'events' && size > MAX_BODY_BYTES) throw Error('SPECTATOR_BODY_LIMIT');
        for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
          const { receipt } = await sendPart(value.id, sequence++, Buffer.from(bytes.subarray(offset, offset + CHUNK_BYTES)), controller.signal, encoding);
          inFlight.push(receipt);
          if (inFlight.length >= window) await inFlight.shift();
        }
      }
      await Promise.all(inFlight);
      send({ type: 'end', id: value.id });
    } catch {
      if (!closed && !controller.signal.aborted) send({ type: 'error', id: value.id });
    } finally { requests.delete(value.id); await reader?.cancel().catch(() => {}); }
  }
  ws.addEventListener('open', () => send({ type: 'auth', protocol: SPECTATOR_PROTOCOL, token }));
  ws.addEventListener('error', () => close('SPECTATOR_TRANSPORT_ERROR'));
  ws.addEventListener('close', () => close('SPECTATOR_TRANSPORT_CLOSED'));
  ws.addEventListener('message', event => {
    void (async () => {
      if (closed || typeof event.data !== 'string' || event.data.length > 65536) return;
      const value = JSON.parse(event.data);
      if (value.type === 'ready') {
        if (binding || value.protocol !== SPECTATOR_PROTOCOL) throw Error('SPECTATOR_PROTOCOL_REJECTED');
        if (value.maxInFlightChunks !== undefined && (!Number.isSafeInteger(value.maxInFlightChunks) || value.maxInFlightChunks < 1 || value.maxInFlightChunks > 4)) throw Error('SPECTATOR_PROTOCOL_REJECTED');
        binding = value; await publishStatus();
      } else if (value.type === 'accepted') {
        if (!binding) throw Error('SPECTATOR_PROTOCOL_REJECTED');
        if (!ready) {
          ready = true; clearTimeout(deadline); poll = setInterval(publishStatus, pollIntervalMs); poll.unref?.();
          resolveReady({ done, close, state: () => ({ connected: !closed, readOnly: true, playerUuid: binding.playerUuid, lastError, pendingRequests: requests.size,
            transferredRawBytes, transferredWireBytes, compression: binding.compression ?? 'identity', maxInFlightChunks: binding.maxInFlightChunks ?? 1 }) });
        }
      } else if (value.type === 'request') {
        if (!ready) throw Error('SPECTATOR_SOURCE_NOT_READY');
        // Concurrent observation reads are bounded; no command can be tunneled.
        void serve(value).catch(() => close('SPECTATOR_REQUEST_REJECTED'));
      } else if (value.type === 'cancel') requests.get(value.id)?.abort();
      else if (value.type === 'ack') {
        const wait = waits.get(`${value.id}:${value.sequence}`);
        if (wait) { clearTimeout(wait.timer); waits.delete(`${value.id}:${value.sequence}`); wait.resolve(); }
      } else throw Error('SPECTATOR_PROTOCOL_REJECTED');
    })().catch(() => close('SPECTATOR_PROTOCOL_REJECTED'));
  });
  return connected;
}
