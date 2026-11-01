import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCameraDecision, createCameraJudgePanel, CameraChoiceArbiter, CAMERA_JUDGES } from '../../host/broadcast-decisions.mjs';

const q = (n, changes = {}) => ({ visibility: n, action: n, interest: n, composition: n, stability: n, ...changes });
const plan = subjectUuid => ({ subjectUuid, sourceId: 'java', shotId: 'rear', motion: 'follow' });
function fixture() {
  let now = 0;
  const program = { phase: 'applied', operationId: 'initial', plan: plan('A'), quality: q(.3), rendered: true, appliedAt: 0, renderedAt: 0 };
  const observation = { scope: 'world', generation: 'generationA', at: 0, sceneKey: 'travel', program,
    subjects: ['A', 'B', 'C'].map(uuid => ({ uuid, scope: 'world', at: 0, loaded: true, alive: true, provenance: 'native', evidenceId: `entity${uuid}` })),
    shots: ['A', 'B', 'C'].map(uuid => ({ id: `follow${uuid}`, ...plan(uuid), scope: 'world', at: 0, ready: true,
      collisionReady: true, quality: q(.9), evidenceIds: [`entity${uuid}`] })), facts: [] };
  const packet = () => {
    observation.at = now; program.renderedAt = now;
    for (const x of [...observation.subjects, ...observation.shots]) x.at = now;
    for (const subject of observation.subjects) if (subject.activity) subject.activity.at = now;
    return buildCameraDecision(observation, { now });
  };
  const apply = (recommendation, id = `operation${now}`) => Object.assign(program, { phase: 'applied', operationId: id, plan: recommendation.plan,
    appliedAt: now, renderedAt: now, rendered: true });
  return { now: () => now, tick: ms => { now += ms; }, packet, observation, program, apply };
}
const ballots = (p, choice, roleList = ['story', 'action', 'continuity']) => ({ kind: 'votes', schema: p.schema, scope: p.scope,
  generation: p.generation, revision: p.revision, at: p.observedAt, votes: roleList.map(role => ({ role, choice })) });

test('clock-only refresh is stable; keyed facts replace rather than accumulate', () => {
  const f = fixture(); f.observation.facts = [{ key: 'activity', text: 'walking', archiveRef: 'archive/a' }, { key: 'activity', text: 'mining', archiveRef: 'archive/b' }];
  const p = f.packet(); f.tick(1000); const next = f.packet();
  assert.equal(p.revision, next.revision); assert.equal(next.facts.length, 1); assert.equal(next.facts[0].text, 'mining');
  f.observation.sceneKey = 'combat'; assert.notEqual(f.packet().revision, p.revision);
});

test('capabilities exclude unknown paths, unavailable actors, unverified floors and cross-axis plans', () => {
  const f = fixture(); f.program.plan = { ...plan('A'), axisKey: 'fight', axisSide: 'left' };
  const original = f.observation.shots[1];
  f.observation.shots = [
    { ...original, id: 'unknownPath', motion: 'orbit_arc' },
    { ...original, id: 'badFloor', requiresFloorMask: true },
    { ...original, id: 'crossAxis', axisKey: 'fight', axisSide: 'right' },
    { ...original, id: 'safeFollow' },
  ];
  const p = f.packet(); assert.deepEqual(p.options.map(x => x.id), ['keep', 'safeFollow']);
  assert.deepEqual(p.excluded.map(x => x.reason), ['unverified_motion_path', 'unverified_floor', 'axis_crossing']);
  f.observation.subjects[1].loaded = false; assert.deepEqual(f.packet().options.map(x => x.id), ['keep']);
});

test('only bounded whole-plan IDs enter a single DecisionPort batch; all six roles can share it', async () => {
  const f = fixture(); let request, options;
  const panel = createCameraJudgePanel({ async request(input, config) { request = input; options = config;
    return { answers: Object.fromEntries(Object.keys(input.questions).map(k => [k, { choice: 'followB', confidence: .99 }])),
      usage: { input_tokens: 133, output_tokens: 12, cached_input_tokens: 100 } }; } }, { now: f.now, countTokens: () => 500 });
  const p = f.packet(), result = await panel.judge(p, { roles: CAMERA_JUDGES.map(x => x.id) });
  assert.equal(result.kind, 'votes'); assert.equal(result.votes.length, 6); assert.equal(panel.stats().calls, 1);
  assert.equal(panel.stats().inputTokens, 133); assert.equal(options.timeoutMs, 800);
  assert.equal(request.state.scope, 'world'); assert.equal(request.state.options[1].plan.subjectUuid, 'B');
  assert.deepEqual(Object.keys(request.questions.story.criteria), p.options.map(x => x.id));
  f.tick(500); await panel.judge(f.packet(), { roles: CAMERA_JUDGES.map(x => x.id) }); assert.equal(panel.stats().calls, 1);
  panel.stop(); assert.equal((await panel.judge(p)).reason, 'stopped_or_aborted');
});

test('budget measures questions plus state, reserves output, and prevents an inference call', async () => {
  const f = fixture(); let called = false, measured = '';
  const panel = createCameraJudgePanel({ request: async () => { called = true; return { answers: {} }; } }, {
    now: f.now, contextTokens: 2000, reserveOutputTokens: 1000, prefixTokens: 200, toolDescriptionTokens: 200,
    countTokens: text => { measured = text; return 601; },
  });
  assert.equal((await panel.judge(f.packet())).reason, 'input_budget'); assert.equal(called, false);
  assert.ok(measured.includes('questions') && measured.includes('instructions') && measured.includes('options'));
});

test('no model, invalid choice, input abort and per-minute budget have explicit bounded fallback', async () => {
  const f = fixture(), p = f.packet(); assert.equal((await createCameraJudgePanel(null).judge(p)).reason, 'stale');
  assert.equal((await createCameraJudgePanel(null, { now: f.now }).judge(p)).reason, 'no_model');
  let calls = 0;
  const panel = createCameraJudgePanel({ request: async () => { calls++; return { answers: { story: { choice: 'invented' } } }; } }, {
    now: f.now, maxCallsPerMinute: 1, countTokens: () => 100,
  });
  assert.equal((await panel.judge(p, { roles: ['story'] })).reason, 'invalid_choice');
  f.tick(5000); f.observation.sceneKey = 'new'; assert.equal((await panel.judge(f.packet())).reason, 'rate_limited'); assert.equal(calls, 1);
  const controller = new AbortController(); controller.abort(); assert.equal((await panel.judge(f.packet(), { signal: controller.signal })).reason, 'stopped_or_aborted');
});

test('deadline on an uncooperative provider does not spawn overlapping inference or revive after stop', async () => {
  const f = fixture(); let resolve, calls = 0;
  const panel = createCameraJudgePanel({ request: () => { calls++; return new Promise(r => { resolve = r; }); } }, { now: f.now, timeoutMs: 10, countTokens: () => 100 });
  assert.equal((await panel.judge(f.packet())).reason, 'timeout'); assert.equal(panel.stats().busy, true);
  f.tick(3001); f.observation.sceneKey = 'new'; assert.equal((await panel.judge(f.packet())).reason, 'busy');
  panel.stop(); resolve({ answers: { story: { choice: 'followB' } } }); await new Promise(r => setImmediate(r));
  assert.equal(panel.stats().busy, false); assert.equal((await panel.judge(f.packet())).reason, 'stopped_or_aborted'); assert.equal(calls, 1);
});

test('stopping an active judge call promptly cancels its wait even when the provider ignores abort', async () => {
  const f = fixture(); let resolve;
  const panel = createCameraJudgePanel({ request: () => new Promise(r => { resolve = r; }) }, { now: f.now, countTokens: () => 100 });
  const pending = panel.judge(f.packet()); await new Promise(r => setImmediate(r)); panel.stop();
  assert.equal((await pending).reason, 'stopped_or_aborted'); resolve({ answers: {} });
});

test('subject dwell starts with observed rendered program, not a proposal or RPC acceptance', () => {
  const f = fixture(), arbiter = new CameraChoiceArbiter({ now: f.now });
  f.program.phase = 'accepted'; assert.equal(arbiter.decide(f.packet()).reason, 'native_accepted');
  f.tick(30000); f.program.phase = 'applied'; assert.equal(arbiter.decide(f.packet()).kind, 'keep');
  f.tick(29900); assert.equal(arbiter.decide(f.packet()).kind, 'keep');
  f.tick(100); assert.equal(arbiter.decide(f.packet()).reason, 'sustaining_gain');
  f.tick(1200); const result = arbiter.decide(f.packet()); assert.equal(result.kind, 'recommendation'); assert.equal(result.plan.subjectUuid, 'B');
  assert.equal(arbiter.decide(f.packet()).recommendationId, result.recommendationId, 'repeated suggestion is one stable proposal');
});

test('manual, pending, transition, unknown and changed binding cannot be overridden by an emergency', () => {
  const f = fixture(), arbiter = new CameraChoiceArbiter({ now: f.now }); arbiter.decide(f.packet());
  f.observation.subjects[0].alive = false;
  f.observation.manualLocked = true; assert.equal(arbiter.decide(f.packet()).reason, 'manual_lock'); f.observation.manualLocked = false;
  for (const phase of ['accepted', 'transitioning', 'unknown', 'stopped']) { f.program.phase = phase; assert.equal(arbiter.decide(f.packet()).reason, `native_${phase}`); }
  f.program.phase = 'applied'; f.program.transitionActive = true; assert.equal(arbiter.decide(f.packet()).reason, 'transition_active');
  f.program.transitionActive = false; f.observation.generation = 'newGeneration'; assert.equal(arbiter.decide(f.packet()).reason, 'binding_changed');
  f.observation.generation = 'generationA'; assert.equal(arbiter.decide(f.packet()).reason, 'stopped');
});

test('native target loss can break normal dwell; untrusted chat cannot supply that proof', () => {
  const f = fixture(), a = new CameraChoiceArbiter({ now: f.now }); a.decide(f.packet()); f.tick(100);
  f.observation.subjects[0].alive = false; f.observation.subjects[0].provenance = 'chat';
  assert.equal(a.decide(f.packet()).kind, 'keep'); f.observation.subjects[0].provenance = 'native';
  const result = a.decide(f.packet()); assert.equal(result.kind, 'recommendation'); assert.equal(result.reason, 'target_lost');
});

test('persistent verified occlusion prefers a same-subject stable reframe; a brief obstruction does not cut', () => {
  const f = fixture(), a = new CameraChoiceArbiter({ now: f.now }); a.decide(f.packet());
  f.program.quality = q(.1); f.program.visibilityProvenance = 'native'; f.program.visibilityEvidenceId = 'raycastA';
  f.observation.shots[0].shotId = 'shoulder'; f.observation.shots[0].quality = q(.6); f.program.occlusionObservedMs = 300;
  assert.equal(a.decide(f.packet()).kind, 'keep'); f.program.occlusionObservedMs = 2500;
  const result = a.decide(f.packet()); assert.equal(result.kind, 'recommendation'); assert.equal(result.plan.subjectUuid, 'A');
});

test('late, duplicate-role and other-revision ballots cannot turn a marginal option into a switch', () => {
  const f = fixture(), a = new CameraChoiceArbiter({ now: f.now }); a.decide(f.packet()); f.tick(30000);
  f.observation.shots.forEach(x => { x.quality = q(.40); });
  const p = f.packet(), bad = ballots(p, 'followB'); bad.revision = 'old';
  assert.equal(a.decide(p, bad).reason, 'insufficient_gain');
  bad.revision = p.revision; bad.votes.push(bad.votes[0]); assert.equal(a.decide(p, bad).reason, 'insufficient_gain');
  const good = ballots(p, 'followB'); assert.equal(a.decide(p, good).reason, 'sustaining_gain');
  f.tick(1200); const next = f.packet(); good.revision = next.revision; good.at = f.now(); assert.equal(a.decide(next, good).kind, 'recommendation');
});

test('10 minute alternating-critic replay makes no oscillating cuts', () => {
  const f = fixture(), a = new CameraChoiceArbiter({ now: f.now }); let proposals = 0;
  for (let i = 0; i < 1200; i++) { const p = f.packet(); const result = a.decide(p, ballots(p, i % 2 ? 'followB' : 'followC'));
    if (result.kind === 'recommendation') { proposals++; f.apply(result); } f.tick(500); }
  assert.equal(proposals, 0);
});

test('10 minute real program replay bounds switch density and prevents immediate subject returns', context => {
  const f = fixture(), a = new CameraChoiceArbiter({ now: f.now }); const cuts = [];
  for (let i = 0; i < 1200; i++) {
    const p = f.packet(), result = a.decide(p);
    if (result.kind === 'recommendation') { cuts.push({ at: f.now(), from: f.program.plan.subjectUuid, to: result.plan.subjectUuid }); f.apply(result); }
    f.tick(500);
  }
  assert.ok(cuts.length >= 6 && cuts.length <= 20, `useful but bounded coverage: ${cuts.length}`);
  context.diagnostic(`600 second structured replay: ${cuts.length} applied subject changes; per-minute cap 2; return cooldown 60s`);
  for (const cut of cuts) assert.ok(cuts.filter(x => x.at > cut.at - 60000 && x.at <= cut.at).length <= 2);
  for (let i = 1; i < cuts.length; i++) {
    assert.ok(cuts[i].at - cuts[i - 1].at >= 30000);
    const lastExit = cuts.slice(0, i).filter(x => x.from === cuts[i].to).at(-1);
    if (lastExit) assert.ok(cuts[i].at - lastExit.at >= 60000);
  }
});

test('creative moves cool down and no model or network is invoked by packet creation or arbitration', async () => {
  const oldFetch = globalThis.fetch; globalThis.fetch = () => { throw Error('hidden network'); };
  try {
    const f = fixture(), a = new CameraChoiceArbiter({ now: f.now });
    f.observation.shots = [{ ...f.observation.shots[0], id: 'orbit', motion: 'orbit_arc', pathClear: true, shotId: 'arc' }];
    a.decide(f.packet()); f.tick(10000); a.decide(f.packet()); f.tick(1200); const first = a.decide(f.packet());
    assert.equal(first.kind, 'recommendation'); f.apply(first); a.decide(f.packet());
    f.observation.shots[0].shotId = 'nextArc'; f.tick(10000); assert.equal(a.decide(f.packet()).kind, 'keep');
    a.stop(); f.tick(120000); assert.equal(a.decide(f.packet()).reason, 'stopped');
    assert.equal((await createCameraJudgePanel(null, { now: f.now }).judge(f.packet())).reason, 'no_model');
  } finally { globalThis.fetch = oldFetch; }
});

test('replayed applied operation IDs do not reset pacing or resurrect old program state', () => {
  const f = fixture(), a = new CameraChoiceArbiter({ now: f.now }); a.decide(f.packet()); f.tick(30000); a.decide(f.packet()); f.tick(1200);
  const result = a.decide(f.packet()); f.apply(result); a.decide(f.packet());
  f.program.operationId = 'initial'; f.program.plan = plan('A'); assert.equal(a.decide(f.packet()).reason, 'program_replayed');
});

test('a calm readable program stays on air despite unanimous calls to rotate through actors', async () => {
  const f = fixture(), a = new CameraChoiceArbiter({ now: f.now }); f.program.quality = q(.9);
  let requests = 0;
  const panel = createCameraJudgePanel({ request: async input => { requests++; return {
    answers: Object.fromEntries(Object.keys(input.questions).map(role => [role, { choice: 'followB' }])),
  }; } }, { now: f.now, countTokens: () => 200 });
  for (let i = 0; i < 1200; i++) {
    const packet = f.packet(), advice = await panel.judge(packet);
    assert.equal(a.decide(packet, advice).kind, 'keep'); f.tick(500);
  }
  assert.equal(requests, 1, 'unchanged facts never generate a polling inference loop');
});

test('real native UUID IDs and equivalent property order preserve the observed program', () => {
  const f = fixture(), a = new CameraChoiceArbiter({ now: f.now });
  f.observation.generation = '1a000000-0000-4000-8000-000000000001'; f.program.operationId = '4b000000-0000-4000-8000-000000000002';
  a.decide(f.packet()); f.program.plan = Object.fromEntries(Object.entries(f.program.plan).reverse());
  assert.equal(a.decide(f.packet()).kind, 'keep'); assert.equal(a.stopped, false);
});

test('in-flight judges preserve their original candidate snapshot instead of accepting a mutated plan ID', async () => {
  const f = fixture(); let resolve;
  const panel = createCameraJudgePanel({ request: () => new Promise(r => { resolve = r; }) }, { now: f.now, countTokens: () => 100 });
  const packet = f.packet(), promise = panel.judge(packet, { roles: ['story'] }); await new Promise(r => setImmediate(r));
  packet.options.push({ ...packet.options[1], id: 'invented' }); resolve({ answers: { story: { choice: 'invented' } } });
  assert.equal((await promise).reason, 'invalid_choice');
});

const setActivity = (f, kind, { subject = 0, since = 0, lastProgressAt = 0, critical = false, provenance = 'game' } = {}) => {
  f.observation.subjects[subject].activity = { kind, since, lastProgressAt, critical, at: f.now(), provenance, evidenceId: `activity${subject}` };
};

test('confirmed prolonged idle makes room for a readable active subject before the normal 30 second dwell', () => {
  const f = fixture(), a = new CameraChoiceArbiter({ now: f.now }); f.program.quality = q(1);
  f.observation.shots.forEach(s => { s.quality = q(.8); }); setActivity(f, 'idle'); a.decide(f.packet());
  f.tick(19999); assert.equal(a.decide(f.packet()).kind, 'keep');
  f.tick(1); assert.equal(a.decide(f.packet()).reason, 'sustaining_gain');
  f.tick(1200); const result = a.decide(f.packet()); assert.equal(result.kind, 'recommendation'); assert.equal(result.reason, 'idle_subject');
});

test('stationary fishing, crafting, UI interaction and conversation are not penalized as idle', () => {
  for (const kind of ['fishing', 'crafting', 'interaction', 'conversation']) {
    const f = fixture(), a = new CameraChoiceArbiter({ now: f.now }); f.program.quality = q(1);
    f.observation.shots.forEach(s => { s.quality = q(.8); }); setActivity(f, kind); a.decide(f.packet());
    f.tick(90000); assert.equal(a.decide(f.packet()).kind, 'keep', kind);
  }
});

test('a new verified combat segment extends coverage from its start, including after a long prior shot', () => {
  const f = fixture(), a = new CameraChoiceArbiter({ now: f.now }); a.decide(f.packet()); f.tick(45000);
  setActivity(f, 'combat', { since: f.now(), lastProgressAt: f.now() }); assert.equal(a.decide(f.packet()).kind, 'keep');
  f.tick(89000); f.observation.subjects[0].activity.lastProgressAt = f.now(); assert.equal(a.decide(f.packet()).kind, 'keep');
  f.tick(1000); f.observation.subjects[0].activity.lastProgressAt = f.now(); assert.equal(a.decide(f.packet()).reason, 'sustaining_gain');
  f.tick(1200); assert.equal(a.decide(f.packet()).kind, 'recommendation');
});

test('an active critical phase retains the subject past the ordinary combat hold, then releases on a real phase change', () => {
  const f = fixture(), a = new CameraChoiceArbiter({ now: f.now }); setActivity(f, 'combat', { critical: true }); a.decide(f.packet());
  f.tick(120000); f.observation.subjects[0].activity.lastProgressAt = f.now(); assert.equal(a.decide(f.packet()).kind, 'keep');
  f.observation.subjects[0].activity.critical = false; assert.equal(a.decide(f.packet()).reason, 'sustaining_gain');
  f.tick(1200); assert.equal(a.decide(f.packet()).kind, 'recommendation');
});

test('active dungeon progress extends coverage to 60 seconds; a stale dungeon tag cannot lock the camera', () => {
  const f = fixture(), a = new CameraChoiceArbiter({ now: f.now }); setActivity(f, 'dungeon'); a.decide(f.packet());
  f.tick(30000); f.observation.subjects[0].activity.lastProgressAt = f.now(); assert.equal(a.decide(f.packet()).kind, 'keep');
  f.tick(30000); f.observation.subjects[0].activity.lastProgressAt = f.now(); assert.equal(a.decide(f.packet()).reason, 'sustaining_gain');
  const stale = fixture(), b = new CameraChoiceArbiter({ now: stale.now }); setActivity(stale, 'dungeon', { critical: true }); b.decide(stale.packet());
  stale.tick(30000); assert.equal(b.decide(stale.packet()).reason, 'sustaining_gain'); stale.tick(1200); assert.equal(b.decide(stale.packet()).kind, 'recommendation');
});

test('contradictory idle claims and chat-only activity cannot manufacture an early switch', () => {
  for (const data of [{ provenance: 'chat' }, { lastProgressAt: 15000 }]) {
    const f = fixture(), a = new CameraChoiceArbiter({ now: f.now }); f.program.quality = q(1);
    f.observation.shots.forEach(s => { s.quality = q(.8); }); a.decide(f.packet()); f.tick(20000); setActivity(f, 'idle', data);
    assert.equal(f.packet().activities.length, 0); assert.equal(a.decide(f.packet()).kind, 'keep');
  }
});

test('all-idle subjects do not provoke round-robin switching, and snapshot refresh does not renew a combat event', () => {
  const f = fixture(), a = new CameraChoiceArbiter({ now: f.now }); f.program.quality = q(.8);
  f.observation.shots.forEach(s => { s.quality = q(.8); });
  for (let subject = 0; subject < 3; subject++) setActivity(f, 'idle', { subject }); a.decide(f.packet());
  f.tick(30000); assert.equal(a.decide(f.packet()).kind, 'keep');
  const p = f.packet(); f.tick(1000); assert.equal(f.packet().revision, p.revision);
});

test('even a long-idle subject must finish the newly applied shot minimum and preserve manual/unknown guards', () => {
  const f = fixture(), a = new CameraChoiceArbiter({ now: f.now }); f.program.quality = q(1);
  f.observation.shots.forEach(s => { s.quality = q(.8); }); f.tick(30000); setActivity(f, 'idle'); a.decide(f.packet());
  f.tick(9999); assert.equal(a.decide(f.packet()).kind, 'keep'); f.tick(1); assert.equal(a.decide(f.packet()).reason, 'sustaining_gain');
  f.program.phase = 'unknown'; assert.equal(a.decide(f.packet()).reason, 'native_unknown');
  f.program.phase = 'applied'; f.observation.manualLocked = true; assert.equal(a.decide(f.packet()).reason, 'manual_lock');
});

test('an existing longer host dwell is preserved when activity-aware pacing is added', () => {
  const f = fixture(), a = new CameraChoiceArbiter({ now: f.now, minSubjectMs: 120000 }); setActivity(f, 'combat'); a.decide(f.packet());
  f.tick(90000); f.observation.subjects[0].activity.lastProgressAt = f.now(); assert.equal(a.decide(f.packet()).kind, 'keep');
  f.tick(30000); f.observation.subjects[0].activity.lastProgressAt = f.now(); assert.equal(a.decide(f.packet()).reason, 'sustaining_gain');
});
