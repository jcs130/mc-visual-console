import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';
import { test } from 'node:test';

const script = await readFile(new URL('../minecraft-viewer-sound.js', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
const variant = (file, extra = {}) => ({ file: `${file}.ogg`, volume: 1, pitch: 1, weight: 1, ...extra });
const sampleManifest = () => ({ minecraftVersion: '1.20.6', assetIndexSha1: 'a'.repeat(40), soundsJsonSha1: 'b'.repeat(40), events: {
  'entity.fishing_bobber.retrieve': [variant('retrieve', { pitch: 2.4 })],
  'entity.item.pickup': [variant('pickup')], 'entity.experience_orb.pickup': [variant('xp')],
  'entity.zombie.hurt': [variant('zombie')], 'block.stone.step': [variant('step')],
  'block.stone.hit': [variant('hit')], 'entity.generic.eat': [variant('eat')], 'entity.generic.drink': [variant('drink')],
  'entity.player.attack.nodamage': [variant('swing')], 'entity.player.attack.crit': [variant('crit')],
  'block.stone.break': [variant('break')], 'weather.rain': [variant('rain')],
  'entity.player.swim': [variant('swim')], 'entity.player.splash': [variant('splash')],
  'block.fire.ambient': [variant('fire')], 'ui.button.click': [variant('click')],
  'entity.blaze.shoot': [variant('blaze')],
  'music.game': [variant('music', { stream: true })], 'music.end': [variant('end', { stream: true })],
  'music_disc.cat': [variant('record', { stream: true })], 'music.nether.warped_forest': [],
} });
class Events {
  constructor() { this.handlers = new Map(); this.dataset = {}; }
  addEventListener(name, fn) { const list = this.handlers.get(name) || []; list.push(fn); this.handlers.set(name, list); }
  removeEventListener(name, fn) { this.handlers.set(name, (this.handlers.get(name) || []).filter(value => value !== fn)); }
  emit(name, value) { for (const fn of this.handlers.get(name) || []) fn(value); }
  setAttribute() {}
}
function fixture(options = {}) {
  const starts = []; const contexts = []; const media = []; const panners = []; const requests = [];
  const requestOptions = [];
  let clock = 0; let counter = 0;
  const timers = new Map(); const intervals = new Map();
  const button = new Events(); const musicButton = new Events(); const output = new Events();
  const testButton = new Events(); const playMusicButton = new Events();
  const document = new Events();
  document.getElementById = id => ({ 'corti-sound-toggle': button, 'corti-music-toggle': musicButton,
    'corti-sound-test': testButton, 'corti-music-play': playMusicButton })[id] ?? null;
  document.querySelector = () => output; document.querySelectorAll = () => [];
  const socket = new Events(); socket.connected = true;
  socket.on = socket.addEventListener; socket.off = socket.removeEventListener;
  const window = new Events(); window.dispatchEvent = () => {};
  const node = () => ({ gain: { value: 1 }, connect(other) { this.destination = other; return other; }, disconnect() {} });
  class AudioContext {
    constructor() { this.state = 'suspended'; this.destination = {}; this.listener = Object.fromEntries([
      'positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ'].map(key => [key, { value: 0 }])); contexts.push(this); }
    async resume() { if (!options.denyUnlock) this.state = 'running'; }
    createGain() { return node(); }
    createPanner() { const value = Object.assign(node(), { positionX: { value: 0 }, positionY: { value: 0 }, positionZ: { value: 0 } }); panners.push(value); return value; }
    createBufferSource() { return Object.assign(node(), { playbackRate: { value: 1 }, start() { starts.push(this); }, stop() { this.stopped = true; this.onended?.(); } }); }
    createMediaElementSource(value) { return Object.assign(node(), { media: value }); }
    async decodeAudioData(bytes) { return options.decode ? options.decode(bytes) : { bytes, duration: 0.5 }; }
    addEventListener() {} removeEventListener() {}
    async close() { this.state = 'closed'; }
  }
  class Audio extends Events {
    constructor(url) { super(); this.url = url; this.paused = true; media.push(this); }
    async play() { this.paused = false; }
    pause() { this.paused = true; }
    removeAttribute() { this.removed = true; }
    load() {}
  }
  window.AudioContext = AudioContext;
  const storage = new Map();
  const vm = createContext({ window, document, socket, Audio, CustomEvent: class {},
    performance: { now: () => clock }, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    fetch: async (url, requestConfig) => { requests.push(url); requestOptions.push(requestConfig); return { ok: true, json: async () => url.endsWith('block-sounds.json')
      ? { schemaVersion: 1, minecraftVersion: '1.20.6', blocks: { 'minecraft:stone': { step: 'minecraft:block.stone.step', hit: 'minecraft:block.stone.hit', break: 'minecraft:block.stone.break', volume: 1, pitch: 1 } } }
      : options.manifest ?? sampleManifest(), arrayBuffer: async () => {
        if (options.failSoundFetch) throw Error('local test failed audio read'); return new ArrayBuffer(1);
      } }; },
    setTimeout: (fn, delay) => { const id = ++counter; timers.set(id, { fn, at: clock + delay }); return id; }, clearTimeout: id => timers.delete(id),
    setInterval: fn => { const id = ++counter; intervals.set(id, fn); return id; }, clearInterval: id => intervals.delete(id),
  });
  runInContext(script, vm);
  return { vm, api: window.cortiWorldAudio, button, musicButton, testButton, playMusicButton, document, socket, contexts, media, starts, panners, requests, requestOptions, output, storage,
    async ready() { await flush(); }, async unlock() { document.emit('pointerdown', {}); await flush(); },
    async advance(ms) { clock += ms; for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.fn(); }
      for (const fn of intervals.values()) fn(); await flush(); },
    close() { window.cortiWorldAudio.dispose(); },
  };
}
test('audio waits for a browser gesture and preserves vanilla high pitch and zero volume', async () => {
  const view = fixture(); await view.ready();
  assert.equal(view.contexts.length, 0);
  assert.equal(view.api.state().unlocked, false);
  assert.equal(await view.api.play({ name: 'entity.fishing_bobber.retrieve' }), false);
  await view.unlock();
  assert.equal(await view.api.play({ name: 'entity.fishing_bobber.retrieve', volume: 0 }), false);
  assert.equal(await view.api.play({ name: 'minecraft:entity.fishing_bobber.retrieve', volume: 1, pitch: 1 }), true);
  assert.equal(view.starts[0].playbackRate.value, 2.4);
  assert.equal(view.api.state().unlocked, true);
  view.close();
});
test('an initial sound-button pointer gesture enables audio instead of instantly toggling it off', async () => {
  const view = fixture(); await view.ready();
  view.document.emit('pointerdown', { target: view.button }); await flush();
  assert.equal(view.contexts.length, 0);
  view.button.emit('click'); await flush();
  assert.equal(view.api.state().soundEnabled, true); assert.equal(view.api.state().unlocked, true); view.close();
});
test('denied autoplay remains explicit and incompatible sound resources do not play', async () => {
  const denied = fixture({ denyUnlock: true }); await denied.ready(); await denied.unlock();
  assert.equal(denied.api.state().unlocked, false); assert.match(denied.api.state().error, /浏览器/); denied.close();
  const wrong = fixture({ manifest: { ...sampleManifest(), minecraftVersion: '1.21.1' } }); await wrong.ready(); await wrong.unlock();
  assert.equal(wrong.api.state().available, false); assert.equal(await wrong.api.play({ name: 'block.stone.step' }), false); wrong.close();
});
test('weighted variants and contextual music respect empty and unknown dimensions', () => {
  const view = fixture();
  assert.equal(runInContext("cortiSoundVariant([{file:'a',weight:1},{file:'b',weight:9}],0.2).file", view.vm), 'b');
  assert.equal(runInContext("cortiMusicEvent({dimension:'minecraft:overworld',biome:'plains'},{'music.game':[{}]})", view.vm), 'music.game');
  assert.equal(runInContext("cortiMusicEvent({dimension:'overworld',biome:'terralith:shrubland'},{'music.game':[{}]})", view.vm), 'music.game');
  assert.equal(runInContext("cortiMusicEvent({dimension:'minecraft:the_nether',biome:'warped_forest'},{'music.nether.warped_forest':[],'music.game':[{}]})", view.vm), null);
  assert.equal(runInContext("cortiMusicEvent({dimension:'custom:moon'},{'music.game':[{}]})", view.vm), null);
  view.close();
});
test('mutable sound catalogues revalidate while immutable OGG files retain normal browser caching', async () => {
  const view = fixture(); await view.ready(); await view.unlock();
  for (const url of ['/sounds/manifest.json', '/sounds/block-sounds.json']) {
    const index = view.requests.indexOf(url);
    assert.equal(view.requestOptions[index].cache, 'no-cache');
  }
  assert.equal(view.output.dataset.audioManifestEvents, String(Object.keys(sampleManifest().events).length));
  assert.equal(view.api.state().manifestEventCount, Object.keys(sampleManifest().events).length);
  assert.equal(await view.api.play({ name: 'entity.item.pickup' }), true);
  const audioIndex = view.requests.indexOf('/sounds/pickup.ogg');
  assert.ok(audioIndex >= 0); assert.equal(view.requestOptions[audioIndex], undefined);
  view.close();
});
test('entity-bound sounds follow their emitter and category mixer retains position', async () => {
  const view = fixture(); await view.ready(); await view.unlock();
  view.socket.emit('position', { pos: { x: 0, y: 64, z: 0 }, yaw: Math.PI / 2, pitch: 0 });
  view.socket.emit('entity', { id: 7, pos: { x: 3, y: 64, z: 4 } });
  view.api.setVolume('hostile', 0.25);
  assert.equal(await view.api.play({ name: 'entity.zombie.hurt', category: 'hostile', entityId: 7 }), true);
  assert.equal(view.panners[0].positionX.value, 3); assert.equal(view.panners[0].destination.gain.value, 0.2);
  view.socket.emit('entityMoved', { id: 7, pos: { x: 6, y: 65, z: 4 } });
  assert.equal(view.panners[0].positionX.value, 6);
  assert.equal(view.contexts[0].listener.forwardX.value, -1);
  assert.equal(await view.api.play({ name: 'entity.zombie.hurt', position: { x: 100, y: 64, z: 0 } }), false);
  view.close();
});
test('named/category stop cancels matching voices and also a pending decode', async () => {
  let resolveDecode;
  const view = fixture({ decode: () => new Promise(resolve => { resolveDecode = resolve; }) }); await view.ready(); await view.unlock();
  const pending = view.api.play({ name: 'entity.zombie.hurt', category: 'hostile' }); await flush();
  assert.equal(view.api.state().voices, 1);
  view.socket.emit('worldSoundStop', { name: 'entity.zombie.hurt', category: 'hostile' });
  resolveDecode({ duration: 1 }); assert.equal(await pending, false); assert.equal(view.starts.length, 0);
  view.close();
});
test('reset and disconnect prevent an old delayed sound from starting', async () => {
  for (const event of ['viewerReset', 'disconnect']) {
    let resolveDecode;
    const view = fixture({ decode: () => new Promise(resolve => { resolveDecode = resolve; }) }); await view.ready(); await view.unlock();
    const pending = view.api.play({ name: 'block.stone.step' }); await flush();
    view.socket.emit(event); resolveDecode({ duration: 1 });
    assert.equal(await pending, false); assert.equal(view.starts.length, 0); assert.equal(view.api.state().voices, 0); view.close();
  }
});
test('music streams without buffer decoding, is independent of effects, and stops on request', async () => {
  const view = fixture(); await view.ready(); await view.unlock();
  assert.equal(await view.api.play({ name: 'music.game', category: 'music' }), true);
  assert.equal(view.media.length, 1); assert.equal(view.media[0].paused, false); assert.equal(view.requests.filter(url => url.endsWith('.ogg')).length, 0);
  view.button.emit('click'); assert.equal(view.api.state().soundEnabled, false);
  assert.equal(view.media[0].paused, false);
  view.musicButton.emit('click'); assert.equal(view.api.state().musicEnabled, false); assert.equal(view.media[0].paused, true);
  assert.equal(view.api.state().voices, 0); view.close();
});
test('client music has a startup wait and a gap between tracks; explicit server music is not overwritten', async () => {
  const view = fixture(); await view.ready(); await view.unlock();
  view.socket.emit('position', { pos: { x: 0, y: 64, z: 0 } });
  view.socket.emit('biome', { dimension: 'minecraft:overworld', name: 'plains' });
  await view.advance(9000); assert.equal(view.media.length, 0);
  await view.advance(30000); assert.equal(view.media.length, 1);
  view.media[0].emit('ended'); await view.advance(1000); assert.equal(view.media.length, 1);
  view.socket.emit('worldSound', { name: 'music.end', category: 'music', volume: 1 }); await flush();
  assert.equal(view.media.length, 2);
  await view.advance(30000); assert.equal(view.media[1].paused, false); view.close();
});

test('audio settings reveal scheduled playback, track names, music mute and master mute', async () => {
  const view = fixture(); await view.ready(); await view.unlock();
  view.socket.emit('position', { pos: { x: 0, y: 64, z: 0 } });
  view.socket.emit('biome', { dimension: 'overworld', name: 'plains' });
  await view.advance(1000);
  assert.match(view.musicButton.textContent, /音乐 \d+:\d{2}/);
  assert.match(view.output.textContent, /后播放/);
  await view.advance(31000);
  assert.equal(view.musicButton.textContent, '音乐 播放中');
  assert.match(view.output.textContent, /正在播放：Music/);
  view.api.setVolume('music', 0);
  assert.equal(view.musicButton.textContent, '音乐 静音');
  assert.match(view.output.textContent, /背景音乐已静音/);
  view.api.setVolume('master', 0);
  assert.match(view.output.textContent, /总音量为零/);
  view.close();
});

test('explicit music play unlocks the browser, skips the wait and never overlaps tracks or records', async () => {
  const view = fixture(); await view.ready();
  view.socket.emit('position', { pos: { x: 0, y: 64, z: 0 } });
  view.socket.emit('biome', { dimension: 'overworld', name: 'plains' });
  view.document.emit('pointerdown', { target: view.playMusicButton }); await flush();
  assert.equal(view.contexts.length, 0);
  view.playMusicButton.emit('click'); await flush();
  assert.equal(view.api.state().unlocked, true);
  assert.equal(view.api.state().musicEnabled, true);
  assert.equal(view.media.length, 1); assert.equal(view.media[0].paused, false);
  view.playMusicButton.emit('click'); await flush(); assert.equal(view.media.length, 1);
  view.media[0].emit('ended');
  await view.api.play({ name: 'music_disc.cat', category: 'records' });
  view.playMusicButton.emit('click'); await flush(); assert.equal(view.media.length, 2);
  view.close();
});

test('sound preview unlocks and plays once without duplicating the normal UI click', async () => {
  const view = fixture(); await view.ready();
  view.document.emit('pointerdown', { target: view.testButton }); await flush();
  assert.equal(view.contexts.length, 0);
  view.testButton.emit('click');
  view.document.emit('click', { target: view.testButton, isTrusted: true });
  await flush(); await view.advance(100);
  assert.equal(view.api.state().unlocked, true); assert.equal(view.starts.length, 1);
  view.api.setVolume('effects', 0); assert.equal(view.testButton.disabled, true);
  view.close();
});
test('a connect after unlock schedules music from a stationary own avatar without a second user click', async () => {
  const view = fixture(); await view.ready(); await view.unlock();
  view.socket.emit('connect');
  view.socket.emit('avatarState', { entity: { id: 1, pos: { x: 4, y: 64, z: 8 }, yaw: 0, pitch: 0 }, inWater: false });
  view.socket.emit('biome', { dimension: 'minecraft:overworld', name: 'plains' });
  await view.advance(1000);
  assert.equal(view.api.state().originKnown, true);
  assert.equal(view.output.dataset.audioOriginKnown, 'true');
  assert.equal(view.output.dataset.audioDimension, 'minecraft:overworld');
  assert.equal(view.output.dataset.audioBiome, 'plains');
  assert.equal(view.output.dataset.audioMusicCandidate, 'music.game');
  assert.equal(view.output.dataset.audioMusicGate, 'scheduled');
  assert.ok(Number(view.output.dataset.audioMusicWaitMs) >= 10000);
  assert.equal(view.contexts[0].listener.positionX.value, 4);
  await view.advance(31000);
  assert.equal(view.media.length, 1); assert.equal(view.media[0].paused, false);
  assert.equal(view.api.state().musicGate, 'playing'); view.close();
});
test('reconnect clears old context and waits for a fresh real listener before restarting music', async () => {
  const view = fixture(); await view.ready(); await view.unlock();
  view.socket.emit('position', { pos: { x: 0, y: 64, z: 0 } });
  view.socket.emit('biome', { dimension: 'minecraft:overworld', name: 'plains' });
  await view.advance(31000); assert.equal(view.media.length, 1);
  view.socket.emit('disconnect'); view.socket.emit('connect');
  view.socket.emit('biome', { dimension: 'minecraft:overworld', name: 'plains' });
  await view.advance(120000); assert.equal(view.media.length, 1);
  assert.equal(view.output.dataset.audioMusicGate, 'listener-unknown');
  view.socket.emit('avatarState', { entity: { id: 1, pos: { x: 10, y: 64, z: 20 } } });
  await view.advance(1000); await view.advance(31000);
  assert.equal(view.media.length, 2); assert.equal(view.media[1].paused, false); view.close();
});
test('only authoritative self pickup infers vanilla sound and an explicit packet prevents duplication', async () => {
  const view = fixture(); await view.ready(); await view.unlock();
  view.socket.emit('presentationEvent', { kind: 'pickup', self: false, entityName: 'item' });
  view.socket.emit('fishingCatch', { item: { name: 'cod' } }); await view.advance(200); assert.equal(view.starts.length, 0);
  view.socket.emit('presentationEvent', { kind: 'pickup', self: true, entityName: 'item' }); await view.advance(100);
  assert.equal(view.starts.length, 1);
  view.socket.emit('presentationEvent', { kind: 'pickup', self: true, entityName: 'item' });
  view.socket.emit('worldSound', { name: 'entity.item.pickup', category: 'players', volume: 0.2 }); await flush();
  await view.advance(100); assert.equal(view.starts.length, 2); view.close();
});
test('known loaded terrain and actual movement produce steps while unknown/airborne motion stays silent', async () => {
  const view = fixture(); await view.ready(); await view.unlock();
  const avatar = (x, extra = {}) => ({ entity: { id: 1, pos: { x, y: 64, z: 0 } }, onGround: true,
    inWater: false, surfaceBlock: { name: 'stone' }, ...extra });
  view.socket.emit('avatarState', avatar(0)); view.socket.emit('avatarState', avatar(2)); await view.advance(100);
  assert.equal(view.starts.length, 1);
  view.socket.emit('avatarState', avatar(4, { surfaceBlock: { name: 'unknown_custom_block' } })); await view.advance(200);
  assert.equal(view.starts.length, 1);
  view.socket.emit('avatarState', avatar(6, { onGround: false })); await view.advance(200);
  assert.equal(view.starts.length, 1); view.close();
});
test('dig hit, edible item use and actual attacks have local feedback without inventing a successful break or meal', async () => {
  const view = fixture(); await view.ready(); await view.unlock();
  view.socket.emit('digProgress', { x: 0, y: 64, z: 0, stage: 0, blockName: 'stone' }); await view.advance(100);
  assert.equal(view.starts.length, 1); assert.equal(view.starts[0].playbackRate.value, 0.5);
  view.socket.emit('digProgress', { stage: null }); await view.advance(300); assert.equal(view.starts.length, 1);
  view.socket.emit('avatarState', { heldItemEdible: true, usingHeldItem: false, heldItem: { name: 'bread' } }); await view.advance(100);
  assert.equal(view.starts.length, 1);
  view.socket.emit('avatarState', { heldItemEdible: true, usingHeldItem: true, heldItem: { name: 'bread' } }); await view.advance(100);
  assert.equal(view.starts.length, 2);
  view.socket.emit('tacticalAttack', { id: 7 }); await view.advance(100); assert.equal(view.starts.length, 3);
  assert.equal(view.starts[2].buffer.duration, 0.5);
  view.close();
});
test('missing local audio reports a sanitized playback error instead of silent success', async () => {
  const view = fixture({ failSoundFetch: true }); await view.ready(); await view.unlock();
  assert.equal(await view.api.play({ name: 'entity.item.pickup' }), false);
  assert.match(view.api.state().error, /无法读取或解码/); assert.equal(view.api.state().voices, 0); view.close();
});
test('confirmed world blockbreak and jukebox start/stop use exact source names and positions', async () => {
  const view = fixture(); await view.ready(); await view.unlock();
  view.socket.emit('presentationEvent', { kind: 'world_event', effectId: 2001, data: 1, blockName: 'stone', position: { x: 1, y: 64, z: 1 } });
  await view.advance(100); assert.equal(view.starts.length, 1); assert.equal(view.starts[0].playbackRate.value, 0.8);
  view.socket.emit('presentationEvent', { kind: 'world_event', effectId: 1010, data: 1, itemName: 'music_disc_cat', position: { x: 1, y: 64, z: 1 } });
  await view.advance(100); assert.equal(view.media.length, 1); assert.equal(view.media[0].paused, false);
  view.socket.emit('presentationEvent', { kind: 'world_event', effectId: 1011, data: 0, position: { x: 50, y: 64, z: 1 } });
  assert.equal(view.media[0].paused, false);
  view.socket.emit('presentationEvent', { kind: 'world_event', effectId: 1011, data: 0, position: { x: 1, y: 64, z: 1 } });
  assert.equal(view.media[0].paused, true); view.close();
});
test('a jukebox stop arriving before the local delay cancels its pending record start', async () => {
  const view = fixture(); await view.ready(); await view.unlock();
  const position = { x: 1, y: 64, z: 1 };
  view.socket.emit('presentationEvent', { kind: 'world_event', effectId: 1010, data: 1, itemName: 'music_disc_cat', position });
  view.socket.emit('presentationEvent', { kind: 'world_event', effectId: 1011, data: 0, position });
  await view.advance(100); assert.equal(view.media.length, 0); view.close();
});

test('raw and level-event record delivery retains one voice in either arrival order', async () => {
  for (const rawFirst of [true, false]) {
    const view = fixture(); await view.ready(); await view.unlock();
    const position = { x: 1, y: 64, z: 1 };
    const raw = () => view.socket.emit('worldSound', { name: 'music_disc.cat', category: 'records', position });
    const level = () => view.socket.emit('presentationEvent', { kind: 'world_event', effectId: 1010, data: 1,
      itemName: 'music_disc_cat', position });
    if (rawFirst) { raw(); await flush(); level(); } else { level(); raw(); }
    await view.advance(100);
    assert.equal(view.media.filter(voice => !voice.paused).length, 1);
    view.close();
  }
});

test('vanilla blaze fire level events produce the positional hostile sound and deduplicate raw sound', async () => {
  for (const withRaw of [false, true]) {
    const view = fixture(); await view.ready(); await view.unlock();
    const position = { x: 2, y: 64, z: 1 };
    view.socket.emit('presentationEvent', { kind: 'world_event', effectId: 1018, data: 0, position });
    if (withRaw) view.socket.emit('worldSound', { name: 'entity.blaze.shoot', category: 'hostile', position, volume: 2 });
    await view.advance(100);
    assert.equal(view.starts.length, 1);
    assert.ok(view.requests.includes('/sounds/blaze.ogg'));
    assert.equal(view.panners[0].positionX.value, 2);
    assert.equal(view.panners[0].destination.gain.value, 0.8);
    view.close();
  }
});
test('rain ambience requires actual rain, known rain precipitation and visible sky', async () => {
  const view = fixture(); await view.ready(); await view.unlock();
  view.socket.emit('position', { pos: { x: 0, y: 64, z: 0 } });
  view.socket.emit('weather', { raining: true }); view.socket.emit('lightingState', { sky: 15 });
  view.socket.emit('biome', { dimension: 'minecraft:overworld', name: 'desert', precipitation: 'none' });
  await view.advance(1000); assert.equal(view.starts.length, 0);
  view.socket.emit('biome', { dimension: 'minecraft:overworld', name: 'plains', precipitation: 'rain' });
  await view.advance(1000); await view.advance(100); assert.equal(view.starts.length, 1);
  view.socket.emit('lightingState', { sky: 0 }); assert.equal(view.starts[0].stopped, true); view.close();
});
test('water snapshots are not arrival splashes; real swimming/entry is bounded and resets without replay', async () => {
  const view = fixture(); await view.ready(); await view.unlock();
  const avatar = (x, inWater) => ({ entity: { id: 1, pos: { x, y: 64, z: 0 } }, inWater, onGround: false });
  view.socket.emit('avatarState', avatar(0, true)); await view.advance(100); assert.equal(view.starts.length, 0);
  view.socket.emit('avatarState', avatar(1.2, true)); await view.advance(100); assert.equal(view.starts.length, 1);
  view.socket.emit('avatarState', avatar(1.4, false)); view.socket.emit('avatarState', avatar(1.8, true));
  await view.advance(100); assert.equal(view.starts.length, 2);
  view.socket.emit('avatarState', avatar(2, false)); view.socket.emit('avatarState', avatar(2.3, true));
  await view.advance(100); assert.equal(view.starts.length, 2);
  view.socket.emit('viewerReset'); view.socket.emit('avatarState', avatar(50, true));
  await view.advance(100); assert.equal(view.starts.length, 2); view.close();
});
test('actual burning starts fire crackle and extinguishing cancels pending and playing crackle', async () => {
  const view = fixture(); await view.ready(); await view.unlock();
  view.socket.emit('avatarState', { burning: true }); view.socket.emit('avatarState', { burning: false });
  await view.advance(100); assert.equal(view.starts.length, 0);
  await view.advance(1800); view.socket.emit('avatarState', { burning: true }); await view.advance(100);
  assert.equal(view.starts.length, 1);
  view.socket.emit('avatarState', { burning: false }); assert.equal(view.starts[0].stopped, true);
  view.socket.emit('viewerReset'); await view.advance(5000); assert.equal(view.starts.length, 1); view.close();
});
test('only enabled, trusted user controls create vanilla UI clicks; high-frequency events are bounded', async () => {
  const view = fixture(); await view.ready(); await view.unlock();
  const target = { closest: () => ({ disabled: false }) };
  view.document.emit('click', { target, isTrusted: false }); await view.advance(100); assert.equal(view.starts.length, 0);
  for (let index = 0; index < 100; index++) view.document.emit('click', { target, isTrusted: true });
  await view.advance(100); assert.equal(view.starts.length, 1);
  view.button.emit('click'); view.document.emit('click', { target, isTrusted: true }); await view.advance(100);
  assert.equal(view.starts.length, 1);
  view.close();
});
test('a local event burst has bounded timers and voices, and reset clears the burst', async () => {
  const view = fixture(); await view.ready(); await view.unlock();
  for (let index = 0; index < 1000; index++) view.socket.emit('presentationEvent', { kind: 'pickup', self: true, entityName: 'item' });
  assert.ok(view.api.state().pendingLocalSounds <= 64);
  await view.advance(100); assert.ok(view.starts.length <= 48); assert.ok(view.api.state().voices <= 48);
  view.socket.emit('viewerReset'); assert.equal(view.api.state().voices, 0); assert.equal(view.api.state().pendingLocalSounds, 0);
  view.close();
});
