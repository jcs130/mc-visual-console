/** Bounded camera trajectories, in blocks/seconds and a right-handed Y-up world. No renderer or timers. */
const fail = code => { throw Object.assign(new Error(code), { code }); };
const vec = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const len = a => Math.hypot(...a);
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const angle = (a, b) => Math.acos(Math.min(1, Math.max(-1, a.reduce((n, x, i) => n + x * b[i], 0) / (len(a) * len(b)))));
const ease = t => t * t * t * (10 + t * (-15 + 6 * t));
const clone = x => structuredClone(x);

export function toJavaCameraAngles({ position, focus }) {
  if (!vec(position) || !vec(focus) || len(sub(focus, position)) < .01) fail('INVALID_CAMERA_FOCUS');
  const [x, y, z] = sub(focus, position), degrees = 180 / Math.PI;
  return { yaw: Math.atan2(-x, z) * degrees, pitch: -Math.atan2(y, Math.hypot(x, z)) * degrees };
}

/** Preflight samples the full path. advance() also rechecks swept segments against current geometry. */
export class BoundedCameraMotion {
  constructor({ scope, kind, position, focus, endPosition = position, endFocus = focus, arcDegrees = 45,
    durationMs = 7000, maxSpeed = 2.5, maxTurnDegrees = 24, radius = .3, probe }) {
    if (typeof scope !== 'string' || !scope || !vec(position) || !vec(focus) || !vec(endPosition) || !vec(endFocus)
      || len(sub(focus, position)) < .1 || len(sub(endFocus, endPosition)) < .1
      || !['hold', 'orbit_arc', 'push_in', 'pull_out', 'pedestal', 'truck', 'pan', 'tilt'].includes(kind)
      || !Number.isFinite(durationMs) || durationMs < 1000 || durationMs > 20000
      || !Number.isFinite(maxSpeed) || maxSpeed <= 0 || maxSpeed > 8
      || !Number.isFinite(maxTurnDegrees) || maxTurnDegrees <= 0 || maxTurnDegrees > 60
      || !Number.isFinite(radius) || radius < .1 || radius > 2 || typeof probe !== 'function') fail('INVALID_MOTION_SCRIPT');
    // Retain a defined horizon; an exactly vertical look ray has no unique right/up basis.
    const startDirection = sub(focus, position), endDirection = sub(endFocus, endPosition);
    const pitch = d => Math.atan2(d[1], Math.hypot(d[0], d[2]));
    const yaw = d => Math.atan2(d[0], d[2]);
    if (kind === 'pan' && Math.abs(pitch(startDirection) - pitch(endDirection)) > .001) fail('PAN_MUST_KEEP_PITCH');
    if (kind === 'tilt' && Math.abs(Math.atan2(Math.sin(yaw(startDirection) - yaw(endDirection)), Math.cos(yaw(startDirection) - yaw(endDirection)))) > .001) fail('TILT_MUST_KEEP_YAW');
    this.scope = scope; this.probe = probe; this.radius = radius; this.kind = kind;
    const offset = sub(position, focus), horizontal = Math.hypot(offset[0], offset[2]);
    if (kind === 'orbit_arc' && (!Number.isFinite(arcDegrees) || Math.abs(arcDegrees) < 1 || Math.abs(arcDegrees) > 90
      || horizontal < .5 || len(sub(endFocus, focus)) > .001)) fail('INVALID_ORBIT_ARC');
    if ((kind === 'pan' || kind === 'tilt') && len(sub(endPosition, position)) > .001) fail('PAN_MUST_NOT_DOLLY');
    if (kind === 'hold' && (len(sub(endPosition, position)) > .001 || len(sub(endFocus, focus)) > .001)) fail('HOLD_MUST_NOT_MOVE');
    if (kind === 'pedestal' && Math.hypot(endPosition[0] - position[0], endPosition[2] - position[2]) > .001) fail('PEDESTAL_MUST_BE_VERTICAL');
    if ((kind === 'push_in' || kind === 'pull_out') && len(sub(endFocus, focus)) > .001) fail('DOLLY_FOCUS_MUST_BE_FIXED');
    if ((kind === 'push_in' || kind === 'pull_out') && angle(sub(endPosition, focus), offset) > .001) fail('DOLLY_MUST_FOLLOW_RAY');
    if (kind === 'push_in' && len(sub(endPosition, focus)) >= len(offset)) fail('PUSH_MUST_APPROACH');
    if (kind === 'pull_out' && len(sub(endPosition, focus)) <= len(offset)) fail('PULL_MUST_RETREAT');
    const turn = arcDegrees * Math.PI / 180;
    this.poseAt = t => {
      const a = ease(t);
      const nextPosition = kind === 'orbit_arc' ? add(focus, [offset[0] * Math.cos(turn * a) - offset[2] * Math.sin(turn * a),
        offset[1], offset[0] * Math.sin(turn * a) + offset[2] * Math.cos(turn * a)]) : mix(position, endPosition, a);
      let nextFocus = kind === 'orbit_arc' ? [...focus] : mix(focus, endFocus, a);
      if (kind === 'pan' || kind === 'tilt') {
        const yawDelta = Math.atan2(Math.sin(yaw(endDirection) - yaw(startDirection)), Math.cos(yaw(endDirection) - yaw(startDirection)));
        const azimuth = yaw(startDirection) + yawDelta * a, elevation = pitch(startDirection) + (pitch(endDirection) - pitch(startDirection)) * a;
        const distance = len(startDirection) + (len(endDirection) - len(startDirection)) * a;
        nextFocus = add(nextPosition, [distance * Math.sin(azimuth) * Math.cos(elevation), distance * Math.sin(elevation), distance * Math.cos(azimuth) * Math.cos(elevation)]);
      }
      if (len(sub(nextFocus, nextPosition)) < .1) fail('FOCUS_CROSSES_CAMERA');
      return { position: nextPosition, focus: nextFocus, up: [0, 1, 0] };
    };
    let previous = this.poseAt(0), peakLinear = 0, peakAngular = 0;
    // Derivatives per unit progress bound the actual duration, including focus rotation near the lens.
    for (let i = 1; i <= 256; i++) {
      const next = this.poseAt(i / 256);
      peakLinear = Math.max(peakLinear, len(sub(next.position, previous.position)) * 256);
      peakAngular = Math.max(peakAngular, angle(sub(next.focus, next.position), sub(previous.focus, previous.position)) * 256);
      previous = next;
    }
    this.durationMs = Math.ceil(Math.max(durationMs, peakLinear / maxSpeed * 1000 * 1.01,
      peakAngular / (maxTurnDegrees * Math.PI / 180) * 1000 * 1.01));
    if (this.durationMs > 20000) fail('MOTION_TOO_FAST_FOR_DURATION_LIMIT');
    previous = this.poseAt(0);
    for (let i = 0; i <= 256; i++) {
      const pose = this.poseAt(i / 256);
      if (!this.clear(previous, pose)) fail('UNVERIFIED_MOTION_PATH');
      previous = pose;
    }
    this.lastPose = this.poseAt(0); this.lastMs = 0; this.phase = 'running'; this.reason = 'preflight_passed';
  }
  clear(from, to) {
    const steps = Math.max(1, Math.ceil(len(sub(to.position, from.position)) / .2),
      Math.ceil(angle(sub(to.focus, to.position), sub(from.focus, from.position)) / (2 * Math.PI / 180)));
    if (!Number.isFinite(steps) || steps > 512) return false;
    for (let i = 0; i <= steps; i++) {
      const pose = { position: mix(from.position, to.position, i / steps), focus: mix(from.focus, to.focus, i / steps), up: [0, 1, 0] };
      const ray = sub(pose.focus, pose.position);
      if (len(ray) < .1 || Math.hypot(ray[0], ray[2]) / len(ray) < .03) return false;
      // Unknown space is not clear space. The host supplies both camera-volume and line-of-sight probes.
      let result;
      try { result = this.probe(clone(pose), this.radius); } catch { return false; }
      if (result?.known !== true || result.clear !== true || result.visible !== true) return false;
    }
    return true;
  }
  advance(elapsedMs, { scope = this.scope } = {}) {
    if (this.phase !== 'running') return this.result();
    if (!Number.isFinite(elapsedMs) || elapsedMs < this.lastMs || scope !== this.scope) {
      this.phase = 'blocked'; this.reason = scope !== this.scope ? 'scope_changed' : 'clock_reversed'; return this.result();
    }
    const nextMs = Math.min(this.durationMs, elapsedMs), pose = this.poseAt(nextMs / this.durationMs);
    // Revalidate the actual curve, not just its endpoint or a chord through a curved wall.
    const steps = Math.max(1, Math.ceil((nextMs - this.lastMs) / this.durationMs * 256));
    let previous = this.lastPose;
    for (let i = 1; i <= steps; i++) {
      const sample = this.poseAt((this.lastMs + (nextMs - this.lastMs) * i / steps) / this.durationMs);
      if (!this.clear(previous, sample)) { this.phase = 'blocked'; this.reason = 'path_or_visibility_changed'; return this.result(); }
      previous = sample;
    }
    this.lastPose = pose; this.lastMs = nextMs;
    if (nextMs === this.durationMs) { this.phase = 'completed'; this.reason = 'endpoint_held'; }
    return this.result();
  }
  cancel() { if (this.phase === 'running') { this.phase = 'cancelled'; this.reason = 'cancelled'; } return this.result(); }
  result() { return { phase: this.phase, reason: this.reason, elapsedMs: this.lastMs, durationMs: this.durationMs, pose: clone(this.lastPose) }; }
}
