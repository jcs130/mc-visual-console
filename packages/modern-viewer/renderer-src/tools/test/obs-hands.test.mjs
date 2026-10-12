import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { installObsHandsRenderer, HeldItemUseClock, consumeItemPose, installHeldItemUseMotion, obsHandAvatarState } from '../../src/modern-viewer/obs-hands.js';
import { Matrix4 } from 'three';
import { patchObsRendererAlpha } from '../minecraft-viewer-obs-alpha.mjs';
import { runInNewContext } from 'node:vm';

test('alpha is opt-in and a changed renderer fails closed at build time', () => {
  const patched = patchObsRendererAlpha(readFileSync(new URL('../../node_modules/minecraft-renderer/dist/minecraft-renderer.js', import.meta.url), 'utf8'));
  assert.match(patched, /alpha:!!this.config.obsOverlay/);
  assert.throws(() => patchObsRendererAlpha('newRenderer()'), /锚点/);
});
test('OBS clears every frame and draws ONLY the two original hand passes', () => {
  const calls = []; let active = true, visible = true;
  const renderer = { getContext: () => ({ getContextAttributes: () => ({ alpha: true }) }), setClearColor: (...args) => calls.push(['color', ...args]),
    getSize: v => v.set(1920, 1080), setViewport() {}, setScissorTest() {}, clear: (...args) => calls.push(['clear', ...args]), domElement: { dataset: {} } };
  const hand = name => ({ cameraGroup: {}, render() { calls.push([name, this.cameraGroup.visible]); } });
  const original = () => { throw Error('terrain must never render'); };
  const world = { renderer, render: original, camera: { updateProjectionMatrix() {} }, holdingBlock: hand('main'), holdingBlockLeft: hand('off') };
  const dispose = installObsHandsRenderer(world, { active: () => active, visible: () => visible, now: () => 5 });
  world.render(); active = false; world.render(); active = true; visible = false; world.render();
  assert.equal(calls.filter(c => c[0] === 'clear').length, 3);
  assert.deepEqual(calls.filter(c => ['main', 'off'].includes(c[0])), [['main', true], ['off', true], ['main', false], ['off', false], ['main', false], ['off', false]]);
  assert.equal(world.camera.aspect, 1920 / 1080);
  assert.equal(renderer.domElement.dataset.handsFrameAt, '5');
  visible = true; world.holdingBlock.blockSwapAnimation = { switcher: { isTransitioning: true } }; world.render();
  assert.equal(world.holdingBlock.cameraGroup.visible, false, 'an old model cannot leak during subject/item swap');
  dispose(); assert.equal(world.render, original);
  renderer.getContext = () => ({ getContextAttributes: () => ({ alpha: false }) });
  assert.throws(() => installObsHandsRenderer(world), /ALPHA_UNAVAILABLE/);
});
const state = (using = true, name = 'bread') => ({ usingHeldItem: using, quickBarSlot: 0, hotbar: [{ item: { name } }] });
test('use time advances with wall time, repeated snapshots do not restart, stale/disconnect/switch stop use', () => {
  const clock = new HeldItemUseClock(); clock.update(state(), 100); clock.update(state(), 900);
  assert.equal(clock.sample(1100).ticks, 20);
  assert.equal(clock.sample(2501), null);
  clock.update(state(), 2600); assert.equal(clock.sample(2700).ticks, 2);
  clock.update(state(false), 2800); assert.equal(clock.sample(2801), null);
  clock.update(state(true, 'potion'), 3000); assert.equal(clock.sample(3050).name, 'potion');
  clock.update({ ...state(), usingOffhand: true, offhand: { name: 'honey_bottle' } }, 3100);
  assert.equal(clock.sample(3200).hand, 'left');
  clock.reset(); assert.equal(clock.sample(3300), null);
});
test('consume motion overlays the original item only for the actual using hand and known food/drink', () => {
  const clock = new HeldItemUseClock(); clock.update(state(), 0);
  const hand = () => ({ armTransformGroup: { matrix: new Matrix4() }, updateCameraGroup() { this.armTransformGroup.matrix.identity(); } });
  const world = { holdingBlock: hand(), holdingBlockLeft: hand() }, original = world.holdingBlock.updateCameraGroup;
  const stop = installHeldItemUseMotion(world, clock, { foods: { bread: {} }, now: () => 600 });
  world.holdingBlock.updateCameraGroup(); world.holdingBlockLeft.updateCameraGroup();
  assert.notDeepEqual(world.holdingBlock.armTransformGroup.matrix.elements, new Matrix4().elements);
  assert.deepEqual(world.holdingBlockLeft.armTransformGroup.matrix.elements, new Matrix4().elements);
  clock.update(state(true, 'diamond_sword'), 620); world.holdingBlock.updateCameraGroup();
  assert.deepEqual(world.holdingBlock.armTransformGroup.matrix.elements, new Matrix4().elements);
  assert.ok(Object.values(consumeItemPose(25)).every(Number.isFinite));
  stop(); assert.equal(world.holdingBlock.updateCameraGroup, original);
});
test('Eye use state is bound to the attested target UUID/id, with its native mirrored inventory', () => {
  const self = { ...state(), entity: { id: 1, uuid: 'eye' } };
  const session = { mode: 'observer', attached: true, entityId: 2, playerUuid: 'ABC' };
  const target = { id: 2, uuid: 'abc', metadata: { 8: 3 } };
  const value = obsHandAvatarState(self, session, target);
  assert.equal(value.entity, target); assert.equal(value.hotbar, self.hotbar);
  assert.equal(value.usingHeldItem, true); assert.equal(value.usingOffhand, true);
  assert.equal(obsHandAvatarState(self, session, { ...target, uuid: 'other' }), null);
  assert.equal(obsHandAvatarState(self, session, undefined), null);
  assert.equal(obsHandAvatarState(self, { ...session, attached: false }, target), null);
  assert.equal(obsHandAvatarState(self, { mode: 'self', attached: true }), self);
  assert.equal(obsHandAvatarState({ ...self, offhand: { name: 'shield' } }, session, target).shieldRaised, true);
});

test('actual browser swing entry accepts the observed actor and refuses Eye/unrelated animations', () => {
  const source = readFileSync(new URL('../../src/modern-viewer/client.js', import.meta.url), 'utf8');
  const entry = source.slice(source.indexOf('function applyEntityAnimation('), source.indexOf('function applyEntityDamage('));
  const calls = [];
  const scope = { rendererReady: true, isObsOverlay: true, currentObsHandState: () => ({}),
    obsSession: { mode: 'observer', entityId: 7 }, cortiApplyFirstPersonSwing: event => calls.push(event.id) };
  const apply = runInNewContext(`${entry}\napplyEntityAnimation`, scope);
  apply({ id: 1, isSelf: true, animation: 'oneSwing' }); apply({ id: 8, animation: 'oneSwing' });
  apply({ id: 7, animation: 'walking' }); apply({ id: 7, animation: 'oneSwing' });
  assert.deepEqual(calls, [7]);
  scope.currentObsHandState = () => null; apply({ id: 7, animation: 'oneSwing' }); assert.deepEqual(calls, [7]);
  scope.currentObsHandState = () => ({}); scope.obsSession = { mode: 'self' };
  apply({ id: 1, isSelf: true, animation: 'oneSwing' }); assert.deepEqual(calls, [7, 1]);
});
