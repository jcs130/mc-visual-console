/** Public, explicit Agent explanations and drawing primitives. Never send raw
 * model conversations, hidden reasoning, credentials, or executable HTML here.
 * Shared by the host and browser; every field is copied from an allowlist. */
export const AGENT_VISUAL_SCHEMA = 1;
export const AGENT_VISUAL_COLORS = Object.freeze({ path: '#4ee6b1', trail: '#63b8ff', candidate: '#a6b7d4',
  attack: '#ff697b', gather: '#ffbe55', interact: '#c59aff', info: '#b7e7ff' });
export const AGENT_VISUAL_LIMITS = Object.freeze({ markers: 48, vertices: 1024, route: 128,
  candidates: 4, imageBytes: 512 * 1024, sceneNodes: 64, drawingBytes: 64 * 1024 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const finite = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
export const visualText = (v, limit = 240) => typeof v === 'string'
  ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, limit) : '';
export const visualTtl = (v, fallback = 15_000, max = 120_000) => finite(v, 500, max) ? Math.round(v) : fallback;
export function visualSubject(v) {
  return v && UUID.test(v.playerUuid ?? '') && /^[\w.]{1,32}$/.test(v.playerName ?? '') && Number.isSafeInteger(v.entityId)
    ? { playerUuid: v.playerUuid.toLowerCase(), playerName: v.playerName, entityId: v.entityId } : null;
}
export const sameVisualSubject = (a, b) => !!a && !!b && a.playerUuid.toLowerCase() === b.playerUuid.toLowerCase() && a.entityId === b.entityId;
export function visualPoint(v, space = 'world') {
  if (space === 'screen') return v && finite(v.x, 0, 1) && finite(v.y, 0, 1) ? { x: v.x, y: v.y } : null;
  return v && finite(v.x, -30_000_000, 30_000_000) && finite(v.y, -4096, 4096) && finite(v.z, -30_000_000, 30_000_000)
    ? { x: v.x, y: v.y, z: v.z } : null;
}
export function visualPoints(values, max = 128, space = 'world') {
  if (!Array.isArray(values) || !values.length) return [];
  // Sample the entire route, including its endpoint, rather than cutting off
  // long routes and falsely displaying an intermediate node as the destination.
  const count = Math.min(max, values.length), result = [];
  for (let i = 0; i < count; i++) {
    const p = visualPoint(values[Math.floor(i * (values.length - 1) / Math.max(1, count - 1))], space);
    if (!p) return null;
    result.push(p);
  }
  return result;
}
export function normalizeVisualIntent(v) {
  if (!v || typeof v !== 'object') return null;
  const status = ['planning', 'acting', 'waiting', 'blocked', 'done'].includes(v.status) ? v.status : 'acting';
  const goal = visualText(v.goal), step = visualText(v.step), summary = visualText(v.summary, 700);
  if (!goal && !step && !summary) return null;
  return { status, goal, step, summary, ...(finite(v.progress, 0, 1) ? { progress: v.progress } : {}), ttlMs: visualTtl(v.ttlMs) };
}
export function normalizeVisualRoute(v) {
  if (!v || typeof v !== 'object') return null;
  const points = visualPoints(v.points ?? []);
  if (!points) return null;
  return { points, goal: visualPoint(v.goal), status: ['planning', 'moving', 'reached', 'blocked', 'stopped'].includes(v.status) ? v.status : 'moving',
    source: v.source === 'pathfinder' ? 'pathfinder' : 'agent', ttlMs: visualTtl(v.ttlMs, 10_000, 30_000) };
}
export function normalizeVisualCandidates(v) {
  if (!Array.isArray(v) || v.length > AGENT_VISUAL_LIMITS.candidates) return null;
  const result = v.map((row, i) => {
    const route = normalizeVisualRoute(row);
    return route && route.points.length > 1 ? { id: visualText(row.id, 48) || `candidate-${i}`, label: visualText(row.label, 80), points: route.points } : null;
  });
  return result.every(Boolean) ? result : null;
}
const color = (v, fallback) => /^#[a-f0-9]{6}$/i.test(v ?? '') ? v : fallback;
export function normalizeVisualMarkers(values) {
  if (!Array.isArray(values) || values.length > AGENT_VISUAL_LIMITS.markers) return null;
  let vertices = 0; const ids = new Set(), result = [];
  for (const v of values) {
    if (!v || !['point', 'line', 'area', 'label'].includes(v.kind)) return null;
    const id = visualText(v.id, 48), space = v.space === 'screen' ? 'screen' : 'world';
    if (!id || ids.has(id)) return null;
    ids.add(id);
    const role = Object.hasOwn(AGENT_VISUAL_COLORS, v.role) ? v.role : 'info';
    const points = ['line', 'area'].includes(v.kind) ? visualPoints(v.points, v.kind === 'area' ? 64 : 128, space) : [visualPoint(v.position ?? v.points?.[0], space)];
    if (!points || points.some(p => !p) || points.length < (v.kind === 'area' ? 3 : v.kind === 'line' ? 2 : 1)) return null;
    vertices += points.length; if (vertices > AGENT_VISUAL_LIMITS.vertices) return null;
    result.push({ id, kind: v.kind, space, role, points, label: visualText(v.label, 100), color: color(v.color, AGENT_VISUAL_COLORS[role]),
      width: finite(v.width, 1, 10) ? v.width : 3, radius: finite(v.radius, 2, 24) ? v.radius : 6,
      dashed: v.dashed === true || role === 'candidate', flow: v.flow === true && v.kind === 'line', ttlMs: visualTtl(v.ttlMs, 10_000, 30_000) });
  }
  return result;
}
export function normalizeVisualPointer(v) {
  const p = visualPoint(v, 'screen');
  return p ? { ...p, ttlMs: visualTtl(v.ttlMs, 1500, 3000) } : null;
}
export function normalizeVisualCamera(v) {
  return v && finite(v.verticalFov, 5, 170) ? { verticalFov: v.verticalFov, ttlMs: visualTtl(v.ttlMs, 1000, 3000) } : null;
}
export function normalizeVisualPresentation(v) {
  if (!v || typeof v !== 'object') return null;
  const base = { id: visualText(v.id, 48), title: visualText(v.title, 100), caption: visualText(v.caption, 300), ttlMs: visualTtl(v.ttlMs, 30_000) };
  if (!base.id) return null;
  if (v.kind === 'image') {
    // PNG/JPEG/WebP/GIF only: no remote tracking URLs, SVG script, HTML, files,
    // or server-side fetching. Animated GIF/WebP use the browser's decoder.
    if (typeof v.src !== 'string' || v.src.length > Math.ceil(AGENT_VISUAL_LIMITS.imageBytes * 4 / 3) + 100
        || !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(v.src)) return null;
    const encoded = v.src.slice(v.src.indexOf(',') + 1);
    if (encoded.length % 4 || encoded.length * 3 / 4 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0) > AGENT_VISUAL_LIMITS.imageBytes) return null;
    return { ...base, kind: 'image', src: v.src };
  }
  if (v.kind === 'card') {
    const text = visualText(v.text, 1500); if (!text) return null;
    return { ...base, kind: 'card', text };
  }
  if (v.kind !== 'scene' || !finite(v.width, 64, 1920) || !finite(v.height, 64, 1080)
      || !Array.isArray(v.nodes) || v.nodes.length > AGENT_VISUAL_LIMITS.sceneNodes) return null;
  const nodes = [];
  for (const node of v.nodes) {
    if (!node || !['rect', 'circle', 'line', 'text'].includes(node.kind) || !finite(node.x, -4096, 4096) || !finite(node.y, -4096, 4096)) return null;
    const row = { kind: node.kind, x: node.x, y: node.y, color: color(node.color, '#b7e7ff') };
    if (node.kind === 'rect') {
      if (!finite(node.width, 1, 4096) || !finite(node.height, 1, 4096)) return null;
      row.width = node.width; row.height = node.height;
    } else if (node.kind === 'circle') {
      if (!finite(node.radius, 1, 1024)) return null;
      row.radius = node.radius;
    } else if (node.kind === 'line') {
      if (!finite(node.x2, -4096, 4096) || !finite(node.y2, -4096, 4096)) return null;
      row.x2 = node.x2; row.y2 = node.y2; row.width = finite(node.width, 1, 10) ? node.width : 2;
    } else { row.text = visualText(node.text, 180); row.size = finite(node.size, 8, 96) ? node.size : 20; }
    if (node.motion) {
      if (!finite(node.motion.dx, -4096, 4096) || !finite(node.motion.dy, -4096, 4096) || !finite(node.motion.periodMs, 500, 20_000)) return null;
      row.motion = { dx: node.motion.dx, dy: node.motion.dy, periodMs: node.motion.periodMs };
    }
    nodes.push(row);
  }
  return { ...base, kind: 'scene', width: v.width, height: v.height, background: color(v.background, '#142431'), nodes };
}

/** Partial update: omitted fields stay unchanged, null/[] explicitly clear.
 * A malformed batch is rejected atomically; it cannot half-replace a display. */
export function normalizeAgentVisualUpdate(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, code: 'AGENT_VISUAL_INVALID_UPDATE' };
  const validators = { intent: normalizeVisualIntent, route: normalizeVisualRoute, candidates: normalizeVisualCandidates,
    markers: normalizeVisualMarkers, presentation: normalizeVisualPresentation, pointer: normalizeVisualPointer, camera: normalizeVisualCamera };
  const value = {};
  for (const [key, validate] of Object.entries(validators)) if (Object.hasOwn(v, key)) {
    if (v[key] === null && !['candidates', 'markers'].includes(key)) value[key] = null;
    else { value[key] = validate(v[key]); if (value[key] === null) return { ok: false, code: `AGENT_VISUAL_INVALID_${key.toUpperCase()}` }; }
  }
  if (!Object.keys(value).length) return { ok: false, code: 'AGENT_VISUAL_EMPTY_UPDATE' };
  const drawing = { ...value }; delete drawing.presentation;
  if (JSON.stringify(drawing).length > AGENT_VISUAL_LIMITS.drawingBytes) return { ok: false, code: 'AGENT_VISUAL_DRAWING_BUDGET' };
  return { ok: true, value };
}
