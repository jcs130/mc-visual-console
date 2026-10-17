/** Host-neutral, read-only activity records. No prompts, hidden state or game actions. */
export const ACTIVITY_LIMIT = 80;
export const ACTIVITY_BYTES = 256 * 1024;
const kinds = new Set(['reasoning', 'message', 'tool', 'execution', 'decision', 'phase']);
const states = new Set(['started', 'accepted', 'running', 'completed', 'failed', 'cancelled', 'unknown']);
const secret = /^(?:api[-_]?key|access[-_]?token|refresh[-_]?token|secret|password|authorization|headers|cookie|encrypted_content)$/i;
export function activityText(value, limit = 12000) {
  return String(value ?? '').replace(/\/(?:login|register)\s+[^\s"\\]+(?:\s+[^\s"\\]+)?/gi, '/[认证信息已隐藏]')
    .replace(/Bearer\s+[^\s"\\]+/gi, 'Bearer [已隐藏]')
    .replace(/\b(?:sk-[\w.\-]{12,}|AIza[\w-]{20,})/g, '[凭据已隐藏]')
    .replace(/\[console\|PIN:[^\]]+\]/gi, '[操作员]')
    .slice(0, limit);
}
function clean(value, depth = 0) {
  if (depth > 6) return '[内容已折叠]';
  if (typeof value === 'string') return activityText(value, 6000);
  if (Array.isArray(value)) return value.slice(0, 40).map(row => clean(row, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 50)
    .map(([key, item]) => [activityText(key, 100), secret.test(key) ? '[已隐藏]' : clean(item, depth + 1)]));
  return typeof value === 'number' && !Number.isFinite(value) ? null : value ?? null;
}
export function normalizeAgentActivity(value) {
  if (!value || !kinds.has(value.kind) || typeof value.id !== 'string' || !value.id || !Number.isFinite(Date.parse(value.at))) return null;
  const record = { schema: 'agent-activity/v1', id: activityText(value.id, 160), at: value.at,
    kind: value.kind, source: ['system1', 'system2', 'human'].includes(value.source) ? value.source : 'unknown',
    status: states.has(value.status) ? value.status : 'unknown', title: activityText(value.title || value.tool || value.kind, 160) };
  for (const key of ['run', 'session', 'callId', 'taskId', 'tool', 'model']) if (value[key] !== undefined && value[key] !== null) record[key] = activityText(value[key], 160);
  for (const key of ['round', 'durationMs']) if (Number.isFinite(value[key]) && value[key] >= 0) record[key] = value[key];
  if (value.text) record.text = activityText(value.text);
  for (const key of ['arguments', 'result']) if (value[key] !== undefined) {
    const text = JSON.stringify(clean(value[key])); record[key] = text.length <= 12000 ? JSON.parse(text) : { excerpt: activityText(text, 12000), truncated: true };
  }
  return record;
}
export class AgentActivityHistory {
  constructor({ limit = ACTIVITY_LIMIT, bytes = ACTIVITY_BYTES } = {}) { this.limit = Math.min(ACTIVITY_LIMIT, Math.max(1, limit)); this.bytes = Math.min(ACTIVITY_BYTES, Math.max(1024, bytes)); this.rows = new Map(); this.revision = 0; }
  put(value) {
    const row = normalizeAgentActivity(value); if (!row) return false;
    const previous = this.rows.get(row.id), next = { ...previous, ...row };
    if (JSON.stringify(previous) === JSON.stringify(next)) return false;
    this.rows.set(row.id, next);
    let size = [...this.rows.values()].reduce((n, item) => n + JSON.stringify(item).length * 2, 0);
    while (this.rows.size > this.limit || (size > this.bytes && this.rows.size > 1)) { const key = this.rows.keys().next().value; size -= JSON.stringify(this.rows.get(key)).length * 2; this.rows.delete(key); }
    this.revision++; return true;
  }
  snapshot() { return [...this.rows.values()]; }
  clear() { this.rows.clear(); this.revision++; }
}
