import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Document, Element } from './fixtures/native-console-dom.mjs';
import { ensureManualControlUi } from '../../src/modern-viewer/manual-control-ui.js';

const source = readFileSync(new URL('../../src/modern-viewer/client.js', import.meta.url), 'utf8');
const extract = (start, end) => source.slice(source.indexOf(`function ${start}(`), source.indexOf(`function ${end}(`));
const finiteOr = (v, fallback) => Number.isFinite(v) ? v : fallback;
const normalizeRadians = v => Math.atan2(Math.sin(v), Math.cos(v));
const clampNumber = (v, lo, hi, fallback) => Math.max(lo, Math.min(hi, finiteOr(v, fallback)));

test('actual gamepad mapper sends action edges once and releases held actions on unplug', () => {
  const document = new Document(), messages = [], pad = { connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) };
  const context = { document, navigator: { getGamepads: () => [pad] }, finiteOr, clampNumber, normalizeRadians,
    manualGamepadActions: new Map(), gamepadConnected: true, gamepadStopPressed: false, gamepadReleasePressed: false,
    postToDashboard: message => messages.push(message), publishGamepadStatus() {}, pendingAvatarState: { quickBarSlot: 8 } };
  const sample = runInNewContext(`${extract('sampleGamepad', 'publishGamepadStatus')}\nsampleGamepad`, context);
  pad.buttons[7].pressed = true; pad.buttons[5].pressed = true; pad.buttons[10].pressed = true;
  assert.equal(sample(.016).sprint, true); sample(.016);
  assert.equal(messages.filter(m => m.type === 'lantern-control-primary').length, 1);
  assert.equal(messages.find(m => m.type === 'lantern-control-hotbar').slot, 0);
  pad.connected = false; sample(.016); assert.equal(messages.at(-1).pressed, false);
});

test('actual input handlers support mouse and touch actions while typing never moves the actor', () => {
  const document = new Document(), window = new Element('window', document), messages = [];
  const canvas = document.createElement('canvas'); canvas.id = 'viewer-canvas'; document.body.append(canvas);
  ensureManualControlUi(document);
  for (const element of [canvas, ...document.querySelectorAll('button')]) { element.setPointerCapture = () => {}; element.focus = () => {}; }
  const context = { document, window, parent: {}, dashboardOrigin: 'https://fixture.invalid', isPhotoView: false, isObsOverlay: false,
    isFirstPersonView: true, isDungeonView: false, isFreeOrbitView: false, viewMode: 'first', ensureManualControlUi,
    manualControlActive: true, manualControlPhase: 'manual', firstPersonPointerLocked: true, touchLookPointer: null,
    touchLookPosition: null, manualLookYaw: 0, manualLookPitch: 0, manualKeys: new Set(), manualStopLatched: false,
    finiteOr, normalizeRadians, clampNumber, postToDashboard: m => messages.push(m), startManualInputLoop() {}, applyManualFirstPersonLook() {} };
  runInNewContext(`${extract('installManualControls', 'applyManualFirstPersonLook')}\ninstallManualControls()`, context);
  const event = extra => ({ preventDefault() {}, stopPropagation() {}, pointerId: 1, ...extra });
  window.dispatch('keydown', event({ code: 'KeyW', target: { tagName: 'INPUT' } }));
  window.dispatch('keydown', event({ code: 'Digit2', target: { tagName: 'TEXTAREA' } }));
  assert.equal(context.manualKeys.size, 0); assert.equal(messages.length, 1, 'only the initial ready message');
  window.dispatch('keydown', event({ code: 'KeyW', target: canvas })); assert.equal(context.manualKeys.has('KeyW'), true);
  window.dispatch('keyup', event({ code: 'KeyW' })); assert.equal(context.manualKeys.size, 0);
  window.dispatch('keydown', event({ code: 'Digit2', target: canvas })); assert.equal(messages.at(-1).slot, 1);
  canvas.dispatch('pointerdown', event({ pointerType: 'mouse', button: 0 })); assert.equal(messages.at(-1).pressed, true);
  window.dispatch('pointerup', event({ pointerType: 'mouse', button: 0 })); assert.equal(messages.at(-1).pressed, false);
  const use = document.getElementById('touch-secondary'); use.dispatch('pointerdown', event({ pointerType: 'touch' }));
  assert.equal(messages.at(-1).type, 'lantern-control-secondary'); assert.equal(messages.at(-1).pressed, true);
  use.dispatch('pointercancel', event({ pointerType: 'touch' })); assert.equal(messages.at(-1).pressed, false);
  canvas.dispatch('pointerdown', event({ pointerType: 'touch', clientX: 100, clientY: 100 }));
  canvas.dispatch('pointermove', event({ pointerType: 'touch', clientX: 120, clientY: 110 }));
  assert.ok(Math.abs(context.manualLookYaw) > .1); assert.ok(context.manualLookPitch > .05);
});
