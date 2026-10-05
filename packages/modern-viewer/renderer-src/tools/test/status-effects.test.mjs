import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

const source = readFileSync(new URL('../minecraft-viewer-presentation.js', import.meta.url), 'utf8');

function browser({ badges = true } = {}) {
  class Element {
    children = [];
    dataset = {};
    textContent = '';
    classes = new Set();
    properties = new Map();
    classList = { toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name) };
    style = { setProperty: (key, value) => this.properties.set(key, value), removeProperty: key => this.properties.delete(key) };
    append(...elements) { this.children.push(...elements); }
    replaceChildren() { this.children = []; }
  }
  const body = new Element();
  const effects = new Element();
  const vignette = new Element();
  const events = new Map();
  let now = 1000;
  let poisoned = false;
  let tick;
  runInContext(source, createContext({
    document: { body, createElement: () => new Element(), querySelectorAll: () => [],
      getElementById: id => ({ 'corti-effects': badges ? effects : null, 'corti-status-vignette': vignette }[id] || null) },
    socket: { on: (name, handler) => events.set(name, handler) },
    Date: { now: () => now }, localStorage: { getItem: () => null, setItem() {} },
    cortiSetHudPoisoned: value => { poisoned = value; }, setTimeout() {},
    setInterval: callback => { tick = callback; },
  }));
  return { body, effects, vignette, get poisoned() { return poisoned; },
    effect: packet => events.get('presentationEvent')({ kind: 'effect', self: true, active: true,
      id: 9, name: 'Nausea', title: 'Nausea', type: 'bad', durationTicks: 200, ...packet }),
    emit: name => events.get(name)(), advance: ms => { now += ms; tick(); } };
}

test('poison changes hearts; nausea independently distorts the world and has its own badge', () => {
  const h = browser();
  h.effect({ id: 19, name: 'minecraft:poison' });
  assert.equal(h.poisoned, true);
  assert.equal(h.body.classes.has('corti-has-nausea'), false);
  assert.equal(h.effects.children[0].children[1].textContent, '中毒');
  h.effect({});
  h.advance(1500);
  assert.equal(h.poisoned, true);
  assert.equal(h.body.classes.has('corti-has-nausea'), true);
  assert.equal(h.vignette.classes.has('is-nauseated'), true);
  assert.equal(h.effects.children[1].children[1].textContent, '反胃（眩晕）');
  assert.equal(h.effects.children[1].children[0].src, '/textures/mob_effect/nausea.png');
  h.effect({ active: false, name: undefined });
  assert.equal(h.poisoned, true);
  assert.equal(h.body.classes.has('corti-has-nausea'), false);
  h.effect({ id: 19, name: 'poison', active: false });
  assert.equal(h.poisoned, false);
});

test('nausea ramps up/down, refresh preserves its start, and expiration clears all visuals', () => {
  const h = browser();
  h.effect({ durationTicks: 80 });
  h.advance(750);
  assert.equal(h.body.properties.get('--mc-viewer-nausea-strength'), '0.5');
  h.effect({ durationTicks: 80 });
  assert.equal(h.body.properties.get('--mc-viewer-nausea-strength'), '0.5');
  h.advance(750);
  assert.equal(h.body.properties.get('--mc-viewer-nausea-strength'), '1');
  h.advance(2500);
  assert.equal(h.body.properties.get('--mc-viewer-nausea-strength'), '0.5');
  h.advance(750);
  assert.equal(h.effects.children.length, 0);
  assert.equal(h.body.classes.has('corti-has-nausea'), false);
  assert.equal(h.vignette.classes.has('is-nauseated'), false);
});

for (const reset of ['viewerReset', 'disconnect']) test(`${reset} clears effects before a new snapshot`, () => {
  const h = browser();
  h.effect({ durationTicks: -1 });
  h.effect({ id: 19, name: 'Poison', durationTicks: -1 });
  h.advance(2000);
  assert.equal(h.effects.children[0].children[2].textContent, '∞');
  h.emit(reset);
  assert.equal(h.poisoned, false);
  assert.equal(h.body.classes.has('corti-has-nausea'), false);
  assert.equal(h.effects.children.length, 0);
  h.advance(2000);
  assert.equal(h.effects.children.length, 0);
  h.effect({});
  h.advance(2000);
  assert.equal(h.body.classes.has('corti-has-nausea'), true);
  assert.equal(h.poisoned, false);
});

test('other entities and zero-duration effects never affect the observed player', () => {
  const h = browser();
  h.effect({ self: false });
  h.effect({ id: 19, name: 'Poison', self: false });
  h.advance(2000);
  assert.equal(h.poisoned, false);
  assert.equal(h.body.classes.has('corti-has-nausea'), false);
  h.effect({ durationTicks: 0 });
  assert.equal(h.effects.children.length, 0);
});

test('hiding badges preserves hearts and nausea rendering', () => {
  const h = browser({ badges: false });
  h.effect({});
  h.effect({ id: 19, name: 'Poison' });
  h.advance(2000);
  assert.equal(h.poisoned, true);
  assert.equal(h.vignette.classes.has('is-nauseated'), true);
});
