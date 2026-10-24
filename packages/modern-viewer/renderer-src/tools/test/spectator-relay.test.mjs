import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createSpectatorRelay } from '../../host/spectator-relay.mjs';
import { startSpectatorPublisher, spectatorAddresses } from '../../host/spectator-publisher.mjs';
import { observationPath, encodeChunk, decodeChunk } from '../../host/spectator-protocol.mjs';
const require = createRequire(import.meta.url), { WebSocketServer } = require('ws');
const uuid = '663f458a-3ec8-3a00-8224-c4a0aea197b5', other = '51669443-a398-3516-a4ff-6fa17dace259';
const build = { browserBundleSha256: 'a'.repeat(64), consoleBundleSha256: 'b'.repeat(64), viewerBuild: 'c'.repeat(64) + ':' + 'd'.repeat(64) };
const token = 'pub_' + 'x'.repeat(43);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function listening(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}/`; }
async function stop(server) { const done = new Promise(resolve => server.close(resolve)); server.closeAllConnections(); await done; }
async function fixture(t, options = {}) {
  let allowed = true, viewAllowed = true;
  const reads = [], streams = new Set();
  const status = { schemaVersion: 1, mode: 'live_same_player_connection', readOnly: true,
    identity: { confirmed: true, playerUuid: options.uuid ?? uuid }, connection: { ended: false },
    viewer: { available: true, registrySha256: 'e'.repeat(64) }, build: { ...build, ...options.build } };
  const data = options.data ?? Buffer.from(JSON.stringify({ 原始素材: '魔法世界🌏'.repeat(40000) }));
  const source = http.createServer((req, res) => {
    reads.push({ method: req.method, url: req.url });
    const headers = type => res.writeHead(200, { 'Content-Type': type });
    if (req.url === '/status.json') { headers('application/json'); res.end(JSON.stringify(status)); }
    else if (req.url === '/manifest.json') { headers(options.badType ? 'text/html' : 'application/json'); res.end(data); }
    else if (req.url === '/events') {
      headers('text/event-stream'); streams.add(res);
      res.write('data: ' + JSON.stringify({ type: 'identity', playerUuid: status.identity.playerUuid }) + '\n\n');
      const timer = setInterval(() => res.write('data: {"type":"frame","mana":23}\n\n'), 30);
      res.on('close', () => { clearInterval(timer); streams.delete(res); });
    } else { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('source should not serve html'); }
  });
  const sourceUrl = await listening(source);
  const site = { build, page: (base, signature, mode) => Buffer.from(`<html><head></head><body>TRUSTED:${base}:${signature}:${mode}</body></html>`),
    file: name => name === 'native-console.js' ? { bytes: Buffer.from('/* trusted script */'), contentType: 'text/javascript' } : null };
  const relay = createSpectatorRelay({ WebSocketServer, site, permissionIntervalMs: 50, authTimeoutMs: 3000,
    authorizePublisher(req, id, supplied) { assert.equal(id, 'channel-a'); if (!allowed || supplied !== token) throw Error('private reason'); return { playerUuid: uuid }; },
    authorizeViewer(req, id) { if (!viewAllowed || id !== 'channel-a' || req.headers.cookie !== 'owner=A') throw Error('private owner reason'); }, ...options.relay });
  const portal = http.createServer((req, res) => { void relay.http(req, res).then(handled => { if (!handled) { res.writeHead(404); res.end(); } }); });
  portal.on('upgrade', (req, socket, head) => { if (!relay.upgrade(req, socket, head)) socket.destroy(); });
  const portalUrl = await listening(portal);
  let publisher;
  t.after(async () => { publisher?.close(); await relay.close(); await Promise.all([stop(portal), stop(source)]); });
  const start = async (options={}) => (publisher = await startSpectatorPublisher({ sourceUrl, portalUrl, channelId: 'channel-a', token, pollIntervalMs: 1000,...options }));
  const get = (route, init = {}) => fetch(new URL('watch/channel-a/' + route, portalUrl), { headers: { cookie: 'owner=A' }, ...init });
  return { sourceUrl, portalUrl, relay, status, data, reads, streams, start, get, revoke: () => { allowed = false; }, revokeViewer: () => { viewAllowed = false; } };
}

test('only bounded relative observation paths are eligible; there is no action/HTML/JS tunnel', () => {
  for (const p of ['events', 'status.json', 'manifest.json', 'assets/minecraft/models/item/apple.json', 'assets/minecraft/textures/block/water_still.png.mcmeta', 'assets/minecraft/shaders/core/rendertype_glint.vsh', 'assets/minecraft/shaders/include/light.glsl', 'api/bundled-appearances/assets/alex.png', 'sounds/minecraft/test.ogg']) assert.ok(observationPath(p), p);
  for (const p of ['../status.json', 'assets/x/../../file.json', '/status.json', 'assets//x.png', 'assets/x/%2e%2e/a.png', 'file:///x.json', 'https://bad/a.json', 'api/command', 'control', 'index.html', 'index.js', 'status.json?token=secret', 'a\\b.json']) assert.equal(observationPath(p), null, p);
});
test('publisher only reads explicit loopback sources and uses TLS for remote sites', () => {
  assert.equal(spectatorAddresses('http://127.0.0.1:3007/', 'https://mc.example.org', 'channel-a').socket.href, 'wss://mc.example.org/api/v1/live/channel-a/source');
  for (const source of ['http://192.168.3.163/', 'http://localhost/', 'http://127.0.0.1/?secret=x', 'http://user:pass@127.0.0.1/']) assert.throws(() => spectatorAddresses(source, 'https://mc.example.org', 'channel-a'));
  assert.throws(() => spectatorAddresses('http://127.0.0.1:3007/', 'http://mc.example.org', 'channel-a'));
});

test('source retirement aborts a pending publisher handshake without leaving a late socket',async t=>{
 const f=await fixture(t),controller=new AbortController();controller.abort();
 await assert.rejects(f.start({signal:controller.signal}),/CANCELLED/);assert.equal(f.reads.length,0);
 const live=new AbortController(),publisher=await f.start({signal:live.signal});live.abort();
 const result=await publisher.done;assert.equal(result.reason,'SPECTATOR_PUBLISHER_CANCELLED');assert.equal(publisher.state().connected,false);
});
test('binary envelope preserves exact bytes and rejects malformed or oversized chunks', () => {
  const data = Buffer.from([0, 255, 4, 9]), value = decodeChunk(encodeChunk(13, 7, data));
  assert.deepEqual(value, { id: 13, sequence: 7, bytes: data });
  assert.throws(() => decodeChunk(Buffer.alloc(8))); assert.throws(() => encodeChunk(0, 0, data));
  assert.throws(() => encodeChunk(1, 0, Buffer.alloc(65537)));
});

test('negotiated independent gzip chunks reduce the uplink and preserve exact Unicode resource bytes', async t => {
  const f = await fixture(t), publisher = await f.start()
  const response = await f.get('manifest.json')
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), f.data)
  const metrics = publisher.state()
  assert.equal(metrics.compression, 'gzip-chunks-v1')
  assert.ok(metrics.transferredWireBytes < metrics.transferredRawBytes / 10)
  assert.equal(metrics.pendingRequests, 0)
})
test('authenticated exact-body publisher serves only operator-built page and JavaScript', async t => {
  const f = await fixture(t); await f.start();
  const page = await f.get(''); assert.equal(page.status, 200); assert.match(await page.text(), /TRUSTED:\/watch\/channel-a\//);
  assert.equal(page.headers.get('content-security-policy').includes("frame-ancestors 'self'"), true);
  const js = await f.get('native-console.js'); assert.equal(await js.text(), '/* trusted script */');
  assert.deepEqual(f.reads.map(r => r.url), ['/status.json']);
  assert.equal(f.relay.state('channel-a').readOnly, true);
});
test('anonymous and another owner cannot fetch private page, data, scripts or textures', async t => {
  const f = await fixture(t); await f.start();
  for (const route of ['', 'status.json', 'native-console.js', 'assets/minecraft/textures/test.png']) {
    for (const headers of [{}, { cookie: 'owner=B' }]) assert.equal((await f.get(route, { headers })).status, 403);
  }
  assert.equal(f.reads.length, 1);
});
test('full Unicode/multiple binary chunks round-trip without writeUTF, encoding or truncation', async t => {
  const f = await fixture(t); await f.start(); const response = await f.get('manifest.json');
  assert.equal(response.status, 200); const actual = Buffer.from(await response.arrayBuffer());
  assert.equal(actual.length, f.data.length);
  assert.equal(createHash('sha256').update(actual).digest('hex'), createHash('sha256').update(f.data).digest('hex'));
});
test('native SSE stays live and browser cancellation releases only that HTTP observation', async t => {
  const f = await fixture(t); const publisher = await f.start(), abort = new AbortController();
  const response = await f.get('events', { headers: { cookie: 'owner=A' }, signal: abort.signal });
  const reader = response.body.getReader(), first = await reader.read();
  assert.match(Buffer.from(first.value).toString(), new RegExp(uuid));
  const next = await reader.read(); assert.match(Buffer.from(next.value).toString(), /frame/);
  abort.abort(); await pause(60); assert.equal(f.streams.size, 0); assert.equal(publisher.state().connected, true);
  assert.equal((await f.get('status.json')).status, 200);
});

test('a paused HTTP consumer bounds the negotiated window, resumes exact bytes and can cancel without retiring the source', async t => {
  const data=Buffer.from(JSON.stringify({content:'x'.repeat(8*1024*1024)})),f=await fixture(t,{data}),publisher=await f.start();
  const response=await new Promise((resolve,reject)=>{const req=http.get(new URL('watch/channel-a/manifest.json',f.portalUrl),{headers:{cookie:'owner=A'}},res=>{res.pause();resolve(res)});req.on('error',reject)});
  await pause(100);assert.equal(publisher.state().connected,true);assert.equal(publisher.state().maxInFlightChunks,4);
  assert.ok(publisher.state().pendingRequests>0,'a paused 8MiB response must hold its bounded sender window');
  const bytes=[];await new Promise((resolve,reject)=>{response.on('data',part=>bytes.push(part));response.on('end',resolve);response.on('error',reject);response.resume()});
  assert.deepEqual(Buffer.concat(bytes),data);assert.equal(publisher.state().connected,true);
  const cancelled=await new Promise((resolve,reject)=>{const req=http.get(new URL('watch/channel-a/manifest.json',f.portalUrl),{headers:{cookie:'owner=A'}},res=>{res.pause();resolve(res)});req.on('error',reject)});
  cancelled.destroy();await pause(100);assert.equal(publisher.state().connected,true);assert.equal(publisher.state().pendingRequests,0);
  assert.equal((await f.get('status.json')).status,200);
});
test('third-person resource paths keep their scoped base and the same data source', async t => {
  const f = await fixture(t); await f.start();
  assert.match(await (await f.get('third/')).text(), /:third/);
  const response = await f.get('third/status.json'); assert.equal((await response.json()).identity.playerUuid, uuid);
  assert.equal(f.reads.at(-1).url, '/status.json');
});
test('publisher UUID and renderer mismatch never make a live channel', async t => {
  for (const options of [{ uuid: other }, { build: { consoleBundleSha256: 'f'.repeat(64) } }]) {
    await t.test(JSON.stringify(options), async sub => {
      const f = await fixture(sub, options); await assert.rejects(f.start()); assert.equal(f.relay.state('channel-a').available, false);
      assert.equal((await f.get('')).status, 503);
    });
  }
});
test('revoking a publisher token closes the stream and rejects subsequent reads', async t => {
  const f = await fixture(t), publisher = await f.start(); f.revoke();
  const result = await publisher.done; assert.equal(result.readOnly, true);
  assert.equal((await f.get('status.json')).status, 503);
});
test('revoking viewer permission terminates an already open SSE without stopping the body source', async t => {
  const f = await fixture(t), publisher = await f.start();
  const response = await f.get('events'), reader = response.body.getReader(); await reader.read();
  f.revokeViewer(); await pause(130);
  let ended = false; try { for (let i = 0; i < 10; i++) { if ((await reader.read()).done) { ended = true; break; } } } catch { ended = true; }
  assert.equal(ended, true); assert.equal(f.streams.size, 0); assert.equal(publisher.state().connected, true);
});
test('HTML returned as an asset cannot execute on the website origin', async t => {
  const f = await fixture(t, { badType: true }); await f.start();
  const response = await f.get('manifest.json'); assert.equal(response.status, 502);
  assert.equal((await response.json()).reason, 'SPECTATOR_SOURCE_RESOURCE_UNAVAILABLE');
});
test('unsupported routes and all mutation methods are rejected without reaching the source', async t => {
  const f = await fixture(t); await f.start();
  for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await f.get('status.json', { method })).status, 400);
  for (const route of ['api/command', 'control', 'evil.js', 'status.json?token=x']) assert.notEqual((await f.get(route)).status, 200);
  assert.deepEqual(f.reads.map(r => r.url), ['/status.json']);
});
test('one publisher per role channel; reconnect works after the old stream closes', async t => {
  const f = await fixture(t), first = await f.start();
  await assert.rejects(f.start()); assert.equal(first.state().connected, true);
  first.close(); await first.done; await pause(50);
  const next = await f.start(); assert.equal(next.state().playerUuid, uuid);
});
test('bounded simultaneous native viewers return a clear limit rather than growing without bound', async t => {
  const f = await fixture(t, { relay: { maxViewers: 1 } }); await f.start();
  const abort = new AbortController(), response = await f.get('events', { headers: { cookie: 'owner=A' }, signal: abort.signal });
  await response.body.getReader().read(); assert.equal((await f.get('events')).status, 429); abort.abort();
});
