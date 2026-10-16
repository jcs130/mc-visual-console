// Small, local CPU observations only. No snapshot/body/asset identifiers are copied.
// World and inventory keep their independent render loops and resource ownership.
export function createNativeTransitionTiming({ viewport, document = globalThis.document,
  now = () => performance.now(), timeOrigin = globalThis.performance?.timeOrigin ?? null,
  context = () => ({}) } = {}) {
  const transitions = [], slowWorldFrames = [], visibilityChanges = []
  let sequence = 0, visibilityEpoch = 0, previousRaf = null, previousFrame = null, disposed = false
  const safe = fn => (...args) => { try { if (!disposed) return fn(...args) } catch { /* Observation must never interrupt a viewer callback. */ } }
  const visibility = () => ({ hidden: Boolean(document?.hidden), state: document?.visibilityState ?? (document?.hidden ? 'hidden' : 'visible'), epoch: visibilityEpoch })
  const state = () => {
    const c = context() ?? {}
    return { view: c.view ?? null, snapshotRevision: Number.isFinite(c.snapshotRevision) ? c.snapshotRevision : null,
      terrainRequested: c.terrainRequested ?? null, terrainCommitted: c.terrainCommitted ?? null,
      terrainBuilding: Boolean(c.terrainBuilding), terrainPending: Boolean(c.terrainPending),
      terrainCommittedAt: c.terrainCommittedAt ?? null, visibility: visibility() }
  }
  const bounded = (rows, row) => { rows.push(row); if (rows.length > 8) rows.shift() }
  const publish = () => { viewport.dataset.transitionTiming = JSON.stringify({ version: 1, timeOrigin,
    visibility: visibility(), visibilityChanges, transitions, slowWorldFrames }) }
  const retained = row => row && transitions.includes(row) && now() - row.at <= 5000
  const overlap = frame => {
    frame.snapshotOverlap = frame.before.snapshotRevision !== frame.after.snapshotRevision
    frame.terrainOverlap = frame.before.terrainBuilding || frame.after.terrainBuilding || frame.before.terrainPending || frame.after.terrainPending ||
      frame.before.terrainRequested !== frame.after.terrainRequested || frame.before.terrainCommitted !== frame.after.terrainCommitted
    frame.visibilityChanged = frame.before.visibility.epoch !== frame.after.visibility.epoch
  }
  const begin = safe((kind, reason, targetView = null, at = now()) => {
    const before = state(), row = { sequence: ++sequence, at, kind, reason,
      currentView: before.view, targetView: targetView ?? before.view, before, menuRebuilds: 0, mirrorBuilds: 0, mirrorReleases: 0 }
    bounded(transitions, row); publish(); return row
  })
  const finish = safe((row, details = {}) => {
    if (!retained(row)) return
    row.syncMs = now() - row.at; Object.assign(row, details); row.after = state(); overlap(row); publish()
  })
  const previewRelease = safe(row => { if (retained(row)) { row.mirrorReleases++; publish() } })
  const previewBuild = safe(row => { if (retained(row)) { row.mirrorBuilds++; publish() } })
  const previewStart = safe(row => retained(row) && !row.readyPreview ? { at: now(), before: state() } : null)
  const previewFinish = safe((row, frame) => {
    if (!retained(row) || !frame) return
    frame.after = state(); frame.latencyMs = now() - row.at; overlap(frame)
    const changed = !row.firstPreview || frame.status === 'ready' || frame.mirrorBuilds > 0
    if (!row.firstPreview) row.firstPreview = frame
    if (frame.status === 'ready') row.readyPreview = frame
    if (changed) publish()
  })
  const worldStart = safe(rafAt => {
    const frame = { at: now(), rafAt, gapFromRafAt: previousRaf,
      gapFromVisibilityEpoch: previousFrame?.visibilityEpoch ?? null,
      gapMs: previousRaf === null ? null : rafAt - previousRaf, before: state() }
    previousRaf = rafAt; return frame
  })
  const worldFinish = safe((frame, phases) => {
    if (!frame) return
    Object.assign(frame, phases, { after: state(), totalMs: now() - frame.at })
    overlap(frame)
    if (previousFrame) {
      const gap = { before: previousFrame.after, after: frame.before }; overlap(gap)
      frame.gapSnapshotOverlap = gap.snapshotOverlap; frame.gapTerrainOverlap = gap.terrainOverlap
      frame.gapVisibilityChanged = gap.visibilityChanged
    }
    let changed = false
    for (const row of transitions) if (!row.world && retained(row) && row.at <= frame.at) { row.world = frame; changed = true }
    if (frame.gapMs > 50 || frame.totalMs > 50) { frame.precedingWorld = previousFrame; bounded(slowWorldFrames, frame); changed = true }
    previousFrame = { at: frame.at, rafAt: frame.rafAt, visibilityEpoch: frame.before.visibility.epoch, after: frame.after, totalMs: frame.totalMs, ...phases }
    if (changed) publish()
  })
  const onVisibility = safe(() => { visibilityEpoch++; bounded(visibilityChanges, { at: now(), ...visibility() }); publish() })
  document?.addEventListener('visibilitychange', onVisibility)
  safe(publish)()
  return { begin, finish, previewStart, previewFinish, previewRelease, previewBuild, worldStart, worldFinish,
    clock: safe(now), dispose() { disposed = true; document?.removeEventListener('visibilitychange', onVisibility) } }
}
