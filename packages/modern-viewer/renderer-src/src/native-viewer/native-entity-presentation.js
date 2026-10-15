const axes = ['x', 'y', 'z']
const point = value => value && axes.every(key => Number.isFinite(value[key]))
const mix = (a, b, t) => a + (b - a) * t
const angle = (a, b, t) => a + ((b - a + 540) % 360 - 180) * t

// Browser-only jitter buffer. Raw entities, native ticks and metadata remain
// untouched. Play received position/limb samples; never predict future motion.
export class NativeEntityPresentation {
  constructor(delayMs = 200) { this.delayMs = delayMs; this.samples = []; this.position = null }
  push(entity, at) {
    if (!point(entity?.position) || !Number.isFinite(at)) return
    const last = this.samples.at(-1)
    if (last && at <= last.at) return
    if (last && (at - last.at > 1000 || Math.hypot(...axes.map(k => entity.position[k] - last.entity.position[k])) > 4)) this.samples = []
    this.samples.push({ entity, at })
    if (this.samples.length > 16) this.samples.shift()
  }
  sample(current, now) {
    const rows = this.samples, time = now - this.delayMs
    if (!rows.length) return current
    while (rows.length > 2 && rows[1].at <= time) rows.shift()
    const a = rows[0], b = rows[1] ?? a
    const t = b.at === a.at ? 1 : Math.max(0, Math.min(1, (time - a.at) / (b.at - a.at)))
    const position = Object.fromEntries(axes.map(k => [k, mix(a.entity.position[k], b.entity.position[k], t)]))
    this.position = position
    const old = a.entity.motion, next = b.entity.motion, live = current.motion
    if (!old || !next || !live || !point(live.position) || !point(live.previous?.position) ||
        !['bodyYaw', 'headYaw', 'pitch'].every(k => Number.isFinite(old[k]) && Number.isFinite(next[k])) ||
        ![old.walk?.position, next.walk?.position, old.walk?.speed, next.walk?.speed].every(Number.isFinite)) return current
    const pose = Object.fromEntries(['bodyYaw', 'headYaw', 'pitch'].map(k => [k, k === 'pitch' ? mix(old[k], next[k], t) : angle(old[k], next[k], t)]))
    const speed = mix(old.walk.speed, next.walk.speed, t)
    // Existing actors render one native 50ms interval. Supply an explicitly
    // marked display projection at its endpoint, using received walk phases.
    return { ...current, position, motion: { ...live, ...pose, position,
      previous: { ...live.previous, ...pose, position }, sampledAt: now - 50,
      walk: { ...live.walk, position: mix(old.walk.position, next.walk.position, t), speed, speedOld: speed },
      displayProjection: 'buffered_received_entity_samples' } }
  }
}
