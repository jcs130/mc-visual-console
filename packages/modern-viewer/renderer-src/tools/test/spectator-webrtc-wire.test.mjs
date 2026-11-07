import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createNativeRtcStream } from '../../src/native-viewer/native-rtc-stream.js';
import { createWireFixture, loopbackIce, wireUuid, wireSnapshot } from './helpers/spectator-webrtc-fixture.mjs';

// The library injects its backend. CI/consumers may select a pinned installed
// implementation without adding a mandatory native/WebRTC dependency to hosts.
const backend = process.env.MCVISUAL_RTC_TEST_BACKEND;
const Peer = backend ? createRequire(backend)('werift').RTCPeerConnection : null;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, timeout = 10000) {
  const start = Date.now(); while (!predicate()) { if (Date.now() - start > timeout) throw Error('WIRE_TEST_TIMEOUT'); await pause(20); }
}

test('real ICE/DTLS/SCTP carries exact large native state and closes on permission revocation', { skip: !Peer, timeout: 25000 }, async t => {
  const f = await createWireFixture(Peer); t.after(() => f.close());
  const messages = [], failures = [];
  class ClientPeer extends Peer { constructor() { super(loopbackIce); } }
  const stream = createNativeRtcStream({ url: new URL('watch/wire-body/webrtc', f.portalUrl).href,
    RTCPeerConnection: ClientPeer, fetch: f.authorizedFetch,
    onMessage: message => messages.push(JSON.parse(message.data)), onFailure: reason => failures.push(reason) });
  t.after(() => stream.close());
  await until(() => messages.some(row => row.type === 'motion') || failures.length);
  assert.deepEqual(failures, []); assert.equal(messages[0].playerUuid, wireUuid);
  assert.deepEqual(messages.find(row => row.type === 'snapshot'), wireSnapshot);
  assert.ok(JSON.stringify(messages).includes('OWNER_ONLY_WIRE_FIXTURE'));
  assert.equal(f.streamReads, 1); assert.equal(f.relay.state('wire-body').webRtc.connected, 1);
  f.revoke(); await until(() => f.relay.state('wire-body').webRtc.peers === 0);
  const count = messages.length; await pause(150); assert.equal(messages.length, count);
  assert.equal(f.relay.state('wire-body').available, true);
});

test('real public WebRTC stream excludes private Agent data and shuts down with its source', { skip: !Peer, timeout: 25000 }, async t => {
  const f = await createWireFixture(Peer); t.after(() => f.close());
  const messages = [], failures = [];
  class ClientPeer extends Peer { constructor() { super(loopbackIce); } }
  const stream = createNativeRtcStream({ url: new URL('watch/wire-body/webrtc', f.portalUrl).href,
    RTCPeerConnection: ClientPeer, onMessage: message => messages.push(JSON.parse(message.data)), onFailure: reason => failures.push(reason) });
  t.after(() => stream.close());
  await until(() => messages.some(row => row.type === 'motion') || failures.length);
  assert.deepEqual(failures, []); assert.ok(messages.some(row => row.type === 'snapshot'));
  assert.ok(!JSON.stringify(messages).includes('OWNER_ONLY_WIRE_FIXTURE'));
  f.relay.invalidate('wire-body'); await until(() => stream.readyState === 2);
});
