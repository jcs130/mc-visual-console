import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

const helper = await readFile(new URL('../minecraft-viewer-cast.js', import.meta.url), 'utf8');
const qiandengji = await readFile(new URL('../presets/qiandengji-skills.js', import.meta.url), 'utf8');
function viewer(preset = '') {
  const context = createContext({
    requestAnimationFrame() {},
    document: { getElementById() { return null; } },
    socket: {},
  });
  runInContext(preset + '\n' + helper, context);
  return context;
}
const visual = (context, spellId, tone) =>
  runInContext(`cortiSpellVisual(${JSON.stringify(spellId)}, ${JSON.stringify(tone)})`, context);

test('generic renderer interprets a host tone without assuming server skill names', () => {
  const context = viewer();
  assert.equal(visual(context, 'my-server:ice-rain', 'frost').palette, 'frost');
  assert.equal(visual(context, 'my-server:healing-cloud', 'healing').motion, 'heal');
  assert.equal(visual(context, 'home', 'fire').palette, 'flame');
  assert.equal(visual(context, 'starbolt', '').motion, 'scan');
  assert.equal(context.mcViewerSpellVisualPreset, undefined);
});

test('optional 千灯纪 preset adds presentation mappings without replacing generic fallbacks', () => {
  const context = viewer(qiandengji);
  assert.equal(visual(context, 'qiandengji:starbolt', '').motion, 'bolt');
  assert.equal(visual(context, 'home', '').motion, 'portal');
  assert.equal(visual(context, 'another-server:rain', 'frost').palette, 'frost');
});

test('a generic context remains independent after another context enables the preset', () => {
  const generic = viewer();
  viewer(qiandengji);
  assert.equal(visual(generic, 'home', '').motion, 'scan');
});
