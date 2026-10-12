import test from 'node:test'
import assert from 'node:assert/strict'
import { nativeViewerUrl } from '../../src/native-viewer/native-url.js'
import { renderViewerPage } from '../../src/viewer-page.mjs'
import { createNativeSession } from '../../src/native-viewer/native-session.js'
import { nativePresentationView } from '../../src/native-viewer/native-ui-adapter.js'

const uuid = '01234567-89ab-cdef-0123-456789abcdef', hash = 'a'.repeat(64)
test('a scoped Numen page and all feed/resource URLs stay on the selected body', () => {
  const basePath = `/numen/view/${uuid}/`, base = `http://127.0.0.1:28984${basePath}`
  const page = renderViewerPage('third', { basePath })
  assert.ok(page.includes(`<base href="${basePath}">`))
  assert.ok(page.includes(`src="${basePath}index.js"`))
  assert.ok(page.includes(`href="${basePath}dungeon/"`))
  assert.ok(!page.includes('src="/index.js"'))
  for (const resource of ['events', '/status.json', 'assets/mod/textures/a.png']) assert.equal(nativeViewerUrl(resource, base), base + resource.replace(/^\//, ''))
  assert.throws(() => renderViewerPage('first', { basePath: '/"><script>/' }))
})
test('Numen feed binds its own UUID, source and respawn entity; a Mineflayer frame cannot replace it', () => {
  const session = createNativeSession(hash), identity = { type: 'identity', minecraftVersion: '1.21.1', registrySha256: hash,
    player: 'OwnedNumen', playerUuid: uuid, entityId: 10, mode: 'numen_server_body' }
  session.receive(identity)
  const snapshot = { type: 'snapshot', mode: identity.mode, registrySha256: hash, epoch: 1, selfPlayer: { uuid, name: identity.player } }
  assert.equal(session.receive(snapshot).kind, 'snapshot')
  assert.throws(() => session.receive({ ...snapshot, mode: 'live_same_player_connection' }), /SNAPSHOT_MISMATCH/)
  assert.equal(session.receive({ ...identity, entityId: 11 }).reset, true)
  assert.equal(session.receive({ type: 'frame', epoch: 1 }).kind, 'ignored')
  assert.equal(session.receive({ ...snapshot, epoch: 2 }).kind, 'snapshot')
  assert.throws(() => session.receive({ ...snapshot, epoch: 2, selfPlayer: { uuid: '00000000-0000-3000-8000-000000000000', name: identity.player } }), /SELF_PLAYER_MISMATCH/)
})
test('Numen vitals use the same UUID guard as normal native HUD state', () => {
  const value = { schemaVersion: 1, source: 'numen_server_body', playerUuid: uuid, available: true,
    sampledAt: Date.now(), self: { uuid, health: 7, maxHealth: 20, food: 12 }, inventory: null, nativeMenu: null, skills: null }
  assert.equal(nativePresentationView(value, uuid).self.health, 7)
  assert.equal(nativePresentationView(value, '00000000-0000-3000-8000-000000000000').available, false)
})
