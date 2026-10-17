import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../minecraft-viewer-biome-style.js', import.meta.url), 'utf8');

function fixture() {
  class Color {
    constructor(value) { this.value = value; }
    clone() { return new Color(this.value); }
    copy(other) { this.value = other.value; return this; }
    set(value) { this.value = value; return this; }
    lerp() { return this; }
  }
  let interval, beforeUnload, now = 0;
  const reactive = { ambientLight: 0.16 };
  let originalCalls = 0;
  // Native renderer reacts to server time by writing the base intensity.
  const nativeDraw = function () { originalCalls++; world.ambientLight.intensity = reactive.ambientLight * Math.PI; };
  const world = {
    renderer: {}, scene: { onBeforeRender: nativeDraw },
    skyboxRenderer: { updateSkyColors() {}, updateWaterState() {} },
    directionalLight: { color: new Color('sun') },
    ambientLight: { color: new Color('fill'), intensity: 0.16 * Math.PI },
    chunkMeshManager: { setBlockLightmapParams() {} },
  };
  const context = vm.createContext({
    world, viewer: { playerState: { reactive } },
    document: { hidden: false, getElementById: () => null },
    localStorage: { getItem: () => 'on', setItem() {} },
    window: { addEventListener: (name, fn) => { if (name === 'beforeunload') beforeUnload = fn; } },
    performance: { now: () => now },
    setInterval: (fn) => { interval = fn; return 1; }, clearInterval: () => { interval = null; },
    activeScenePolicy: { style: 'native' }, pendingTime: null, pendingWeather: {},
    avatarPresentationLights: null, minecraftLightLevels: () => ({ daylight: 1 }),
  });
  vm.runInContext(source + '\ncortiInitializeBiomeStyle();', context);
  const tick = () => { now += 250; interval?.(); };
  for (let i = 0; i < 32; i++) tick();
  return { context, world, reactive, tick, nativeDraw,
    unload: () => beforeUnload(), calls: () => originalCalls,
    draw: () => world.scene.onBeforeRender(null, null, {}) };
}

test('night vision survives native base-light updates on the very next draw, between timer ticks', () => {
  const f = fixture();
  for (const base of [0.16, 0.4, 0, 0.8, 1, 0.16]) {
    f.reactive.ambientLight = base;
    f.draw();
    const expected = (base + 0.38 * f.context.__cortiBiomeStyle.nightVisionStrength) * Math.PI;
    assert.ok(Math.abs(f.world.ambientLight.intensity - expected) < 1e-9,
      `base ${base}: a native state update must not flash the avatar back to unboosted lighting`);
  }
  assert.equal(f.calls(), 6, 'preserve the preexisting render callback');
});

test('night vision off keeps native intensity, including zero, and unload restores callback ownership', () => {
  const f = fixture();
  vm.runInContext('cortiSetNightVisionMode("off")', f.context);
  for (let i = 0; i < 48; i++) f.tick();
  f.reactive.ambientLight = 0;
  f.draw();
  assert.ok(f.world.ambientLight.intensity < 1e-9);
  f.unload();
  assert.equal(f.world.scene.onBeforeRender, f.nativeDraw);
});

test('cleanup does not remove a later render wrapper and missing base light is not manufactured', () => {
  const f = fixture();
  const ours = f.world.scene.onBeforeRender;
  const next = function (...args) { return ours.apply(this, args); };
  f.world.scene.onBeforeRender = next;
  f.unload();
  assert.equal(f.world.scene.onBeforeRender, next);
  f.reactive.ambientLight = undefined;
  f.world.ambientLight.intensity = 7;
  vm.runInContext('cortiApplyNightVisionLight(world)', f.context);
  assert.equal(f.world.ambientLight.intensity, 7);
});
