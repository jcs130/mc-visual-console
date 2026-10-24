import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createNativeTerrainEncoder, nativeTerrainDelta, applyNativeTerrainDelta, compactNativeTerrainSnapshot, expandNativeTerrainSnapshot } from '../../src/native-viewer/native-terrain-wire.js'
import { createNativeSession } from '../../src/native-viewer/native-session.js'
const hash = 'a'.repeat(64), uuid = '00000000-0000-3000-8000-000000000001'
const identity = { type: 'identity', minecraftVersion: '1.21.1', player: 'ag_Test', playerUuid: uuid, mode: 'paper_server_observation', registrySha256: hash }
const snapshot = () => ({ type: 'snapshot', schemaVersion: 1, epoch: 1, mode: identity.mode, registrySha256: hash,
  groups: [{ stateId: 1, positions: Array.from({ length: 9000 }, (_, n) => n) }], occludedSolidRuns: [[2, 3, 1, 8, 1], [2, 3, 9, 10, 2]],
  states: [{ stateId: 1, name: 'minecraft:stone' }, { stateId: 2, name: 'minecraft:dirt' }], neighbors: [3, 4, 5, 1],
  biomeGrid: { ids: [1, 2, 3] }, pose: { x: 1, y: 2, z: 3 }, selfPlayer: { uuid, name: identity.player }, futureField: '原始资料' })
test('one block terrain edits preserve all original geometry/state/collision data without retransmitting unchanged arrays', () => {
  const encoder = createNativeTerrainEncoder(), first = encoder.prepare(snapshot()), next = snapshot()
  next.groups[0].positions.splice(300, 3); next.occludedSolidRuns[1][4] = 1; next.pose.x = 2; delete next.futureField
  const second = encoder.prepare(next)
  assert.ok(second.delta); assert.ok(second.deltaBytes < JSON.stringify(second.full).length / 20)
  assert.equal(second.fullWire, null, 'a tiny update does not repack the whole terrain')
  assert.deepEqual(applyNativeTerrainDelta(first.full, second.delta), second.full)
  assert.equal(second.delta.set.states, undefined); assert.equal(second.delta.set.biomeGrid, undefined)
  assert.equal(first.full.groups[0].positions.length, 9000)
})
test('group creation, deletion, reordering, empty groups and changed state definitions remain exact', () => {
  let previous = { ...snapshot(), terrainSequence: 1 }
  for (let i = 0; i < 50; i++) {
    const next = structuredClone(previous); next.terrainSequence++
    next.groups = i % 4 === 0 ? [] : [{ stateId: i + 1, positions: [i, i + .5, i + 1] }, ...next.groups.slice(0, 2).filter(g => g.stateId !== i + 1)]
    next.states.push({ stateId: i + 10, name: 'namespace:exact', properties: { source: '原始值' } })
    next.occludedSolidRuns = i % 2 ? [] : [[i, 1, 2, 3, i]]; next.neighbors = [i, 1, 2, 3]
    const delta = nativeTerrainDelta(previous, next)
    assert.deepEqual(applyNativeTerrainDelta(previous, delta), next); previous = next
  }
})
test('mutating a live game object cannot silently mutate a transmitted baseline', () => {
  const encoder = createNativeTerrainEncoder(), value = snapshot(), before = structuredClone(value)
  const first = encoder.prepare(value); const received = structuredClone(first.full)
  value.groups[0].positions[0] = 400; value.selfPlayer.name = 'ag_Changed'
  const second = encoder.prepare(value)
  assert.ok(second.delta); assert.deepEqual(applyNativeTerrainDelta(received, second.delta), second.full)
  assert.equal(received.selfPlayer.name, before.selfPlayer.name)
})
test('old/missing bases, another epoch/registry/body mode and malformed or unbounded splice operations are rejected', () => {
  const before = { ...snapshot(), terrainSequence: 1 }, next = { ...snapshot(), terrainSequence: 2, revision: 2 }
  const delta = nativeTerrainDelta(before, next)
  for (const patch of [{ baseSequence: 0 }, { terrainSequence: 1 }, { epoch: 2 }, { mode: 'another' }, { registrySha256: 'b'.repeat(64) },
    { groups: { order: [1, 1], patches: [] } }, { neighbors: { length: 4, start: 8, remove: 0, values: [] } },
    { neighbors: { length: 4, start: 0, remove: 0, values: Array(1024 * 1024 + 1).fill(0) } },
    { drop: ['__proto__'] }, { set: JSON.parse('{"__proto__":{"polluted":true}}') }]) {
    assert.throws(() => applyNativeTerrainDelta(before, { ...delta, ...patch }), /DELTA_INVALID/)
  }
  assert.throws(() => applyNativeTerrainDelta(null, delta), /DELTA_INVALID/)
  assert.equal({}.polluted, undefined)
})
test('legacy full snapshots still work; identity/disconnect resets prevent deltas from reviving stale data', () => {
  const encoder = createNativeTerrainEncoder(), first = encoder.prepare(snapshot()), second = encoder.prepare({ ...snapshot(), revision: 2 })
  const session = createNativeSession(hash); session.receive(identity)
  assert.equal(session.receive(first.full).kind, 'snapshot')
  assert.deepEqual(session.receive(second.delta).value, second.full)
  assert.throws(() => session.receive(second.delta), /DELTA_INVALID/)
  session.receive({ type: 'unavailable', epoch: 1 }); assert.equal(session.receive(second.delta).kind, 'ignored')
  session.receive(identity); session.receive(snapshot()); assert.throws(() => session.receive(second.delta), /DELTA_INVALID/)
  session.receive(first.full); session.receive(identity); assert.throws(() => session.receive(second.delta), /DELTA_INVALID/)
})
test('delta self-player and entity data go through the original session identity checks before a new base is accepted', () => {
  const encoder = createNativeTerrainEncoder(), first = encoder.prepare(snapshot()), next = snapshot()
  next.selfPlayer.uuid = '00000000-0000-3000-8000-000000000002'
  const bad = encoder.prepare(next), session = createNativeSession(hash); session.receive(identity); session.receive(first.full)
  assert.throws(() => session.receive(bad.delta), /SELF_PLAYER_MISMATCH/)
  next.selfPlayer.uuid = uuid; next.terrainSequence = bad.sequence
  const corrected = nativeTerrainDelta(first.full, next)
  assert.equal(session.receive(corrected).kind, 'snapshot')
})
test('renderer motion/presentation mutations never change the private decoder baseline', () => {
  const source = snapshot(); source.presentation = { self: { handAnimation: { attack: 0 } } }
  const encoder = createNativeTerrainEncoder(), first = encoder.prepare(source), next = encoder.prepare({ ...source, revision: 2 })
  const session = createNativeSession(hash); session.receive(identity)
  const displayed = session.receive(structuredClone(first.full)).value
  displayed.pose = { x: 100, y: 100, z: 100 }; displayed.presentation.self.handAnimation = { attack: 1 }
  assert.deepEqual(session.receive(next.delta).value, next.full)
})
test('new epochs or a large replacement choose complete snapshots instead of patching the wrong terrain', () => {
  const encoder = createNativeTerrainEncoder(); encoder.prepare(snapshot())
  assert.equal(encoder.prepare({ ...snapshot(), epoch: 2 }).delta, null)
  const replacement = snapshot(); replacement.epoch = 2; replacement.groups[0].positions.fill(-1000000)
  assert.equal(encoder.prepare(replacement).delta, null)
})
test('indexed visible surfaces and hidden-solid runs round-trip negative positions and original state IDs exactly', () => {
  const value = { ...snapshot(), bounds: { minX: -400, maxX: -391, minY: -64, maxY: -55, minZ: -300, maxZ: -291 },
    groups: [{ stateId: 2436, positions: [-400, -64, -300, -391, -55, -291] }], occludedSolidRuns: [[-63, -299, -399, -395, 571]] }
  const packed = compactNativeTerrainSnapshot(value)
  assert.equal(packed.type, 'snapshot_compact'); assert.deepEqual(expandNativeTerrainSnapshot(packed), value)
  assert.equal(packed.groups[0].positions, undefined); assert.equal(packed.groups[0].indices.length, 2)
  assert.deepEqual(packed.occludedSolidRuns[0], [111, 5, 571])
  const session = createNativeSession(hash); session.receive(identity)
  assert.deepEqual(session.receive(packed).value, value)
  const exotic = structuredClone(value); exotic.groups[0].positions[0] += .5
  assert.equal(compactNativeTerrainSnapshot(exotic), exotic)
})
test('bad compact volume, out-of-range coordinates and row-crossing hidden runs are rejected', () => {
  const value = { ...snapshot(), bounds: { minX: 0, maxX: 9, minY: 0, maxY: 9, minZ: 0, maxZ: 9 }, groups: [{ stateId: 1, positions: [0, 0, 0] }], occludedSolidRuns: [[0, 0, 0, 9, 1]] }
  const packed = compactNativeTerrainSnapshot(value)
  for (const patch of [{ groups: [{ stateId: 1, indices: [-1] }] }, { groups: [{ stateId: 1, indices: [1000] }] },
    { occludedSolidRuns: [[9, 2, 1]] }, { bounds: { ...value.bounds, maxY: 1000000 } }, { terrainEncoding: 'unknown' }]) {
    assert.throws(() => expandNativeTerrainSnapshot({ ...packed, ...patch }), /DELTA_INVALID/)
  }
})
