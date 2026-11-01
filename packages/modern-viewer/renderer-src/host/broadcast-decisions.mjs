import { createHash } from 'node:crypto';

/** Camera-specific policy. Game state and the optional DecisionPort belong to the host. */
export const CAMERA_CHOICE_PROTOCOL = 'mcvisual.director-choice/v1';
export const CAMERA_JUDGES = Object.freeze([
  { id: 'story', weight: 1, instructions: '选择最有真实事件价值的完整镜头方案。优先事件因果和正在发生的交流，不编造剧情，不为轮流露脸而切换。' },
  { id: 'action', weight: 1.3, instructions: '选择最能看清当前操作、威胁、协作或结果的完整方案。关键动作期间保持空间连续，不用花哨镜头遮住动作。' },
  { id: 'space', weight: 1.2, instructions: '选择能解释主体与环境关系的完整方案。窄矿道、楼层重叠、遮挡和未加载区域应采用已经验证可见的候选。' },
  { id: 'composition', weight: 0.8, instructions: '选择主体与动作目标可辨、留白合理、轴线连续的完整方案。不要把好看的设定图或推测表情当作现场证据。' },
  { id: 'motion', weight: 0.6, instructions: '只有运镜确实揭示新信息且整段路径可用时才选择运动方案。静止和保持当前镜头都是有效选择。' },
  { id: 'continuity', weight: 1.1, instructions: '优先保持本段叙事、屏幕方向和观众空间感。短暂波动选keep；不要用小幅改善换取重复切镜。' },
]);
const roles = new Map(CAMERA_JUDGES.map(x => [x.id, x]));
const creative = new Set(['orbit_arc', 'push_in', 'pull_out', 'pedestal', 'truck']);
const motions = new Set(['hold', 'follow', 'native_pov', ...creative]);
const ident = x => typeof x === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,71}$/.test(x);
const finite = x => typeof x === 'number' && Number.isFinite(x);
const unit = x => finite(x) && x >= 0 && x <= 1;
const fresh = (at, now, age) => finite(at) && at <= now && now - at <= age;
const copy = x => structuredClone(x);
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 32);
const failure = code => { throw Object.assign(new Error(code), { code }); };
const metrics = q => q && ['visibility', 'action', 'interest', 'composition', 'stability'].every(k => unit(q[k]));
const score = q => .3 * q.visibility + .3 * q.action + .2 * q.interest + .1 * q.composition + .1 * q.stability;
const planFields = ['subjectUuid', 'sourceId', 'shotId', 'motion', 'axisKey', 'axisSide'];
const samePlan = (a, b) => !!a && !!b && planFields.every(k => a[k] === b[k]);
const planKey = plan => planFields.map(k => plan?.[k] ?? null);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const activityKinds = new Set(['idle', 'combat', 'dungeon', 'fishing', 'crafting', 'interaction', 'conversation', 'travel', 'gathering', 'building', 'unknown']);
function verifiedActivity(subject, scope, now, maxAgeMs) {
  const a = subject.activity;
  if (subject.scope !== scope || !fresh(subject.at, now, maxAgeMs) || !a || !fresh(a.at, now, maxAgeMs)
    || !activityKinds.has(a.kind) || !['native', 'game'].includes(a.provenance) || !ident(a.evidenceId)
    || !finite(a.since) || a.since < 0 || a.since > now || !finite(a.lastProgressAt) || a.lastProgressAt < 0 || a.lastProgressAt > now
    || (a.kind === 'idle' && a.lastProgressAt > a.since)) return null;
  return { subjectUuid: subject.uuid, kind: a.kind, at: a.at, since: a.since, lastProgressAt: a.lastProgressAt,
    critical: a.critical === true, provenance: a.provenance, evidenceId: a.evidenceId };
}
function activityState(activity, now, pacing) {
  const valid = activity && fresh(activity.at, now, pacing.maxAgeMs);
  const engaged = valid && ['combat', 'dungeon'].includes(activity.kind) && now - activity.lastProgressAt <= pacing.engagementGraceMs;
  return { kind: valid ? activity.kind : 'unknown', activity: valid ? activity : null,
    longIdle: !!valid && activity.kind === 'idle' && now - activity.since >= pacing.idleAfterMs,
    engaged: !!engaged, critical: !!engaged && activity.critical === true };
}

/** Only the adapter may construct executable complete plans. Models receive IDs, never coordinates or code. */
export function buildCameraDecision(observed, { now = Date.now(), maxAgeMs = 2500 } = {}) {
  if (!observed || !fresh(observed.at, now, maxAgeMs) || typeof observed.scope !== 'string' || !observed.scope
    || !ident(observed.generation) || typeof observed.sceneKey !== 'string' || observed.sceneKey.length > 160
    || !Array.isArray(observed.subjects) || observed.subjects.length > 32 || !Array.isArray(observed.shots)
    || observed.shots.length > 64 || observed.subjects.some(x => !x || typeof x.uuid !== 'string' || !x.uuid || x.uuid.length > 72)
    || (observed.facts !== undefined && (!Array.isArray(observed.facts) || observed.facts.length > 64))) failure('INVALID_DIRECTOR_OBSERVATION');
  const subjects = new Map(observed.subjects.map(x => [x.uuid, x]));
  if (subjects.size !== observed.subjects.length) failure('DUPLICATE_DIRECTOR_SUBJECT');
  const program = copy(observed.program ?? { phase: 'idle' });
  if (!['idle', 'applied', 'accepted', 'transitioning', 'unknown', 'stopped'].includes(program.phase)) failure('INVALID_PROGRAM_PHASE');
  if (program.quality !== undefined && !metrics(program.quality)) failure('INVALID_PROGRAM_QUALITY');
  if (program.phase === 'applied' && (!ident(program.operationId) || program.rendered !== true
    || !fresh(program.renderedAt, now, maxAgeMs) || !finite(program.appliedAt) || program.appliedAt > now
    || !program.plan || typeof program.plan.subjectUuid !== 'string' || !ident(program.plan.sourceId)
    || !ident(program.plan.shotId) || !motions.has(program.plan.motion) || !metrics(program.quality))) failure('UNPROVEN_PROGRAM_IMAGE');
  const quality = program.quality ?? { visibility: .5, action: .5, interest: .5, composition: .5, stability: .5 };
  const options = [{ id: 'keep', plan: program.plan ?? null, quality, evidenceIds: [], ruleScore: score(quality) }];
  const excluded = [], seen = new Set(['keep']);
  for (const shot of observed.shots) {
    if (!ident(shot.id) || seen.has(shot.id)) failure('INVALID_OR_DUPLICATE_SHOT_ID');
    seen.add(shot.id);
    const subject = subjects.get(shot.subjectUuid);
    let reason = null;
    if (shot.ready !== true || shot.scope !== observed.scope || !fresh(shot.at, now, maxAgeMs)
      || !subject || subject.loaded !== true || subject.alive !== true || subject.scope !== observed.scope
      || !fresh(subject.at, now, maxAgeMs)) reason = 'unavailable_or_stale';
    else if (!ident(shot.sourceId) || !ident(shot.shotId) || !motions.has(shot.motion)
      || !metrics(shot.quality) || !Array.isArray(shot.evidenceIds) || !shot.evidenceIds.length
      || shot.evidenceIds.length > 8 || shot.evidenceIds.some(x => !ident(x))) reason = 'invalid_plan';
    else if (creative.has(shot.motion) && shot.pathClear !== true) reason = 'unverified_motion_path';
    else if (shot.motion === 'follow' && shot.collisionReady !== true) reason = 'missing_follow_collision';
    else if (shot.requiresFloorMask === true && shot.floorSafe !== true) reason = 'unverified_floor';
    else if (program.plan?.axisKey && program.plan.axisKey === shot.axisKey && program.plan.axisSide
      && shot.axisSide && program.plan.axisSide !== shot.axisSide && shot.axisBridge !== true) reason = 'axis_crossing';
    if (reason) { excluded.push({ id: shot.id, reason }); continue; }
    const plan = Object.fromEntries(['subjectUuid', 'sourceId', 'shotId', 'motion', 'axisKey', 'axisSide']
      .filter(k => shot[k] !== undefined).map(k => [k, shot[k]]));
    if (samePlan(plan, program.plan)) continue;
    options.push({ id: shot.id, plan, quality: copy(shot.quality), evidenceIds: [...shot.evidenceIds], ruleScore: score(shot.quality) });
  }
  // Deterministic bounded candidate set; KEEP is never removed by ranking.
  const selected = [options[0], ...options.slice(1).sort((a, b) => b.ruleScore - a.ruleScore || compare(a.id, b.id)).slice(0, 7)];
  const facts = new Map();
  for (const f of observed.facts ?? []) {
    if (!ident(f.key) || typeof f.text !== 'string' || typeof f.archiveRef !== 'string' || !f.archiveRef || f.archiveRef.length > 240) failure('INVALID_FACT_REFERENCE');
    facts.set(f.key, { key: f.key, text: f.text.slice(0, 220), truncated: f.text.length > 220, archiveRef: f.archiveRef });
  }
  if (facts.size > 12) failure('TOO_MANY_CAMERA_FACTS');
  const current = subjects.get(program.plan?.subjectUuid);
  // Emergency authority is native observation, never a model's confidence or chat assertion.
  const targetLost = !!current && current.provenance === 'native' && ident(current.evidenceId)
    && current.scope === observed.scope && fresh(current.at, now, maxAgeMs)
    && (current.loaded === false || current.alive === false);
  const occluded = quality.visibility < .2 && finite(program.occlusionObservedMs) && program.occlusionObservedMs >= 2500
    && program.visibilityProvenance === 'native' && ident(program.visibilityEvidenceId);
  const compactFacts = [...facts.values()].sort((a, b) => compare(a.key, b.key));
  const relevantSubjects = new Set(selected.flatMap(x => x.plan ? [x.plan.subjectUuid] : []));
  const activities = observed.subjects.filter(s => relevantSubjects.has(s.uuid))
    .map(s => verifiedActivity(s, observed.scope, now, maxAgeMs)).filter(Boolean).sort((a, b) => compare(a.subjectUuid, b.subjectUuid));
  const binding = { scope: observed.scope, generation: observed.generation };
  // Clocks and raw continuous position samples are excluded. Producers supply semantic sceneKey and keyed facts.
  const revision = hash([binding, observed.sceneKey, program.operationId ?? null, targetLost, occluded,
    selected.map(o => [o.id, o.plan, ['visibility', 'action', 'interest', 'composition', 'stability'].map(k => Math.round(o.quality[k] * 10) / 10), o.evidenceIds]), compactFacts,
    activities.map(({at: _sampleTime, ...meaningful}) => meaningful)]);
  return { schema: CAMERA_CHOICE_PROTOCOL, ...binding, revision, observedAt: observed.at,
    manualLocked: observed.manualLocked === true, program, options: selected, facts: compactFacts, activities, excluded,
    emergency: targetLost ? 'target_lost' : occluded ? 'persistent_occlusion' : null };
}

/** Uses the existing core DecisionPort.request shape; no endpoint, model, credentials, loop or camera writes. */
export function createCameraJudgePanel(decisions, {
  now = Date.now, timeoutMs = 800, minIntervalMs = 3000, maxCallsPerMinute = 12,
  maxAgeMs = 2500, contextTokens = 8192, reserveOutputTokens = 1024, prefixTokens = 0, toolDescriptionTokens = 0,
  countTokens = text => Buffer.byteLength(text, 'utf8'), provider, onAudit = () => {},
} = {}) {
  if (![timeoutMs, minIntervalMs, maxCallsPerMinute, maxAgeMs, contextTokens, reserveOutputTokens, prefixTokens, toolDescriptionTokens].every(finite)
    || timeoutMs < 1 || timeoutMs > 3000 || minIntervalMs < 1000 || maxCallsPerMinute < 1 || maxCallsPerMinute > 60
    || maxAgeMs < 1 || prefixTokens < 0 || toolDescriptionTokens < 0 || reserveOutputTokens < 64 || contextTokens <= reserveOutputTokens) failure('INVALID_JUDGE_BUDGET');
  let stopped = false, inFlight = null, lastStarted = -Infinity, lastRevision = null, cached = null;
  const calls = [], stats = { calls: 0, timeouts: 0, invalid: 0, errors: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0 };
  const audit = event => { try { onAudit(copy(event)); } catch { /* Host logging never grants camera authority. */ } };
  return {
    async judge(packet, { roles: requested = ['story', 'action', 'continuity'], signal } = {}) {
      if (stopped || signal?.aborted) return { kind: 'skipped', reason: 'stopped_or_aborted' };
      if (packet?.schema !== CAMERA_CHOICE_PROTOCOL || !fresh(packet.observedAt, now(), maxAgeMs)) return { kind: 'skipped', reason: 'stale' };
      if (packet.manualLocked || ['accepted', 'transitioning', 'unknown', 'stopped'].includes(packet.program.phase)) return { kind: 'skipped', reason: 'camera_blocked' };
      // Preserve exactly the packet that was judged if the host updates its live object during inference.
      packet = copy(packet);
      if (!decisions?.request) return { kind: 'skipped', reason: 'no_model' };
      if (packet.options.length <= 1) return { kind: 'skipped', reason: 'only_keep' };
      if (!requested.length || requested.length > 6 || new Set(requested).size !== requested.length || requested.some(x => !roles.has(x))) failure('INVALID_JUDGE_ROLES');
      if (inFlight) return { kind: 'skipped', reason: 'busy' };
      const requestKey = hash([packet.scope, packet.generation, packet.revision, requested]);
      if (requestKey === lastRevision) return cached ? copy(cached) : { kind: 'skipped', reason: 'duplicate' };
      const started = now();
      while (calls.length && calls[0] <= started - 60000) calls.shift();
      if (started - lastStarted < minIntervalMs || calls.length >= maxCallsPerMinute) return { kind: 'skipped', reason: 'rate_limited' };
      const questions = Object.fromEntries(requested.map(id => [id, { type: 'choice', instructions: roles.get(id).instructions,
        criteria: Object.fromEntries(packet.options.map(o => [o.id, o.id === 'keep' ? '保持当前节目镜头' : '采用 state.options 中同 ID 的完整方案，不组合或更改其中字段'])) }]));
      const request = { questions, state: { schema: packet.schema, scope: packet.scope, generation: packet.generation,
        revision: packet.revision, options: packet.options, facts: packet.facts, activities: packet.activities ?? [] } };
      const inputTokens = countTokens(JSON.stringify(request)) + prefixTokens + toolDescriptionTokens;
      if (!finite(inputTokens) || inputTokens < 0 || inputTokens + reserveOutputTokens > contextTokens) return { kind: 'skipped', reason: 'input_budget' };
      const controller = new AbortController();
      let end;
      const ended = new Promise(resolve => { end = resolve; });
      const abort = () => { controller.abort(); end({ kind: 'skipped', reason: 'stopped_or_aborted' }); };
      signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => { controller.abort(); stats.timeouts++; end({ kind: 'skipped', reason: 'timeout' }); }, timeoutMs);
      inFlight = { controller, end }; lastStarted = started; lastRevision = requestKey; cached = null; calls.push(started); stats.calls++;
      audit({ kind: 'request', at: started, request, budget: { inputTokens, reserveOutputTokens, contextTokens } });
      // A non-cooperative provider stays busy even after the caller's deadline. No overlapping retry storm.
      const operation = Promise.resolve().then(() => {
        if (controller.signal.aborted || stopped) throw Error('aborted');
        return decisions.request(copy(request), { provider, signal: controller.signal, timeoutMs });
      }).then(answer => {
        audit({ kind: 'response', revision: packet.revision, at: now(), answer });
        if (stopped || controller.signal.aborted || !fresh(packet.observedAt, now(), maxAgeMs)) return { kind: 'skipped', reason: 'expired' };
        const votes = requested.map(role => ({ role, choice: answer?.answers?.[role]?.choice }));
        if (votes.some(v => !packet.options.some(o => o.id === v.choice))) { stats.invalid++; return { kind: 'skipped', reason: 'invalid_choice' }; }
        const usage = answer?.usage;
        if (finite(usage?.input_tokens) && usage.input_tokens >= 0) stats.inputTokens += usage.input_tokens;
        if (finite(usage?.output_tokens) && usage.output_tokens >= 0) stats.outputTokens += usage.output_tokens;
        stats.latencyMs += Math.max(0, now() - started);
        cached = { kind: 'votes', schema: CAMERA_CHOICE_PROTOCOL, scope: packet.scope, generation: packet.generation,
          revision: packet.revision, at: now(), votes };
        return copy(cached);
      }, () => { stats.errors++; return { kind: 'skipped', reason: 'provider_error' }; });
      operation.finally(() => { if (inFlight?.controller === controller) inFlight = null; }).catch(() => {});
      try { return await Promise.race([operation, ended]); }
      finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
    },
    stop() { stopped = true; inFlight?.controller.abort(); inFlight?.end({ kind: 'skipped', reason: 'stopped_or_aborted' }); cached = null; },
    stats() { return { ...stats, busy: !!inFlight, stopped }; },
  };
}

export const CAMERA_PACING_DEFAULTS = Object.freeze({
  minShotMs: 10000, minSubjectMs: 30000, returnSubjectMs: 60000, creativeCooldownMs: 60000,
  sustainMs: 1200, improvement: .14, modelWeight: .08, cutsPerMinute: 4, subjectsPerMinute: 2,
  emergencyGapMs: 5000, maxAgeMs: 2500,
  idleAfterMs: 20000, idleScorePenalty: .35, combatSubjectMs: 90000, dungeonSubjectMs: 60000, engagementGraceMs: 8000,
});

/** Single recommendation arbiter. The host still owns the one transactional SDK/native executor. */
export class CameraChoiceArbiter {
  constructor({ now = Date.now, ...pacing } = {}) {
    this.now = now; this.p = { ...CAMERA_PACING_DEFAULTS, ...pacing };
    const p = this.p;
    if (Object.keys(pacing).some(k => !(k in CAMERA_PACING_DEFAULTS)) || !Object.values(p).every(finite)
      || p.minShotMs < 10000 || p.minSubjectMs < p.minShotMs || p.returnSubjectMs < 0 || p.creativeCooldownMs < 0
      || p.sustainMs < 250 || p.improvement < .05 || p.improvement > 1 || p.modelWeight < 0 || p.modelWeight > .15
      || p.cutsPerMinute < 1 || p.subjectsPerMinute < 1 || p.emergencyGapMs < 1000 || p.maxAgeMs < 1
      || p.idleAfterMs < 10000 || !unit(p.idleScorePenalty) || p.idleScorePenalty > .5
      || p.combatSubjectMs < p.minShotMs || p.dungeonSubjectMs < p.minShotMs || p.engagementGraceMs < 1000) failure('INVALID_CAMERA_PACING');
    this.stopped = false; this.binding = null; this.current = null; this.history = []; this.left = new Map();
    this.seen = new Map(); this.lastCreative = -Infinity; this.challenger = null;
  }
  stop() { this.stopped = true; this.challenger = null; }
  decide(packet, ballots) {
    const now = this.now(), keep = reason => { this.challenger = null; return { kind: 'keep', choice: 'keep', reason }; };
    if (this.stopped) return keep('stopped');
    if (packet?.schema !== CAMERA_CHOICE_PROTOCOL || !fresh(packet.observedAt, now, this.p.maxAgeMs)) return keep('stale');
    const binding = JSON.stringify([packet.scope, packet.generation]);
    if (this.binding && this.binding !== binding) { this.stop(); return keep('binding_changed'); }
    this.binding = binding;
    if (packet.manualLocked) return keep('manual_lock');
    const program = packet.program;
    if (program.phase !== 'idle' && program.phase !== 'applied') return keep(`native_${program.phase}`);
    if (program.transitionActive === true) return keep('transition_active');
    if (program.phase === 'applied') {
      if (program.rendered !== true || !fresh(program.renderedAt, now, this.p.maxAgeMs)) return keep('awaiting_render_evidence');
      const signature = hash(planKey(program.plan));
      if (this.seen.has(program.operationId) && this.seen.get(program.operationId) !== signature) { this.stop(); return keep('operation_conflict'); }
      if (this.current?.operationId !== program.operationId) {
        if (this.seen.has(program.operationId)) { this.stop(); return keep('program_replayed'); }
        if (this.seen.size >= 256) return keep('host_archive_required');
        const previous = this.current, changed = previous && !samePlan(previous.plan, program.plan);
        const subjectChanged = previous && previous.plan.subjectUuid !== program.plan.subjectUuid;
        if (subjectChanged) this.left.set(previous.plan.subjectUuid, now);
        if (changed) this.history.push({ at: now, subjectChanged: !!subjectChanged });
        if (creative.has(program.plan.motion)) this.lastCreative = now;
        this.current = { operationId: program.operationId, plan: copy(program.plan),
          shotSince: now, subjectSince: !previous || subjectChanged ? now : previous.subjectSince };
        this.seen.set(program.operationId, signature); this.challenger = null;
      }
    } else if (this.current) return keep('program_evidence_lost');
    this.history = this.history.filter(x => now - x.at < 60000);
    for (const [subject, at] of this.left) if (now - at >= this.p.returnSubjectMs) this.left.delete(subject);
    const validVotes = ballots?.kind === 'votes' && ballots.schema === CAMERA_CHOICE_PROTOCOL
      && ballots.scope === packet.scope && ballots.generation === packet.generation && ballots.revision === packet.revision
      && fresh(ballots.at, now, this.p.maxAgeMs) && Array.isArray(ballots.votes)
      && ballots.votes.length <= roles.size && new Set(ballots.votes.map(v => v.role)).size === ballots.votes.length
      && ballots.votes.every(v => roles.has(v.role) && packet.options.some(o => o.id === v.choice));
    const total = validVotes ? ballots.votes.reduce((s, v) => s + roles.get(v.role).weight, 0) : 0;
    const activity = new Map((packet.activities ?? []).map(a => [a.subjectUuid, activityState(a, now, this.p)]));
    const currentActivity = activity.get(this.current?.plan.subjectUuid);
    const rank = o => o.ruleScore - (activity.get(o.plan?.subjectUuid)?.longIdle ? this.p.idleScorePenalty : 0)
      + (total ? this.p.modelWeight * ballots.votes.reduce((s, v) => s + (v.choice === o.id ? roles.get(v.role).weight : 0), 0) / total : 0);
    const keepScore = rank(packet.options[0]);
    let choices = packet.options.slice(1);
    const emergency = this.current ? packet.emergency : null;
    if (emergency) choices = choices.filter(x => x.quality.visibility >= .5);
    if (emergency === 'persistent_occlusion') {
      const sameSubject = choices.filter(x => x.plan.subjectUuid === this.current.plan.subjectUuid && !creative.has(x.plan.motion));
      if (sameSubject.length) choices = sameSubject;
    }
    choices = choices.filter(o => {
      const crossSubject = this.current && o.plan.subjectUuid !== this.current.plan.subjectUuid;
      if (emergency) return !creative.has(o.plan.motion);
      if (this.current && now - this.current.shotSince < this.p.minShotMs) return false;
      let subjectHoldUntil = this.current ? this.current.subjectSince + this.p.minSubjectMs : -Infinity;
      if (this.current && currentActivity?.longIdle) subjectHoldUntil = this.current.subjectSince + this.p.minShotMs;
      if (this.current && currentActivity?.engaged) subjectHoldUntil = Math.max(subjectHoldUntil,
        Math.max(this.current.subjectSince, currentActivity.activity.since) + (currentActivity.kind === 'combat' ? this.p.combatSubjectMs : this.p.dungeonSubjectMs));
      if (crossSubject && (now < subjectHoldUntil || currentActivity?.critical || this.left.has(o.plan.subjectUuid)
        || this.history.filter(x => x.subjectChanged).length >= this.p.subjectsPerMinute)) return false;
      if ((currentActivity?.kind === 'combat' && currentActivity.engaged || currentActivity?.critical) && creative.has(o.plan.motion)) return false;
      if (this.history.length >= this.p.cutsPerMinute) return false;
      return !creative.has(o.plan.motion) || now - this.lastCreative >= this.p.creativeCooldownMs;
    }).sort((a, b) => rank(b) - rank(a) || compare(a.id, b.id));
    const winner = choices[0];
    if (!winner) return keep('no_eligible_improvement');
    if (emergency && this.history.length && now - this.history.at(-1).at < this.p.emergencyGapMs) return keep('emergency_cooldown');
    if (!emergency && rank(winner) - keepScore < this.p.improvement) return keep('insufficient_gain');
    if (!emergency) {
      // Keep a challenger through fresh equivalent snapshots, but never through a different program or plan.
      const key = hash([binding, program.operationId, winner.id, winner.plan]);
      if (this.challenger?.key !== key) { this.challenger = { key, since: now }; return { kind: 'keep', choice: 'keep', reason: 'sustaining_gain' }; }
      if (now - this.challenger.since < this.p.sustainMs) return { kind: 'keep', choice: 'keep', reason: 'sustaining_gain' };
    }
    return { kind: 'recommendation', schema: CAMERA_CHOICE_PROTOCOL, choice: winner.id, recommendationId: hash([binding, program.operationId, winner.id, winner.plan]),
      scope: packet.scope, generation: packet.generation, revision: packet.revision, observedAt: packet.observedAt,
      plan: copy(winner.plan), holdMs: this.p.minShotMs, reason: emergency || (currentActivity?.longIdle && winner.plan.subjectUuid !== this.current?.plan.subjectUuid
        ? 'idle_subject' : validVotes ? 'sustained_rules_and_judges' : 'sustained_rules'),
      requiresFreshExecutionCheck: true };
  }
}
