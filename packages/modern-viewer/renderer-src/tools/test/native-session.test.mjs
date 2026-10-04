import test from 'node:test'
import assert from 'node:assert/strict'
import { createNativeSession } from '../../src/native-viewer/native-session.js'

const hash = 'a'.repeat(64), uuid = 'e371227c-09fa-3722-84f4-f3228a552c3c'
const identity = { type: 'identity', player: 'MawExplorer', playerUuid: uuid, minecraftVersion: '1.21.1', registrySha256: hash, mode: 'live_same_player_connection' }
const snapshot = { type: 'snapshot', registrySha256: hash, mode: identity.mode, epoch: 1, selfPlayer: { uuid, name: identity.player }, presentation: { available: true, playerUuid: uuid } }

test('identity cannot be established by a world frame or a different native registry', () => {
  const session = createNativeSession(hash)
  assert.throws(() => session.receive(snapshot), /IDENTITY_MISSING/)
  assert.throws(() => session.receive({ ...identity, registrySha256: 'b'.repeat(64) }), /IDENTITY_MISMATCH/)
  assert.throws(() => session.receive({ ...identity, minecraftVersion: '1.20.6' }), /IDENTITY_MISMATCH/)
  assert.equal(session.receive(identity).kind, 'identity')
})
test('snapshot and presentation must belong to this connection rather than a camera or another account', () => {
  const session = createNativeSession(hash); session.receive(identity)
  assert.throws(() => session.receive({ ...snapshot, selfPlayer: { uuid: '00000000-0000-3000-8000-000000000000', name: identity.player } }), /SELF_PLAYER_MISMATCH/)
  assert.throws(() => session.receive({ ...snapshot, presentation: { available: true, playerUuid: '00000000-0000-3000-8000-000000000000' } }), /PRESENTATION_IDENTITY_MISMATCH/)
  assert.equal(session.receive(snapshot).kind, 'snapshot')
})
test('respawn, disconnect and relogin cannot replay stale frames', () => {
  const session = createNativeSession(hash); session.receive(identity); session.receive(snapshot)
  assert.equal(session.receive({ type: 'frame', epoch: 1 }).kind, 'frame')
  assert.equal(session.receive({ ...snapshot, epoch: 2 }).reset, true)
  assert.equal(session.receive({ type: 'frame', epoch: 1 }).kind, 'ignored')
  assert.equal(session.receive({ ...snapshot, epoch: 1 }).kind, 'ignored')
  session.receive({ type: 'unavailable', reason: 'disconnected' })
  assert.equal(session.receive({ type: 'frame', epoch: 2 }).kind, 'ignored')
  assert.equal(session.receive({ ...identity, playerUuid: null }).reset, true)
  assert.throws(() => session.receive(snapshot), /SELF_PLAYER_MISMATCH/)
  session.receive(identity)
  assert.equal(session.receive(snapshot).kind, 'snapshot')
})
test('empty pre-login identity is explicitly replaced by the verified player identity', () => {
  const session = createNativeSession(hash)
  session.receive({ ...identity, playerUuid: null })
  const loggedIn = session.receive(identity)
  assert.equal(loggedIn.reset, true); assert.equal(loggedIn.value.playerUuid, uuid)
  assert.equal(session.receive({ type: 'future_feature' }).kind, 'ignored')
})
