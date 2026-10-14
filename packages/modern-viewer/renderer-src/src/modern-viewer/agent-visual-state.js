import { visualSubject, sameVisualSubject, visualText, visualPoint, visualPoints, normalizeVisualIntent,
  normalizeVisualRoute, normalizeVisualCandidates, normalizeVisualMarkers, normalizeVisualPointer,
  normalizeVisualPresentation, normalizeVisualCamera, normalizeVisualFlight } from './agent-visual-protocol.js';

/** Local monotonic deadlines; no dependence on the Agent/OBS wall clock. */
export class AgentVisualState {
  constructor({ now = () => performance.now() } = {}) { this.now = now; this.reset(); }
  reset() { this.expected = undefined; this.sessionWorld = null; this.epoch = null; this.sequence = -1; this.frame = null; this.media = null; this.deadline = 0; }
  clear() { this.frame = null; this.media = null; this.deadline = 0; }
  session(value) {
    if (!value || !['self', 'observer'].includes(value.mode) || typeof value.attached !== 'boolean') return;
    const next = value.attached ? visualSubject(value) : null;
    if (value.attached && !next) return;
    const world = typeof value.worldUuid === 'string' ? value.worldUuid : null;
    if (!sameVisualSubject(this.expected, next) || this.sessionWorld !== world) { this.clear(); this.epoch = null; this.sequence = -1; }
    this.sessionWorld = world;
    this.expected = next;
  }
  accept(value) {
    if (value?.schemaVersion !== 1 || typeof value.available !== 'boolean' || !Number.isSafeInteger(value.sequence) || value.sequence < 0) return false;
    if (!value.available) { this.clear(); return true; }
    const subject = visualSubject(value.subject);
    if (!subject || (this.expected !== undefined && !sameVisualSubject(this.expected, subject))
        || typeof value.epoch !== 'string' || value.epoch.length > 80) return false;
    if (value.epoch === this.epoch && value.sequence <= this.sequence) return false;
    const route = value.route == null ? null : normalizeVisualRoute(value.route);
    const intent = value.intent == null ? null : normalizeVisualIntent(value.intent);
    const candidates = normalizeVisualCandidates(value.candidates ?? []), markers = normalizeVisualMarkers(value.markers ?? []);
    const trail = visualPoints(value.trail ?? [], 64);
    if ((value.route && !route) || (value.intent && !intent) || !candidates || !markers || !trail) return false;
    const time = this.now(), expires = (row, raw, max = 120_000) => row ? { ...row,
      until: time + Math.max(0, Math.min(max, Number.isFinite(raw?.remainingMs) ? raw.remainingMs : 0)) } : null;
    const input = value.input ?? {}, pointer = normalizeVisualPointer(input.pointer);
    const operations = Array.isArray(input.operations) ? input.operations.slice(-6).flatMap(row => {
      if (!row || !['attack', 'gather', 'interact', 'inventory'].includes(row.kind) || !Number.isSafeInteger(row.id)) return [];
      return [expires({ id: row.id, kind: row.kind, button: row.button === 'left' ? 'left' : 'right',
        ...(row.kind === 'inventory' && Number.isSafeInteger(row.slot) && row.slot >= 0 && row.slot < 256 &&
          Number.isSafeInteger(row.windowId) && row.windowId >= 0 && row.windowId <= 255 ? { slot: row.slot, windowId: row.windowId } : {}),
        detail: visualText(row.detail, 100), from: visualPoint(row.from), target: visualPoint(row.target) }, row, 1800)];
    }) : [];
    let presentation = null;
    if (value.presentation && typeof value.presentation.id === 'string' && value.presentation.id.length <= 48
        && ['image', 'card', 'scene'].includes(value.presentation.kind) && Number.isSafeInteger(value.presentation.revision)) {
      presentation = expires({ id: value.presentation.id, revision: value.presentation.revision, kind: value.presentation.kind,
        title: visualText(value.presentation.title, 100), caption: visualText(value.presentation.caption, 300) }, value.presentation);
    }
    if (this.epoch !== value.epoch || this.media?.revision !== presentation?.revision || this.media?.presentation.id !== presentation?.id) this.media = null;
    this.epoch = value.epoch; this.sequence = value.sequence;
    this.deadline = time + Math.max(500, Math.min(3500, Number.isFinite(value.ttlMs) ? value.ttlMs : 3500));
    this.frame = { subject, intent: expires(intent, value.intent), route: expires(route, value.route, 30_000), camera: expires(normalizeVisualCamera(value.camera), value.camera, 3000),
      candidates: candidates.map((v, i) => expires(v, value.candidates[i], 30_000)),
      markers: markers.map((v, i) => expires(v, value.markers[i], 30_000)), trail, presentation,
      input: { controls: Array.isArray(input.controls) ? ['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak'].filter(k => input.controls.includes(k)) : [],
        flight: normalizeVisualFlight(input.flight), position: visualPoint(input.position), yaw: Number.isFinite(input.yaw) ? input.yaw : null,
        pitch: Number.isFinite(input.pitch) ? input.pitch : null, operations, pointer: expires(pointer, input.pointer, 3000) } };
    return true;
  }
  acceptPresentation(value) {
    const frame = this.snapshot(), ref = frame?.presentation;
    if (value?.schemaVersion !== 1 || !ref || value.epoch !== this.epoch || value.revision !== ref.revision
        || !sameVisualSubject(frame.subject, visualSubject(value.subject))) return false;
    const presentation = normalizeVisualPresentation(value.presentation);
    if (!presentation || presentation.id !== ref.id || presentation.kind !== ref.kind) return false;
    this.media = { revision: ref.revision, presentation }; return true;
  }
  snapshot() {
    const time = this.now();
    if (time >= this.deadline) { this.clear(); return null; }
    if (!this.frame) return null;
    const live = row => row && row.until > time ? row : null, frame = this.frame;
    return { ...frame, intent: live(frame.intent), route: live(frame.route), camera: live(frame.camera), presentation: live(frame.presentation),
      candidates: frame.candidates.filter(live), markers: frame.markers.filter(live),
      input: { ...frame.input, operations: frame.input.operations.filter(live), pointer: live(frame.input.pointer) },
      media: live(frame.presentation) ? this.media?.presentation ?? null : null };
  }
}
