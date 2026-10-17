import { randomUUID } from 'node:crypto';
import { AgentActivityHistory } from '../src/modern-viewer/agent-activity.js';
import { normalizeAgentVisualUpdate, normalizeVisualRoute, visualPoint, visualSubject,
  sameVisualSubject, visualText, normalizeVisualFlight, normalizeVisualDecision } from '../src/modern-viewer/agent-visual-protocol.js';

/** A trusted, in-process fan-out for action players and their Eyes/live views.
 * Register the actual action bot, never infer its thoughts/inventory from an Eye.
 * No HTTP upload endpoint, new port, filesystem reads, or game actions. */
export function createViewerAgentHub({ maximum = 64 } = {}) {
  const records = new Map();
  return {
    put(owner, record) {
      const key = record.subject.playerUuid, old = records.get(key);
      if (old && old.owner !== owner) return false;
      if (!old && records.size >= maximum) return false;
      records.set(key, { owner, record }); return true;
    },
    get(subject) { const record = records.get(subject?.playerUuid)?.record; return sameVisualSubject(subject, record?.subject) ? record : null; },
    remove(owner) { for (const [key, row] of records) if (row.owner === owner) records.delete(key); },
    get size() { return records.size; },
  };
}
export const viewerAgentHub = createViewerAgentHub();
const publishers = new WeakMap(), dispatchers = new WeakMap();
const activityHistories = new WeakMap();
/** Retain bounded host records even when the renderer has not attached yet. */
export function publishAgentActivity(bot, value) {
  if (!bot || typeof bot.emit !== 'function') return false;
  let history = activityHistories.get(bot); if (!history) { history = new AgentActivityHistory(); activityHistories.set(bot, history); }
  if (!history.put(value)) return false;
  bot.emit('viewer:activity', value); return true;
}

/** Attach once per actual bot, then call this from an Agent/developer tool.
 * The acknowledgement confirms display acceptance, NOT a Minecraft action. */
export function publishAgentVisualization(bot, update) {
  return publishers.get(bot)?.(update) ?? { ok: false, code: 'AGENT_VISUAL_HOST_NOT_ATTACHED' };
}
export function observeSentPackets(client, callback) {
  if (typeof client?.write !== 'function') return () => {};
  let row = dispatchers.get(client);
  if (!row) {
    const original = client.write, listeners = new Set();
    function write(...args) {
      const result = original.apply(this, args); // A throwing write was not sent.
      for (const listener of listeners) { try { listener(...args); } catch { /* Telemetry cannot break play. */ } }
      return result;
    }
    row = { original, write, listeners }; dispatchers.set(client, row); client.write = write;
  }
  row.listeners.add(callback); let disposed = false;
  return () => {
    if (disposed) return; disposed = true; row.listeners.delete(callback);
    if (!row.listeners.size) {
      if (client.write === row.write) client.write = row.original;
      dispatchers.delete(client);
    }
  };
}
const ownSubject = bot => visualSubject({ playerUuid: bot.player?.uuid ?? bot.entity?.uuid ?? bot.uuid,
  playerName: bot.username, entityId: bot.entity?.id });
const controls = ['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak'];

export function createViewerAgentBridge(bot, { hub = viewerAgentHub, getViewerSession = () => null, authorizePublish = null,
  getFlightState = () => null,
  now = Date.now, intervalMs = 100, timers = true } = {}) {
  if (publishers.has(bot)) throw Error('AGENT_VISUAL_HOST_ALREADY_ATTACHED');
  const owner = {}, sockets = new Map(), hooks = [];
  let record = null, closed = false, ended = false, sequence = 0, operationId = 0;
  const on = (event, handler) => { bot.on(event, handler); hooks.push([event, handler]); };
  const isBody = () => !ended && bot.entity && bot.game?.gameMode !== 'spectator' && bot._client?.state === 'play';
  function refreshRecord() {
    const subject = isBody() ? ownSubject(bot) : null;
    if (!subject) { hub.remove(owner); record = null; return null; }
    if (!sameVisualSubject(record?.subject, subject)) {
      hub.remove(owner);
      const activity = activityHistories.get(bot) ?? new AgentActivityHistory(); activityHistories.set(bot, activity);
      record = { subject, epoch: randomUUID(), dimension: bot.game?.dimension ?? null, intent: null, route: null,
        candidates: [], markers: [], decisions: [], activity, pointer: null, camera: null, presentation: null, presentationRevision: 0, trail: [], operations: [], input: {} };
      if (!hub.put(owner, record)) { record = null; return null; }
    }
    return record;
  }
  function viewerSubject() {
    const session = getViewerSession();
    if (session) return session.attached ? visualSubject(session) : null;
    return isBody() ? ownSubject(bot) : null;
  }
  function expire(r, time) {
    for (const key of ['intent', 'route', 'pointer', 'camera', 'presentation']) if (r[key]?.until <= time) r[key] = null;
    r.candidates = r.candidates.filter(v => v.until > time);
    r.markers = r.markers.filter(v => v.until > time);
    r.operations = r.operations.filter(v => v.until > time);
    r.decisions = r.decisions.filter(v => v.until > time);
    r.trail = r.trail.filter(v => time - v.at <= 8_000);
  }
  function publish(update) {
    if (closed) return { ok: false, code: 'AGENT_VISUAL_HOST_CLOSED' };
    const parsed = normalizeAgentVisualUpdate(update);
    if (!parsed.ok) return parsed;
    const r = refreshRecord();
    if (!r) return { ok: false, code: 'AGENT_VISUAL_ACTION_PLAYER_UNAVAILABLE' };
    const time = now();
    for (const [key, value] of Object.entries(parsed.value)) {
      if (key === 'candidates' || key === 'markers') r[key] = value.map(v => ({ ...v, until: time + (v.ttlMs ?? 10_000) }));
      else r[key] = value ? { ...value, until: time + value.ttlMs } : null;
      if (key === 'presentation') r.presentationRevision++;
    }
    return { ok: true, code: 'AGENT_VISUAL_ACCEPTED', subject: { ...r.subject }, accepted: Object.keys(parsed.value) };
  }
  publishers.set(bot, publish);
  // This owner-bot event is separate from public drawing updates, which cannot supply decision attribution.
  on('viewer:decision', value => {
    const decision = normalizeVisualDecision(value), r = refreshRecord();
    if (!decision || !r) return;
    r.decisions = [...r.decisions.filter(row => row.source !== decision.source), { ...decision, until: now() + decision.ttlMs }].slice(-4);
  });
  // Trusted host port only: browser drawing updates cannot impersonate model/tool records.
  on('viewer:activity', value => { const r = refreshRecord(); if (r) r.activity.put(value); });
  on('viewer:agent', (update, acknowledge) => { const result = publish(update); if (typeof acknowledge === 'function') acknowledge(result); });
  on('spawn', () => { ended = false; hub.remove(owner); record = null; refreshRecord(); flush(true); });
  on('respawn', () => { hub.remove(owner); record = null; flush(true); });
  on('end', () => { ended = true; hub.remove(owner); record = null; flush(true); });
  on('path_update', result => {
    const r = refreshRecord(); if (!r) return;
    const status = ['noPath', 'timeout'].includes(result?.status) ? 'blocked' : result?.status === 'partial' ? 'planning' : 'moving';
    const route = normalizeVisualRoute({ points: result?.path ?? [], goal: bot.pathfinder?.goal, status, source: 'pathfinder' });
    if (route) r.route = { ...route, until: now() + route.ttlMs };
  });
  for (const [event, status] of [['path_reset', 'planning'], ['path_stop', 'stopped'], ['goal_reached', 'reached']]) on(event, () => {
    const r = refreshRecord(); if (!r?.route) return;
    // A path reset invalidates its old geometry. GoalNear matching is still the
    // pathfinder's job; only goal_reached is reported as arrival.
    r.route = { ...r.route, status, points: [], until: now() + 3000 };
  });
  const stopPackets = observeSentPackets(bot._client, (name, data) => {
    const r = refreshRecord(); if (!r || !data) return;
    let kind, target = null, detail = '';
    if (name === 'use_entity') {
      kind = data.mouse === 1 ? 'attack' : 'interact'; target = visualPoint(bot.entities?.[data.target]?.position);
      detail = `实体 ${data.target}`;
    } else if (name === 'block_dig' && [0, 1, 2].includes(data.status)) {
      kind = 'gather'; target = visualPoint(data.location); detail = data.status === 0 ? '开始采集' : data.status === 1 ? '取消采集' : '提交采集';
    } else if (name === 'block_place' || name === 'use_item') {
      kind = 'interact'; target = visualPoint(data.location); detail = '使用物品 / 方块';
    } else if (name === 'window_click') {
      kind = 'inventory'; detail = `槽位 ${Number.isSafeInteger(data.slot) ? data.slot : '?'} · ${data.mouseButton === 1 ? '右键' : '左键'}`;
    } else return; // Especially never record chat, /login, command text or NBT.
    r.operations.push({ id: ++operationId, kind, button: kind === 'attack' || kind === 'gather' ? 'left' : kind === 'inventory' && data.mouseButton !== 1 ? 'left' : 'right',
      ...(kind === 'inventory' ? { slot: Number.isSafeInteger(data.slot) ? data.slot : null,
        windowId: Number.isSafeInteger(data.windowId) ? data.windowId : null } : {}),
      detail, target, from: visualPoint(bot.entity.position), until: now() + (kind === 'inventory' ? 3200 : 1800) });
    r.operations = r.operations.slice(-6);
  });
  function sample() {
    const r = refreshRecord(); if (!r) return;
    const time = now(), position = visualPoint(bot.entity.position);
    if (r.dimension !== (bot.game?.dimension ?? null)) {
      r.dimension = bot.game?.dimension ?? null; r.epoch = randomUUID();
      r.trail = []; r.intent = null; r.route = null; r.candidates = []; r.markers = []; r.decisions = []; r.operations = []; r.pointer = null; r.camera = null; r.presentation = null;
    }
    const previous = r.trail.at(-1);
    if (position && (!previous || Math.hypot(previous.x - position.x, previous.y - position.y, previous.z - position.z) >= .3)) {
      // Teleports create a new trail; never draw an invented walk across worlds.
      if (previous && Math.hypot(previous.x - position.x, previous.y - position.y, previous.z - position.z) > 16) r.trail = [];
      r.trail.push({ ...position, at: time }); r.trail = r.trail.slice(-24);
    }
    if (r.route?.source === 'pathfinder' && r.route.status === 'moving' && bot.pathfinder?.isMoving?.() === true) r.route.until = time + 10_000;
    let flight = null;
    try {
      const value = getFlightState();
      flight = normalizeVisualFlight(value && { ...value,
        remainingMs: Number.isFinite(value.expiresAtMs) ? Math.max(0, value.expiresAtMs - time) : null });
    } catch { /* Optional telemetry cannot interrupt the viewer or gameplay. */ }
    r.input = { controls: controls.filter(key => bot.controlState?.[key] === true), position, flight,
      yaw: Number.isFinite(bot.entity.yaw) ? bot.entity.yaw : null, pitch: Number.isFinite(bot.entity.pitch) ? bot.entity.pitch : null };
    expire(r, time);
  }
  const remaining = (value, time) => value ? { ...value, remainingMs: Math.max(0, value.until - time), until: undefined } : null;
  function flush(force = false) {
    if (closed) return; sample();
    const subject = viewerSubject(), r = subject ? hub.get(subject) : null, time = now();
    if (r) expire(r, time);
    const presentation = r?.presentation, presentationKey = presentation ? `${r.epoch}:${r.presentationRevision}` : '';
    const frame = { schemaVersion: 1, subject, available: !!r, reason: r ? null : subject ? 'AGENT_VISUAL_SOURCE_UNAVAILABLE' : 'AGENT_VISUAL_SUBJECT_UNATTACHED',
      epoch: r?.epoch ?? null, ttlMs: 3500 };
    if (r) Object.assign(frame, {
      intent: remaining(r.intent, time), route: remaining(r.route, time), camera: remaining(r.camera, time),
      candidates: r.candidates.map(v => remaining(v, time)), markers: r.markers.map(v => remaining(v, time)),
      decisions: r.decisions.map(v => remaining(v, time)),
      trail: r.trail.map(({ at, ...p }) => p), input: { ...r.input, operations: r.operations.map(v => remaining(v, time)), pointer: remaining(r.pointer, time) },
      presentation: presentation ? { id: presentation.id, revision: r.presentationRevision, kind: presentation.kind,
        title: presentation.title, caption: presentation.caption, remainingMs: Math.max(0, presentation.until - time) } : null,
    });
    // Image bytes are sent once per revision/subscriber, not in the 10 Hz state.
    const signature = JSON.stringify(frame);
    for (const [socket, sent] of sockets) {
      if (socket.connected === false) continue;
      const activityRevision = r?.activity.revision ?? -1, activityEpoch = r?.epoch ?? '';
      if (sent.activityRevision !== activityRevision || sent.activityEpoch !== activityEpoch) {
        const records = r?.activity.snapshot() ?? [], reset = sent.activityEpoch !== activityEpoch;
        const signatures = new Map(records.map(row => [row.id, JSON.stringify(row)]));
        socket.emit('agentActivity', { schema: 'agent-activity-frame/v1', available: !!r && records.length > 0,
          subject, epoch: activityEpoch, reset, records: reset ? records : records.filter(row => sent.activityRows.get(row.id) !== signatures.get(row.id)) });
        sent.activityRows = signatures; sent.activityRevision = activityRevision; sent.activityEpoch = activityEpoch;
      }
      if (force || sent.signature !== signature || time - sent.at >= 1000) {
        socket.emit('agentVisualization', { ...frame, sequence: ++sequence }); sent.signature = signature; sent.at = time;
      }
      if (presentationKey && sent.presentation !== presentationKey) socket.emit('agentPresentation', {
        schemaVersion: 1, subject, epoch: r.epoch, revision: r.presentationRevision, presentation: remaining(presentation, time) });
      sent.presentation = presentationKey;
    }
  }
  const timer = timers ? setInterval(flush, Math.max(100, intervalMs)) : null; timer?.unref?.();
  refreshRecord();
  return {
    publish, flush,
    subscribeSocket(socket) {
      if (closed) throw Error('AGENT_VISUAL_HOST_CLOSED');
      let lastPublish = -Infinity;
      const incoming = async (update, acknowledge) => {
        if (typeof acknowledge !== 'function') return;
        const finish = result => { if (sockets.has(socket) && !closed) acknowledge(result); };
        if (now() - lastPublish < 200) { finish({ ok: false, code: 'AGENT_VISUAL_RATE_LIMIT' }); return; }
        lastPublish = now();
        let authorized = false;
        try { authorized = typeof authorizePublish === 'function' && await authorizePublish({ socket, subject: ownSubject(bot) }) === true; } catch { /* Existing host auth fails closed. */ }
        if (!authorized) { finish({ ok: false, code: 'AGENT_VISUAL_PUBLISH_FORBIDDEN' }); return; }
        if (closed || !sockets.has(socket)) return;
        finish(publish(update));
      };
      const off = () => { sockets.delete(socket); socket.off?.('disconnect', off); socket.off?.('agentVisualUpdate', incoming); };
      sockets.set(socket, { signature: '', at: -Infinity, presentation: '', activityRevision: -2, activityEpoch: null, activityRows: new Map(), off });
      socket.on('disconnect', off); socket.on('agentVisualUpdate', incoming); flush(true); return off;
    },
    dispose() {
      if (closed) return; closed = true; if (timer) clearInterval(timer);
      stopPackets(); for (const [event, handler] of hooks) bot.off(event, handler);
      publishers.delete(bot); hub.remove(owner); record = null;
      for (const [socket, row] of sockets) {
        socket.emit('agentActivity', { schema: 'agent-activity-frame/v1', available: false, reset: false, records: [] });
        socket.emit('agentVisualization', { schemaVersion: 1, subject: null, available: false, reason: 'AGENT_VISUAL_HOST_CLOSED', sequence: ++sequence, ttlMs: 3500 }); row.off();
      }
      sockets.clear();
    },
  };
}
