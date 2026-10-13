import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Server } from 'socket.io';
import { io } from 'socket.io-client';
import { createViewerControlBridge } from '../host/viewer-control.mjs';

async function fixture(t, overrides = {}) {
  const calls = [], http = createServer(), server = new Server(http), clients = [];
  const bridge = createViewerControlBridge({
    adapter: { identity: () => ({ uuid: 'fixture', username: 'ag_fixture', entityId: 7 }), ready: () => true,
      stop: () => calls.push('stop'), motion: input => calls.push(input), action: async () => ({ ok: true, status: 'sent' }), ...overrides.adapter },
    authorize: socket => socket.handshake.auth.testPermission === 'allow',
    acquire: async () => calls.push('pause'), release: async () => calls.push('resume'), ...overrides,
  });
  server.on('connection', socket => bridge.subscribeSocket(socket));
  http.listen(0, '127.0.0.1'); await once(http, 'listening');
  t.after(async () => { for (const client of clients) client.disconnect(); await bridge.dispose(); await new Promise(r => server.close(r)); });
  async function connect(allow = true) {
    const client = io(`http://127.0.0.1:${http.address().port}`, { autoConnect: false, reconnection: false,
      transports: ['websocket'], auth: { testPermission: allow ? 'allow' : 'deny' } });
    clients.push(client); let state, sequence = 0;
    client.on('viewerControlState', value => { state = value; });
    const first = once(client, 'viewerControlState'); client.connect(); await first;
    return { client, state: () => state, request: (type, data = {}) => client.timeout(1500).emitWithAck('viewerControl',
      { schemaVersion: 1, type, epoch: state?.epoch, sequence: ++sequence, ...data }) };
  }
  return { bridge, calls, connect };
}

test('real Socket.IO clients share one actor lease and cannot drive without host authorization', { timeout: 6000 }, async t => {
  const h = await fixture(t), denied = await h.connect(false), a = await h.connect(), b = await h.connect();
  assert.equal((await denied.request('acquire')).reason, 'not_authorized'); assert.deepEqual(h.calls, []);
  assert.equal((await a.request('acquire')).status, 'active'); assert.equal(a.state().actor.username, 'ag_fixture');
  assert.equal((await b.request('acquire')).reason, 'control_busy');
  assert.equal((await a.request('motion', { input: { forward: 1, strafe: 0, cameraYaw: 0 } })).status, 'applied');
  const released = once(b.client, 'viewerControlState'); a.client.disconnect(); await released;
  assert.equal(h.bridge.snapshot().active, false);
});

test('real transport cancellation during a pending native write holds Agent handoff until settlement', { timeout: 6000 }, async t => {
  let finish;
  const adapter = { identity: () => ({ uuid: 'own', username: 'ag_fixture', entityId: 7 }), ready: () => true,
    stop() {}, motion() {}, action: () => new Promise(resolve => { finish = resolve; }) };
  const h = await fixture(t, { adapter }), a = await h.connect(); await a.request('acquire');
  const actionStarted = once(a.client, 'viewerControlState'); const action = a.request('secondary', { pressed: true }); await actionStarted;
  await a.request('release'); assert.equal(h.calls.includes('resume'), false);
  assert.equal((await a.request('acquire')).reason, 'control_busy');
  finish({ ok: true, status: 'confirmed' }); assert.equal((await action).status, 'unknown');
  assert.equal((await a.request('acquire')).status, 'active'); assert.equal(h.calls.filter(v => v === 'resume').length, 1);
});

test('real transport cancellation while the host pauses its Agent grants no late control', { timeout: 6000 }, async t => {
  let finish, entered; const started = new Promise(r => { entered = r; });
  const h = await fixture(t, { acquire: () => { entered(); return new Promise(r => { finish = r; }); } }), a = await h.connect();
  const acquire = a.request('acquire'); await started;
  await a.request('release'); finish(); assert.equal((await acquire).reason, 'acquire_cancelled');
  assert.equal(h.bridge.snapshot().active, false); assert.equal(h.calls.filter(v => v === 'resume').length, 1);
});
