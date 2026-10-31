import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';
const helper = await readFile(new URL('../minecraft-viewer-cast.js', import.meta.url), 'utf8');
const preset = await readFile(new URL('../presets/qiandengji-skills.js', import.meta.url), 'utf8');
function rig(optional = '') {
  const nodes = new Map(['[data-cast-phase]', '[data-cast-name]', '[data-cast-detail]', '.corti-cast-line'].map(key => [key, { textContent: '', style: {}, offsetWidth: 0 }]));
  const root = { hidden: true, dataset: {}, querySelector: key => nodes.get(key) };
  const handlers = new Map();
  const context = createContext({ requestAnimationFrame() {}, setTimeout() { return 1; }, clearTimeout() {}, pendingAvatarState: null, latestPosition: null,
    document: { getElementById() { return root; } }, socket: { on(name, handler) { handlers.set(name, handler); } } });
  runInContext(optional + '\n' + helper, context);
  return { root, nodes, context, emit: event => handlers.get('castCue')(event) };
}
test('accepted or failed attempts never show a cast banner or start cosmetic effects', () => {
  const r = rig(preset);
  for (const phase of ['sent', 'failed']) {
    r.emit({ seq: 1, phase, spellId: 'conjure_cobblestone', spellName: 'Conjure Cobblestone', detail: 'server rejected' });
    assert.equal(r.root.hidden, true);
    assert.equal(r.nodes.get('[data-cast-name]').textContent, '');
    assert.equal(r.context.MinecraftViewerSkillVfx.activeCount, 0);
  }
});
test('a confirmed cast uses Chinese display names without rewriting executable IDs or server receipts', () => {
  const r = rig(preset), cue = { seq: 2, phase: 'succeeded', spellId: 'magicspells:conjure_bread', spellName: 'Conjure Bread' };
  const original = structuredClone(cue); r.emit(cue);
  assert.equal(r.root.hidden, false);
  assert.equal(r.nodes.get('[data-cast-name]').textContent, '造物术·面包');
  assert.equal(r.nodes.get('[data-cast-phase]').textContent, '✦ 使用技能 · 生效');
  assert.deepEqual(cue, original);
  assert.equal(r.context.mcViewerSkillLabel('unknown:spell', 'Unknown Spell'), '技能');
  assert.equal(r.context.mcViewerSkillLabel('server:heal', '服务器治疗术'), '服务器治疗术');
});
test('a failure hides only its own cue and late old successes do not replace a newer confirmed cast', () => {
  const r = rig();
  r.emit({ seq: 3, phase: 'succeeded', spellId: 'heal', spellName: '治疗术' });
  r.emit({ seq: 4, phase: 'failed', spellId: 'new', spellName: 'New' });
  assert.equal(r.root.hidden, false);
  r.emit({ seq: 2, phase: 'succeeded', spellId: 'old', spellName: '旧技能' });
  assert.equal(r.nodes.get('[data-cast-name]').textContent, '治疗术');
  r.emit({ seq: 3, phase: 'failed', spellId: 'heal', spellName: '治疗术' });
  assert.equal(r.root.hidden, true);
});
