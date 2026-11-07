import http from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { createSpectatorRelay } from '../../../host/spectator-relay.mjs';
import { startSpectatorPublisher } from '../../../host/spectator-publisher.mjs';
const require = createRequire(import.meta.url), { WebSocketServer } = require('ws');
export const wireUuid = '663f458a-3ec8-3a00-8224-c4a0aea197b5';
const build = { browserBundleSha256: 'a'.repeat(64), consoleBundleSha256: 'b'.repeat(64), viewerBuild: 'c'.repeat(64) + ':' + 'd'.repeat(64) };
const token = 'pub_' + 'q'.repeat(43);
// Werift defaults to an external STUN server even with an empty ICE list.
// This local-only fixture explicitly bounds an unavailable loopback STUN read;
// it still performs real UDP ICE, DTLS and SCTP, without depending on the WAN.
export const loopbackIce = { iceServers: [{ urls: 'stun:127.0.0.1:9' }], iceStunGatherTimeout: 0.05,
  iceInterfaceAddresses: { udp4: '127.0.0.1' }, iceUseIpv6: false, iceUseTcp: false };
export const wireSnapshot = { type: 'snapshot', epoch: 1, terrainSequence: 1, registrySha256: 'e'.repeat(64),
  groups: [], presentation: { self: { health: 13, food: 17 }, inventory: { playerUuid: wireUuid,
    slots: [{ slot: 36, id: 'minecraft:player_head', customName: '大背包', originalComponents: '纹理🌏'.repeat(20000) }] } } };

export async function createWireFixture(Peer, { route = null, rtc = true } = {}) {
  let ownerAllowed = true, publisher, streamReads = 0, serial = 0;
  const peers = [], active = new Set(), status = { schemaVersion: 1, readOnly: true, mode: 'live_same_player_connection',
    identity: { confirmed: true, playerUuid: wireUuid }, connection: { ended: false }, viewer: { available: true, registrySha256: 'e'.repeat(64) }, build };
  const source = http.createServer((req, res) => {
    if (req.url === '/status.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(status)); return; }
    if (req.url !== '/events') { res.writeHead(404); res.end(); return; }
    streamReads++; active.add(res); res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: ' + JSON.stringify({ type: 'identity', playerUuid: wireUuid, confirmed: true, epoch: 1 }) + '\n\n');
    res.write('data: ' + JSON.stringify(wireSnapshot) + '\n\n');
    res.write('data: ' + JSON.stringify({ type: 'agent_visual', epoch: 1, value: { private: 'OWNER_ONLY_WIRE_FIXTURE' } }) + '\n\n');
    const timer = setInterval(() => res.write('data: ' + JSON.stringify({ type: 'motion', epoch: 1, sequence: ++serial,
      capturedAt: Date.now(), motion: { x: 12, y: 65, z: -8 } }) + '\n\n'), 50);
    res.on('close', () => { clearInterval(timer); active.delete(res); });
  });
  source.listen(0, '127.0.0.1'); await once(source, 'listening');
  const sourceUrl = `http://127.0.0.1:${source.address().port}/`;
  const site = { build, page: () => Buffer.from('<!doctype html><title>Transport fixture</title>'), file: () => null };
  const relay = createSpectatorRelay({ WebSocketServer, site, sharedStreams: true, maxViewers: 8, permissionIntervalMs: 50,
    authorizePublisher: (_req, id, supplied) => { if (id !== 'wire-body' || supplied !== token) throw Error('denied'); return { playerUuid: wireUuid }; },
    authorizeViewer: (req, id) => {
      if (id !== 'wire-body') throw Error('denied');
      if (req.headers.cookie === 'owner=A') { if (!ownerAllowed) throw Error('revoked'); return { scope: 'owner' }; }
      return { scope: 'scene' };
    },
    webRtc: rtc ? { createPeerConnection: () => { const peer = new Peer(loopbackIce); peers.push(peer); return peer; } } : null });
  const portal = http.createServer((req, res) => {
    void (async () => { if (await route?.(req, res)) return; if (!await relay.http(req, res)) { res.writeHead(404); res.end(); } })()
      .catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
  });
  portal.on('upgrade', (req, socket, head) => { if (!relay.upgrade(req, socket, head)) socket.destroy(); });
  portal.listen(0, '127.0.0.1'); await once(portal, 'listening');
  const portalUrl = `http://127.0.0.1:${portal.address().port}/`;
  publisher = await startSpectatorPublisher({ sourceUrl, portalUrl, channelId: 'wire-body', token, pollIntervalMs: 1000 });
  const authorizedFetch = (url, init = {}) => fetch(url, { ...init, headers: { ...init.headers, cookie: 'owner=A' } });
  return { portalUrl, relay, peers, authorizedFetch, get streamReads() { return streamReads; },
    revoke: () => { ownerAllowed = false; },
    async close() {
      publisher.close(); await relay.close();
      await Promise.all(peers.map(peer => peer.close()));
      for (const server of [portal, source]) { const closing = new Promise(resolve => server.close(resolve)); server.closeAllConnections(); await closing; }
    } };
}
