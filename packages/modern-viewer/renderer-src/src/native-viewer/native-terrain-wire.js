// Lossless terrain deltas. Visible blocks, hidden-solid collision runs and
// original state IDs are retained exactly; only repeated wire data is omitted.
// A new/blocked connection always receives a complete snapshot as its baseline.
const MAX_ARRAY = 1024 * 1024, MAX_GROUPS = 4096
const bad = () => { throw Error('NATIVE_TERRAIN_DELTA_INVALID') }
const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b)
const rowEqual = (a, b) => a === b || Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i])
const safeKey = key => typeof key === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(key) && !['constructor', 'prototype', '__proto__'].includes(key)
const object = value => value && typeof value === 'object' && !Array.isArray(value)
function volume(bounds) {
  if (!object(bounds) || !['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'].every(k => Number.isSafeInteger(bounds[k]))) return null
  const width = bounds.maxX - bounds.minX + 1, depth = bounds.maxZ - bounds.minZ + 1, height = bounds.maxY - bounds.minY + 1
  const total = width * depth * height
  return width > 0 && depth > 0 && height > 0 && Number.isSafeInteger(total) && total <= MAX_ARRAY ? { width, depth, height, total } : null
}
export function compactNativeTerrainSnapshot(snapshot) {
  const v = volume(snapshot.bounds), b = snapshot.bounds
  if (!v || !compactGroups(snapshot.groups) || !Array.isArray(snapshot.occludedSolidRuns)) return snapshot
  const index = (x, y, z) => {
    if (![x, y, z].every(Number.isSafeInteger) || x < b.minX || x > b.maxX || y < b.minY || y > b.maxY || z < b.minZ || z > b.maxZ) throw Error('not compactable')
    return ((y - b.minY) * v.depth + z - b.minZ) * v.width + x - b.minX
  }
  try {
    const groups = snapshot.groups.map(group => {
      if (group.positions.length % 3) throw Error('not compactable')
      const indices = []
      for (let i = 0; i < group.positions.length; i += 3) indices.push(index(...group.positions.slice(i, i + 3)))
      return { stateId: group.stateId, indices }
    })
    const occludedSolidRuns = snapshot.occludedSolidRuns.map(row => {
      if (row.length !== 5 || !Number.isSafeInteger(row[4]) || row[4] < 0 || row[3] < row[2]) throw Error('not compactable')
      index(row[3], row[0], row[1]); return [index(row[2], row[0], row[1]), row[3] - row[2] + 1, row[4]]
    })
    return { ...snapshot, type: 'snapshot_compact', terrainEncoding: 'indexed-voxels-v1', groups, occludedSolidRuns }
  } catch { return snapshot } // Exact fallback for another provider or noninteger coordinates.
}
export function expandNativeTerrainSnapshot(value) {
  const v = volume(value.bounds), b = value.bounds
  if (value.type !== 'snapshot_compact' || value.terrainEncoding !== 'indexed-voxels-v1' || !v || !Array.isArray(value.groups) || value.groups.length > MAX_GROUPS ||
      !Array.isArray(value.occludedSolidRuns) || value.occludedSolidRuns.length > MAX_ARRAY) bad()
  const coordinate = index => {
    if (!Number.isSafeInteger(index) || index < 0 || index >= v.total) bad()
    const y = Math.floor(index / (v.width * v.depth)), remainder = index - y * v.width * v.depth
    return [b.minX + remainder % v.width, b.minY + y, b.minZ + Math.floor(remainder / v.width)]
  }
  let count = 0
  const groups = value.groups.map(group => {
    if (!object(group) || !Number.isSafeInteger(group.stateId) || group.stateId < 0 || !Array.isArray(group.indices) || (count += group.indices.length) > MAX_ARRAY) bad()
    const positions = []; for (const index of group.indices) positions.push(...coordinate(index))
    return { stateId: group.stateId, positions }
  })
  if (new Set(groups.map(g => g.stateId)).size !== groups.length) bad()
  const occludedSolidRuns = value.occludedSolidRuns.map(row => {
    if (!Array.isArray(row) || row.length !== 3 || !Number.isSafeInteger(row[1]) || row[1] < 1 || !Number.isSafeInteger(row[2]) || row[2] < 0) bad()
    const [x, y, z] = coordinate(row[0]); if (x + row[1] - 1 > b.maxX) bad()
    return [y, z, x, x + row[1] - 1, row[2]]
  })
  const { terrainEncoding, ...snapshot } = value
  return { ...snapshot, type: 'snapshot', groups, occludedSolidRuns }
}
function spliceDelta(before, after, equal = same) {
  let start = 0, end = 0
  while (start < before.length && start < after.length && equal(before[start], after[start])) start++
  if (start === before.length && start === after.length) return null
  while (end < before.length - start && end < after.length - start && equal(before[before.length - 1 - end], after[after.length - 1 - end])) end++
  return { length: before.length, start, remove: before.length - start - end, values: after.slice(start, after.length - end) }
}
function applySplice(before, patch) {
  if (!Array.isArray(before) || !object(patch) || !['length', 'start', 'remove'].every(k => Number.isSafeInteger(patch[k]) && patch[k] >= 0) ||
      patch.length !== before.length || patch.start + patch.remove > before.length || !Array.isArray(patch.values) ||
      before.length - patch.remove + patch.values.length > MAX_ARRAY) bad()
  return [...before.slice(0, patch.start), ...patch.values, ...before.slice(patch.start + patch.remove)]
}
const compactGroups = groups => Array.isArray(groups) && groups.length <= MAX_GROUPS && groups.every(g =>
  object(g) && Number.isSafeInteger(g.stateId) && g.stateId >= 0 && Array.isArray(g.positions) && g.positions.length <= MAX_ARRAY &&
  Object.keys(g).every(k => ['stateId', 'positions'].includes(k))) && new Set(groups.map(g => g.stateId)).size === groups.length
function groupsDelta(before, after) {
  const old = new Map(before.map(g => [g.stateId, g.positions])), patches = []
  for (const group of after) {
    const patch = spliceDelta(old.get(group.stateId) ?? [], group.positions, (a, b) => a === b)
    if (patch || !old.has(group.stateId)) patches.push({ stateId: group.stateId, patch: patch ?? { length: 0, start: 0, remove: 0, values: [] } })
  }
  return !patches.length && same(before.map(g => g.stateId), after.map(g => g.stateId)) ? null : { order: after.map(g => g.stateId), patches }
}
function applyGroups(before, value) {
  if (!compactGroups(before) || !object(value) || !Array.isArray(value.order) || value.order.length > MAX_GROUPS ||
      !Array.isArray(value.patches) || value.patches.length > MAX_GROUPS || new Set(value.order).size !== value.order.length ||
      !value.order.every(id => Number.isSafeInteger(id) && id >= 0)) bad()
  const old = new Map(before.map(g => [g.stateId, g])), patches = new Map()
  for (const row of value.patches) {
    if (!object(row) || !value.order.includes(row.stateId) || patches.has(row.stateId)) bad()
    patches.set(row.stateId, row.patch)
  }
  return value.order.map(stateId => {
    const previous = old.get(stateId)
    if (!patches.has(stateId)) { if (!previous) bad(); return previous }
    const positions = applySplice(previous?.positions ?? [], patches.get(stateId))
    if (positions.length % 3 || !positions.every(Number.isFinite)) bad()
    return { stateId, positions }
  })
}
export function nativeTerrainDelta(before, after) {
  if (!before || before.epoch !== after.epoch || before.registrySha256 !== after.registrySha256 || before.mode !== after.mode ||
      !Number.isSafeInteger(before.terrainSequence) || !Number.isSafeInteger(after.terrainSequence) || after.terrainSequence <= before.terrainSequence) return null
  const delta = { type: 'snapshot_delta', schemaVersion: 1, epoch: after.epoch, registrySha256: after.registrySha256, mode: after.mode,
    baseSequence: before.terrainSequence, terrainSequence: after.terrainSequence, set: {}, drop: [] }
  const arrays = new Set(['occludedSolidRuns', 'neighbors'])
  const useGroups = compactGroups(before.groups) && compactGroups(after.groups)
  for (const [key, value] of Object.entries(after)) {
    if (!safeKey(key)) return null
    if (['type', 'terrainSequence'].includes(key)) continue
    if (key === 'groups' && useGroups) { const change = groupsDelta(before.groups, value); if (change) delta.groups = change; continue }
    if (arrays.has(key) && Array.isArray(before[key]) && Array.isArray(value) && value.length <= MAX_ARRAY) {
      const change = spliceDelta(before[key], value, key === 'occludedSolidRuns' ? rowEqual : (a, b) => a === b); if (change) delta[key] = change; continue
    }
    if (!same(before[key], value)) delta.set[key] = value
  }
  for (const key of Object.keys(before)) if (!Object.hasOwn(after, key)) delta.drop.push(key)
  return delta
}
export function applyNativeTerrainDelta(before, delta) {
  if (!before || delta?.type !== 'snapshot_delta' || delta.schemaVersion !== 1 || delta.epoch !== before.epoch || delta.registrySha256 !== before.registrySha256 ||
      delta.mode !== before.mode || delta.baseSequence !== before.terrainSequence || !Number.isSafeInteger(delta.terrainSequence) || delta.terrainSequence <= delta.baseSequence ||
      !object(delta.set) || !Array.isArray(delta.drop) || delta.drop.length > 128 || Object.keys(delta.set).length > 128 ||
      ![...Object.keys(delta.set), ...delta.drop].every(k => safeKey(k) && !['type', 'terrainSequence'].includes(k))) bad()
  const result = { ...before, ...delta.set, type: 'snapshot', terrainSequence: delta.terrainSequence }
  for (const key of delta.drop) delete result[key]
  if (delta.groups) result.groups = applyGroups(before.groups, delta.groups)
  for (const key of ['occludedSolidRuns', 'neighbors']) if (delta[key]) result[key] = applySplice(before[key], delta[key])
  if (result.epoch !== delta.epoch || result.registrySha256 !== delta.registrySha256 || result.mode !== delta.mode) bad()
  return result
}
export function createNativeTerrainEncoder() {
  let previous = null, sequence = 0, previousFullBytes = 0, previousCoordinates = 0
  return {
    reset() { previous = null; sequence = 0; previousFullBytes = 0; previousCoordinates = 0 },
    prepare(snapshot, { requireFull = false } = {}) {
      if (snapshot.type !== 'snapshot') { previous = null; return { full: snapshot, delta: null, baseSequence: null, sequence: null } }
      const full = { ...snapshot, terrainSequence: ++sequence }, baseSequence = previous?.terrainSequence ?? null
      const candidate = nativeTerrainDelta(previous, full), deltaBytes = candidate ? JSON.stringify(candidate).length : null
      const coordinates = full.groups?.reduce((n, group) => n + group.positions.length, 0) ?? 0
      // Common single-block updates must not repack/stringify the entire world
      // solely to learn that a tiny patch is smaller. Large replacement/shrink
      // cases and new viewers still receive an exact measured full candidate.
      const small = candidate && previousFullBytes > 0 && deltaBytes < previousFullBytes * .25 && coordinates >= previousCoordinates / 2
      let fullWire = null, fullBytes = null
      if (!small || requireFull) { fullWire = compactNativeTerrainSnapshot(full); fullBytes = JSON.stringify(fullWire).length }
      const delta = candidate && (small || deltaBytes < fullBytes * .8) ? candidate : null
      if (fullBytes !== null) previousFullBytes = fullBytes
      previousCoordinates = coordinates
      // Protect the transmitted baseline from mutable game objects, including
      // inventory components and time values updated between terrain scans.
      previous = structuredClone(full)
      return { full, fullWire, delta, baseSequence, sequence, fullBytes, deltaBytes: delta ? deltaBytes : null }
    }
  }
}
