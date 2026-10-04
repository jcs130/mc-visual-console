// Rendering cadence only. It never changes the action player's perception or
// requests chunks. Keep live pose/HUD frames independent of expensive geometry.
export class NativeSnapshotCadence {
  constructor ({ minimumIntervalMs = 500, recenterDistance = 4 } = {}) {
    if (!Number.isFinite(minimumIntervalMs) || minimumIntervalMs < 0 || !Number.isFinite(recenterDistance) || recenterDistance <= 0) throw Error('NATIVE_SNAPSHOT_CADENCE_INVALID')
    this.minimumIntervalMs = minimumIntervalMs; this.recenterDistance = recenterDistance
    this.reset()
  }
  reset () { this.dirty = true; this.center = null; this.bounds = null; this.lastBuiltAt = -Infinity }
  invalidate () { this.dirty = true }
  observe (pose) {
    if (!pose || !['x', 'y', 'z'].every(k => Number.isFinite(pose[k]))) return
    if (!this.center || ['x', 'y', 'z'].some(k => Math.abs(pose[k] - this.center[k]) >= this.recenterDistance)) this.dirty = true
    if (this.bounds && ['x', 'y', 'z'].some(k => {
      const suffix = k.toUpperCase(), min = this.bounds[`min${suffix}`], max = this.bounds[`max${suffix}`]
      const margin = Math.min(1, Math.floor((max - min) / 2)), point = Math.floor(pose[k])
      return point < min + margin || point > max - margin
    })) this.dirty = true
  }
  required (pose, timestamp, force = false) {
    this.observe(pose)
    if (!Number.isFinite(timestamp)) throw Error('NATIVE_SNAPSHOT_CLOCK_INVALID')
    return force || (this.dirty && timestamp - this.lastBuiltAt >= this.minimumIntervalMs)
  }
  completed (pose, timestamp, valid, bounds = null) {
    this.lastBuiltAt = timestamp; this.dirty = false
    if (valid && pose && ['x', 'y', 'z'].every(k => Number.isFinite(pose[k]))) this.center = { x: pose.x, y: pose.y, z: pose.z }
    this.bounds = valid && bounds ? { ...bounds } : null
  }
}
