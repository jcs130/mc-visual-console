/** Vanilla 1.20.6 audio mixer. No game commands or inferred successful actions. */
const cortiAudioCategories = ['music', 'records', 'weather', 'blocks', 'hostile', 'neutral', 'players', 'ambient', 'voice'];
function cortiAudioName(value) {
  const name = typeof value === 'string' ? value.replace(/^minecraft:/, '') : '';
  return /^[a-z0-9_.-]{1,160}$/.test(name) ? name : null;
}
function cortiAudioCategory(event) {
  if (cortiAudioCategories.includes(event.category) || event.category === 'master') return event.category;
  const name = event.name || '';
  if (name.startsWith('music_disc.')) return 'records';
  if (name.startsWith('music.')) return 'music';
  if (name.startsWith('weather.')) return 'weather';
  if (name.startsWith('ambient.')) return 'ambient';
  if (name.startsWith('block.')) return 'blocks';
  if (/^entity\.(player|generic|item|experience_orb|fishing_bobber)\./.test(name)) return 'players';
  return 'neutral'; // Hosts retain the packet category, especially for enemies.
}
function cortiSoundVariant(variants, random = Math.random()) {
  if (!Array.isArray(variants) || !variants.length) return null;
  const weight = variant => Number.isFinite(variant.weight) && variant.weight > 0 ? variant.weight : 1;
  const total = variants.reduce((sum, variant) => sum + weight(variant), 0);
  let target = Math.max(0, Math.min(0.999999999, random)) * total;
  for (const variant of variants) { target -= weight(variant); if (target < 0) return variant; }
  return variants[variants.length - 1];
}
/** Exact sound types exported from the matching client, never material guesses. */
function cortiBlockSound(blockName, action, blocks, events) {
  const name = String(blockName || '').replace(/^minecraft:/, '');
  if (!/^[a-z0-9_]+$/.test(name) || !['step', 'hit', 'break'].includes(action)) return null;
  const definition = blocks?.[`minecraft:${name}`];
  const sound = cortiAudioName(definition?.[action]);
  return sound && events?.[sound]?.length ? { name: sound,
    volume: Number.isFinite(definition.volume) ? definition.volume : 1,
    pitch: Number.isFinite(definition.pitch) ? definition.pitch : 1 } : null;
}
function cortiMusicEvent(state, events) {
  const biome = String(state.biome || '').replace(/^minecraft:/, '');
  const dimension = String(state.dimension || '').replace(/^minecraft:/, '');
  let key;
  if (dimension === 'the_end') key = 'music.end';
  else if (dimension === 'the_nether' || dimension === 'nether') key = `music.nether.${biome || 'nether_wastes'}`;
  else if (dimension === 'overworld') {
    if (state.underwater) key = 'music.under_water';
    else if (state.gameMode === 'creative') key = 'music.creative';
    else key = `music.overworld.${biome}`;
  } else return null; // Unknown/custom dimensions need explicit musicContext.
  if (Object.hasOwn(events || {}, key)) return events[key].length ? key : null;
  const fallback = dimension === 'the_nether' || dimension === 'nether' ? 'music.nether.nether_wastes' : 'music.game';
  return events?.[fallback]?.length ? fallback : null;
}

function cortiAudioWaitLabel(milliseconds) {
  const seconds = Math.max(0, Math.ceil((milliseconds || 0) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
function cortiAudioStatus(snapshot) {
  if (snapshot.error) return snapshot.error;
  if (!snapshot.available) return '等待本地 1.20.6 声音资源';
  if (!snapshot.connected) return '连接断开，声音已停止';
  if (!snapshot.soundEnabled && !snapshot.musicEnabled) return '游戏音效与背景音乐已关闭';
  if (!snapshot.unlocked) return '点击音效或音乐，开启网页声音';
  if (!snapshot.volumes.master) return '总音量为零，请调整声音设置';
  const effects = !snapshot.soundEnabled ? '音效已关闭' : !snapshot.volumes.effects ? '音效已静音' : '音效已开启';
  const music = {
    disabled: '背景音乐已关闭', muted: '背景音乐已静音',
    'listener-unknown': '背景音乐等待角色位置', 'context-unavailable': '当前区域没有背景音乐',
    'record-playing': '正在播放唱片，背景音乐暂候', loading: '背景音乐正在加载',
    playing: `正在播放：${snapshot.musicTrack || '背景音乐'}`,
    scheduled: `背景音乐将在 ${cortiAudioWaitLabel(snapshot.musicWaitMs)} 后播放`,
    'awaiting-schedule': '正在安排背景音乐',
  }[snapshot.musicGate] || '背景音乐等待就绪';
  return `${effects} · ${music}`;
}

function cortiInstallWorldSound(socket) {
  const button = document.getElementById('corti-sound-toggle');
  const musicButton = document.getElementById('corti-music-toggle');
  const testButton = document.getElementById('corti-sound-test');
  const playMusicButton = document.getElementById('corti-music-play');
  if (!button && !musicButton) return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const loadPreference = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
  const savePreference = (key, value) => { try { localStorage.setItem(key, value); } catch { /* session only */ } };
  let enabled = loadPreference('corti-viewer-sound', 'on') !== 'off';
  let musicEnabled = loadPreference('corti-viewer-music', 'on') !== 'off';
  const volumes = { master: 0.7, effects: 0.8, music: 0.35, records: 1, weather: 0.75,
    blocks: 1, hostile: 1, neutral: 1, players: 1, ambient: 0.85, voice: 1 };
  try {
    const stored = JSON.parse(loadPreference('mc-viewer-audio-volumes', '{}'));
    for (const key of Object.keys(volumes)) if (Number.isFinite(stored[key])) volumes[key] = Math.max(0, Math.min(1, stored[key]));
  } catch { /* invalid preferences use defaults */ }
  let context = null;
  let master = null;
  let manifest = null;
  let blockSounds = null;
  let disposed = false;
  let connected = socket.connected !== false;
  let generation = 0;
  let sequence = 0;
  let origin = null;
  let yaw = 0;
  let pitch = 0;
  let lastAudioError = null;
  let hasGesture = false;
  let lastMotionPosition = null;
  let stepDistance = 0;
  let lastStepAt = -Infinity;
  let lastUseAt = -Infinity;
  let lastWater = null;
  let swimDistance = 0;
  let lastSwimAt = -Infinity;
  let lastSplashAt = -Infinity;
  let burning = false;
  let nextFireAt = 0;
  let lastClickAt = -Infinity;
  let digKey = null;
  let lastDigAt = -Infinity;
  const musicState = { dimension: null, biome: null, underwater: false, gameMode: null };
  const weatherState = { raining: false, sky: null, precipitation: null };
  let nextRainAt = 0;
  let explicitMusic = null;
  let nextMusicAt = Infinity;
  let musicContextKey = null;
  let musicContextSince = 0;
  const voices = new Map();
  const channels = new Map();
  const entities = new Map();
  const buffers = new Map();
  const recentServerSounds = new Map();
  const bindings = [];
  const localTimers = new Map();
  const now = () => performance.now();
  const musicCandidate = () => explicitMusic ?? cortiMusicEvent(musicState, manifest?.events);
  const musicGate = () => {
    if (disposed) return 'disposed';
    if (!manifest) return 'resources-unavailable';
    if (!musicEnabled) return 'disabled';
    if (!connected) return 'disconnected';
    if (context?.state !== 'running') return 'browser-locked';
    if (!origin) return 'listener-unknown';
    if (!musicCandidate()) return 'context-unavailable';
    if (!volumes.master || !volumes.music) return 'muted';
    if ([...voices.values()].some(voice => voice.category === 'records')) return 'record-playing';
    const music = [...voices.values()].find(voice => voice.category === 'music');
    if (music) return music.started ? 'playing' : 'loading';
    return Number.isFinite(nextMusicAt) ? 'scheduled' : 'awaiting-schedule';
  };
  const state = () => ({ available: Boolean(AudioContextClass && manifest), unlocked: context?.state === 'running',
    blockSoundsAvailable: Boolean(blockSounds),
    manifestEventCount: manifest?.events ? Object.keys(manifest.events).length : 0,
    soundEnabled: enabled, musicEnabled, volumes: { ...volumes }, voices: voices.size, pendingLocalSounds: localTimers.size,
    music: [...voices.values()].find(voice => voice.category === 'music')?.name ?? null,
    musicTrack: [...voices.values()].find(voice => voice.category === 'music')?.track ?? null,
    error: lastAudioError, connected, originKnown: Boolean(origin), dimension: musicState.dimension,
    biome: musicState.biome, musicCandidate: musicCandidate(), musicGate: musicGate(),
    musicWaitMs: Number.isFinite(nextMusicAt) ? Math.max(0, Math.ceil(nextMusicAt - now())) : null });
  let lastUiState = '';
  const update = () => {
    const snapshot = state();
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastUiState) return;
    lastUiState = serialized;
    const available = AudioContextClass && manifest;
    if (button) {
      button.textContent = !AudioContextClass ? '音效 不支持' : !manifest ? '音效 资源未就绪'
        : !enabled ? '音效 关闭' : snapshot.unlocked ? '音效 开启' : '音效 点击开启';
      button.dataset.active = String(enabled && snapshot.unlocked && available);
      button.setAttribute('aria-pressed', String(enabled));
    }
    if (musicButton) {
      musicButton.textContent = !musicEnabled ? '音乐 关闭' : !manifest ? '音乐 资源未就绪'
        : !snapshot.unlocked ? '音乐 点击开启'
          : snapshot.musicGate === 'muted' ? '音乐 静音'
            : snapshot.musicGate === 'playing' ? '音乐 播放中'
              : snapshot.musicGate === 'loading' ? '音乐 加载中'
                : snapshot.musicGate === 'scheduled' ? `音乐 ${cortiAudioWaitLabel(snapshot.musicWaitMs)}` : '音乐 等待';
      musicButton.dataset.active = String(musicEnabled && snapshot.unlocked && available);
      musicButton.setAttribute('aria-pressed', String(musicEnabled));
      musicButton.title = cortiAudioStatus(snapshot);
    }
    if (testButton) testButton.disabled = !available || !connected || !enabled || !volumes.master || !volumes.effects;
    if (playMusicButton) playMusicButton.disabled = !available || !connected || !origin || !musicCandidate()
      || !volumes.master || !volumes.music || [...voices.values()].some(voice => ['music', 'records'].includes(voice.category));
    const output = document.querySelector('[data-corti-audio-status]');
    if (output) {
      output.textContent = cortiAudioStatus(snapshot);
      const diagnostics = { audioOriginKnown: String(snapshot.originKnown),
        audioDimension: snapshot.dimension ?? '', audioBiome: snapshot.biome ?? '',
        audioManifestEvents: String(snapshot.manifestEventCount),
        audioMusicCandidate: snapshot.musicCandidate ?? '', audioMusicGate: snapshot.musicGate,
        audioMusicWaitMs: snapshot.musicWaitMs === null ? '' : String(snapshot.musicWaitMs),
      };
      for (const [key, value] of Object.entries(diagnostics)) if (output.dataset[key] !== value) output.dataset[key] = value;
    }
    window.dispatchEvent(new CustomEvent('mc-viewer-audio-state', { detail: snapshot }));
  };
  const channelVolume = category => category === 'music' ? (musicEnabled ? volumes.music : 0)
    : enabled ? volumes.effects * (volumes[category] ?? 1) : 0;
  const mixer = () => {
    if (master) master.gain.value = volumes.master;
    for (const [category, gain] of channels) gain.gain.value = channelVolume(category);
    update();
  };
  const channel = category => {
    if (!channels.has(category)) {
      const gain = context.createGain();
      gain.gain.value = channelVolume(category);
      gain.connect(master);
      channels.set(category, gain);
    }
    return channels.get(category);
  };
  const updateListener = () => {
    if (!context || !origin) return;
    const listener = context.listener;
    const forward = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    if (listener.positionX) {
      for (const [key, value] of Object.entries({ positionX: origin.x, positionY: origin.y + 1.62,
        positionZ: origin.z, forwardX: forward[0], forwardY: forward[1], forwardZ: forward[2],
        upX: 0, upY: 1, upZ: 0 })) listener[key].value = value;
    } else { listener.setPosition(origin.x, origin.y + 1.62, origin.z); listener.setOrientation(...forward, 0, 1, 0); }
  };
  const setSpatialPosition = (node, position) => {
    if (node.positionX) { node.positionX.value = position.x; node.positionY.value = position.y; node.positionZ.value = position.z; }
    else node.setPosition(position.x, position.y, position.z);
  };
  const scheduleMusic = (first = false) => { nextMusicAt = now() + (first ? 10_000 + Math.random() * 20_000 : 300_000 + Math.random() * 300_000); };
  const finish = voice => {
    if (voice.finished) return;
    voice.finished = true;
    voices.delete(voice.id);
    voice.source?.disconnect(); voice.gain?.disconnect(); voice.panner?.disconnect();
    if (voice.media) { voice.media.pause(); voice.media.removeAttribute('src'); voice.media.load(); }
    if (voice.category === 'music' && !disposed) scheduleMusic();
    update();
  };
  const stopVoice = voice => {
    voice.cancelled = true;
    if (voice.media) voice.media.pause();
    try { voice.source?.stop?.(); } catch { /* pending/ended source */ }
    finish(voice);
  };
  const stop = (filter = {}) => {
    filter ??= {};
    const name = filter.name === undefined ? null : cortiAudioName(filter.name);
    if (filter.name !== undefined && !name) return;
    if (filter.category !== undefined && ![...cortiAudioCategories, 'master'].includes(filter.category)) return;
    for (const [timer, event] of localTimers) if ((!name || event.name === name)
      && (filter.category === undefined || cortiAudioCategory(event) === filter.category)
      && (!filter.position || (event.position && Math.hypot(event.position.x - filter.position.x,
        event.position.y - filter.position.y, event.position.z - filter.position.z) <= 1))) {
      clearTimeout(timer); localTimers.delete(timer);
    }
    for (const voice of [...voices.values()]) if ((!name || voice.name === name)
      && (filter.category === undefined || voice.category === filter.category)
      && (!filter.position || (voice.position && Math.hypot(voice.position.x - filter.position.x,
        voice.position.y - filter.position.y, voice.position.z - filter.position.z) <= 1))) stopVoice(voice);
  };
  const reset = () => {
    generation += 1; stop();
    for (const timer of localTimers.keys()) clearTimeout(timer);
    localTimers.clear(); entities.clear(); recentServerSounds.clear();
    origin = null; explicitMusic = null; musicContextKey = null;
    lastMotionPosition = null; stepDistance = 0; lastStepAt = -Infinity; lastUseAt = -Infinity;
    lastWater = null; swimDistance = 0; lastSwimAt = -Infinity; lastSplashAt = -Infinity;
    burning = false; nextFireAt = 0; lastClickAt = -Infinity;
    digKey = null; lastDigAt = -Infinity;
    musicState.dimension = null; musicState.biome = null; musicState.underwater = false; musicState.gameMode = null;
    weatherState.raining = false; weatherState.sky = null; weatherState.precipitation = null; nextRainAt = 0;
    nextMusicAt = Infinity;
  };
  const resume = async () => {
    if (disposed || !AudioContextClass || !hasGesture || (!enabled && !musicEnabled)) return;
    try {
      if (!context) {
        context = new AudioContextClass();
        master = context.createGain(); master.gain.value = volumes.master; master.connect(context.destination);
        context.addEventListener?.('statechange', update);
      }
      await context.resume();
      lastAudioError = context.state === 'running' ? null : '浏览器仍未允许声音，请再点击音频按钮';
      updateListener();
      if (musicEnabled && nextMusicAt === Infinity) scheduleMusic(true);
    } catch { lastAudioError = '浏览器未允许声音，请点击音频按钮'; }
    update();
  };
  const validPosition = value => value && ['x', 'y', 'z'].every(key => Number.isFinite(value[key]));
  const serverKey = event => `${event.name}|${event.entityId ?? ''}`;
  const play = async (raw, local = false) => {
    const name = cortiAudioName(raw?.name);
    if (disposed || !name || !manifest || !connected || context?.state !== 'running') return false;
    const event = { ...raw, name };
    const category = cortiAudioCategory(event);
    if (!channelVolume(category) || !volumes.master) return false;
    const variants = manifest.events?.[name];
    const random = typeof event.seed === 'string' || Number.isFinite(event.seed)
      ? [...String(event.seed)].reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0, 2166136261) / 4294967296
      : Math.random();
    const variant = cortiSoundVariant(variants, random);
    if (!variant || !/^[a-z0-9_/-]+\.ogg$/.test(variant.file || '')) return false;
    const isStream = variant.stream === true || category === 'music' || category === 'records';
    if (voices.size >= 48 || (isStream && [...voices.values()].filter(voice => voice.streaming).length >= 6)) return false;
    const position = validPosition(event.position) ? event.position : entities.get(event.entityId);
    const volume = Number.isFinite(event.volume) ? Math.max(0, Math.min(16, event.volume)) : 1;
    const maxDistance = Number.isFinite(event.fixedRange) && event.fixedRange > 0 ? event.fixedRange
      : (variant.attenuationDistance || 16) * Math.max(1, volume);
    if (!volume || (position && origin && Math.hypot(position.x - origin.x, position.y - origin.y, position.z - origin.z) >= maxDistance)) return false;
    if (!local) {
      recentServerSounds.set(serverKey(event), now());
      if (recentServerSounds.size > 256) recentServerSounds.delete(recentServerSounds.keys().next().value);
    }
    const voice = { id: ++sequence, name, category, streaming: isStream, entityId: event.entityId,
      started: false, track: variant.file.split('/').at(-1).replace(/\.ogg$/, '').replace(/_/g, ' ').replace(/\b[a-z]/g, letter => letter.toUpperCase()),
      position: position ? { ...position } : null, managedWeather: local && event.clientWeather === true,
      managedBurning: local && event.clientBurning === true,
      managedMusic: local && category === 'music', generation, createdAt: now(), cancelled: false, finished: false };
    voices.set(voice.id, voice);
    const attach = source => {
      voice.source = source;
      voice.gain = context.createGain();
      voice.gain.gain.value = Math.max(0, Math.min(1, volume * (Number.isFinite(variant.volume) ? variant.volume : 1)));
      source.connect(voice.gain);
      if (position && category !== 'music') {
        voice.panner = context.createPanner();
        voice.panner.panningModel = 'equalpower'; voice.panner.distanceModel = 'linear';
        voice.panner.refDistance = 0; voice.panner.maxDistance = maxDistance; voice.panner.rolloffFactor = 1;
        setSpatialPosition(voice.panner, position);
        voice.gain.connect(voice.panner).connect(channel(category));
      } else voice.gain.connect(channel(category));
    };
    const rate = Math.max(0.01, Math.min(8, (Number.isFinite(event.pitch) ? event.pitch : 1)
      * (Number.isFinite(variant.pitch) ? variant.pitch : 1)));
    try {
      if (isStream) {
        const media = new Audio(`/sounds/${variant.file}`);
        voice.media = media; media.preload = 'none'; media.playbackRate = rate;
        media.preservesPitch = false; media.addEventListener('ended', () => finish(voice), { once: true });
        media.addEventListener('error', () => { lastAudioError = '部分声音资源无法播放'; finish(voice); }, { once: true });
        attach(context.createMediaElementSource(media));
        await media.play();
      } else {
        let pending = buffers.get(variant.file);
        if (!pending) {
          pending = fetch(`/sounds/${variant.file}`).then(response => {
            if (!response.ok) throw Error('Missing sound resource'); return response.arrayBuffer();
          }).then(bytes => context.decodeAudioData(bytes));
          buffers.set(variant.file, pending);
          if (buffers.size > 128) buffers.delete(buffers.keys().next().value);
          void pending.catch(() => { if (buffers.get(variant.file) === pending) buffers.delete(variant.file); });
        }
        const buffer = await pending;
        if (voice.cancelled || voice.generation !== generation || disposed || !connected
          || context.state !== 'running' || !channelVolume(category) || now() - voice.createdAt > 1500) { finish(voice); return false; }
        const source = context.createBufferSource(); source.buffer = buffer; source.playbackRate.value = rate;
        attach(source); source.onended = () => finish(voice); source.start();
      }
      if (voice.cancelled || voice.generation !== generation || disposed || !connected) { stopVoice(voice); return false; }
      voice.started = true; update(); return true;
    } catch {
      if (!voice.cancelled && voice.generation === generation && !disposed && connected)
        lastAudioError = '部分声音资源无法读取或解码，请检查本地音频资源';
      finish(voice); return false;
    }
  };
  // Collect packets trigger this client-side vanilla sound. An explicit server
  // sound for the same collection wins instead of producing a duplicate.
  const playLocal = event => {
    if (disposed || !connected || localTimers.size >= 64) return;
    const token = generation;
    const seenAt = now();
    const timer = setTimeout(() => {
      localTimers.delete(timer);
      if (token !== generation || disposed) return;
      if (event.clientBurning && !burning) return;
      if (event.clientWeather && (!weatherState.raining || !Number.isFinite(weatherState.sky)
        || weatherState.sky < 14 || weatherState.precipitation !== 'rain')) return;
      if ([...recentServerSounds.entries()].some(([key, at]) => key.startsWith(`${event.name}|`) && at >= seenAt - 100 && now() - at < 400)) return;
      void play(event, true);
    }, 100);
    localTimers.set(timer, event);
  };
  const localPickup = event => {
    if (event?.kind === 'world_event') {
      const effectId = Number.isInteger(event.effectId) ? event.effectId : event.id;
      if (effectId === 2001 && validPosition(event.position)) {
        const sound = cortiBlockSound(event.blockName, 'break', blockSounds, manifest?.events);
        if (sound) playLocal({ name: sound.name, category: 'blocks', position: event.position,
          volume: (sound.volume + 1) / 2, pitch: sound.pitch * 0.8 });
      } else if (effectId === 1010 && validPosition(event.position)) {
        const item = String(event.itemName || '').replace(/^minecraft:/, '');
        if (/^music_disc_[a-z0-9_]+$/.test(item)) {
          const name = `music_disc.${item.slice('music_disc_'.length)}`;
          if (manifest?.events?.[name]?.length) {
            // Plugins can supply the raw record sound as well as the vanilla
            // level event. Keep that fresh same-position voice in either order.
            const forwarded = [...voices.values()].some(voice => voice.category === 'records' && voice.name === name
              && now() - voice.createdAt < 400 && voice.position
              && Math.hypot(voice.position.x - event.position.x, voice.position.y - event.position.y,
                voice.position.z - event.position.z) < 1);
            if (forwarded) { stop({ category: 'music' }); return; }
            stop({ category: 'music' }); stop({ category: 'records', position: event.position });
            playLocal({ name, category: 'records', position: event.position, volume: 4, pitch: 1, fixedRange: 64 });
          }
        }
      } else if (effectId === 1011 && validPosition(event.position)) stop({ category: 'records', position: event.position });
      // Exact 1.20.6 LevelRenderer mapping. Blaze firing is a level event,
      // rather than a sound_effect packet, and must not remain silent.
      else if (effectId === 1018 && validPosition(event.position)) playLocal({ name: 'entity.blaze.shoot',
        category: 'hostile', position: event.position, volume: 2, pitch: 1 + (Math.random() - Math.random()) * 0.2 });
      return;
    }
    if (event?.kind !== 'pickup' || event.self !== true || !['item', 'experience_orb'].includes(event.entityName)) return;
    playLocal({ name: event.entityName === 'experience_orb' ? 'entity.experience_orb.pickup' : 'entity.item.pickup',
      category: 'players', position: null, volume: 0.2,
      pitch: event.entityName === 'experience_orb' ? 0.9 + Math.random() * 0.3 : 1.5 + Math.random() * 0.4 });
  };
  const avatarSounds = packet => {
    const pos = validPosition(packet?.entity?.pos) ? packet.entity.pos : origin;
    const moved = validPosition(pos) && lastMotionPosition ? Math.hypot(pos.x - lastMotionPosition.x,
      pos.y - lastMotionPosition.y, pos.z - lastMotionPosition.z) : 0;
    if (packet?.inWater === true) {
      // A first snapshot can already be underwater; it is not an entry event.
      if (lastWater === false && moved > 0.05 && moved < 4 && now() - lastSplashAt >= 1200) {
        playLocal({ name: 'entity.player.splash', category: 'players', position: null,
          volume: Math.min(0.6, Math.max(0.15, moved * 0.4)), pitch: 1 });
        lastSplashAt = now();
      }
      if (lastWater === true && moved < 4) swimDistance += moved; else swimDistance = 0;
      if (swimDistance >= 1 && now() - lastSwimAt >= 350) {
        playLocal({ name: 'entity.player.swim', category: 'players', position: null, volume: 0.2, pitch: 1 });
        swimDistance = 0; lastSwimAt = now();
      }
    } else swimDistance = 0;
    if (typeof packet?.inWater === 'boolean') lastWater = packet.inWater;
    if (typeof packet?.burning === 'boolean') burning = packet.burning;
    tickBurning();
    if (validPosition(pos) && lastMotionPosition && packet.onGround === true && packet.inWater !== true && packet.inLava !== true) {
      const travelled = Math.hypot(pos.x - lastMotionPosition.x, pos.z - lastMotionPosition.z);
      if (travelled < 4) stepDistance += travelled; else stepDistance = 0;
      if (stepDistance >= 1.6 && now() - lastStepAt >= 180) {
        const sound = cortiBlockSound(packet.surfaceBlock?.name, 'step', blockSounds, manifest?.events);
        if (sound) playLocal({ name: sound.name, category: 'players', position: null, volume: sound.volume * 0.15, pitch: sound.pitch });
        stepDistance = 0; lastStepAt = now();
      }
    } else stepDistance = 0;
    if (validPosition(pos)) lastMotionPosition = { ...pos };
    const held = packet?.heldItem ?? packet?.equipment?.[0] ?? packet?.entity?.equipment?.[0];
    if (packet?.usingHeldItem === true && now() - lastUseAt >= 350) {
      const drinking = ['potion', 'milk_bucket', 'honey_bottle'].includes(held?.name);
      if (packet.heldItemEdible === true || drinking) {
        playLocal({ name: drinking ? 'entity.generic.drink' : 'entity.generic.eat', category: 'players',
          position: null, volume: 0.5, pitch: 0.95 + Math.random() * 0.1 });
        lastUseAt = now();
      }
    }
  };
  const on = (name, handler) => { socket.on(name, handler); bindings.push([name, handler]); };
  const position = packet => {
    if (!validPosition(packet?.pos)) return;
    origin = { ...packet.pos }; yaw = Number.isFinite(packet.yaw) ? packet.yaw : yaw;
    pitch = Number.isFinite(packet.pitch) ? packet.pitch : pitch; updateListener();
  };
  const entity = packet => {
    if (!Number.isSafeInteger(packet?.id)) return;
    if (packet.delete) { entities.delete(packet.id); for (const voice of [...voices.values()]) if (voice.entityId === packet.id) stopVoice(voice); }
    else if (validPosition(packet.pos)) {
      entities.set(packet.id, { ...packet.pos });
      for (const voice of voices.values()) if (voice.entityId === packet.id && voice.panner) setSpatialPosition(voice.panner, packet.pos);
    }
  };
  const tickMusic = () => {
    if (disposed || !manifest || !musicEnabled || !connected || !origin || context?.state !== 'running'
      || !volumes.master || !volumes.music) return;
    const key = musicCandidate();
    if (key !== musicContextKey) { musicContextKey = key; musicContextSince = now(); }
    const music = [...voices.values()].find(voice => voice.category === 'music');
    // Socket connect/reset may happen after the browser has already unlocked.
    // Start from the first actual world snapshot, without requiring a new click.
    if (key && !music && nextMusicAt === Infinity) scheduleMusic(true);
    // Water/biome boundaries settle before interrupting a playing track.
    if (music?.managedMusic && key !== music.name && now() - musicContextSince > 15_000) {
      stop({ category: 'music' }); scheduleMusic(true); return;
    }
    if (!key || music || [...voices.values()].some(voice => voice.category === 'records') || now() < nextMusicAt) return;
    nextMusicAt = Infinity;
    void play({ name: key, category: 'music', position: null, volume: 1, pitch: 1 }, true).then(ok => { if (!ok) scheduleMusic(); });
  };
  const tickWeather = () => {
    const rain = weatherState.raining && Number.isFinite(weatherState.sky) && weatherState.sky >= 14
      && weatherState.precipitation === 'rain';
    if (!rain) {
      for (const voice of [...voices.values()]) if (voice.managedWeather) stopVoice(voice);
      return;
    }
    if (disposed || !manifest || !enabled || !connected || !origin || context?.state !== 'running'
      || now() < nextRainAt || [...voices.values()].some(voice => voice.managedWeather)) return;
    nextRainAt = now() + 1500;
    playLocal({ name: 'weather.rain', category: 'weather', position: null, volume: 0.2, pitch: 1, clientWeather: true });
  };
  const tickBurning = () => {
    if (!burning) {
      for (const voice of [...voices.values()]) if (voice.managedBurning) stopVoice(voice);
      return;
    }
    if (disposed || !manifest || !enabled || !connected || context?.state !== 'running'
      || now() < nextFireAt || [...voices.values()].some(voice => voice.managedBurning)) return;
    nextFireAt = now() + 1800;
    playLocal({ name: 'block.fire.ambient', category: 'blocks', position: null, volume: 0.15, pitch: 1, clientBurning: true });
  };
  on('worldSound', event => {
    const category = cortiAudioCategory(event || {});
    if ((category === 'records' || category === 'music') && channelVolume(category)) stop({ category: 'music' });
    void play(event);
  });
  on('worldSoundStop', stop); on('stopSound', stop);
  on('position', position); on('entity', entity); on('entityMoved', entity); on('playerEntity', entity);
  on('avatarState', packet => {
    if (packet?.entity) {
      entity(packet.entity);
      // Stationary Mineflayer bots still publish HUD snapshots. Their exact own
      // entity position is also a listener snapshot, not a guessed origin.
      if (validPosition(packet.entity.pos)) position({ pos: packet.entity.pos, yaw: packet.entity.yaw, pitch: packet.entity.pitch });
    }
    avatarSounds(packet);
    musicState.underwater = packet?.underwater === true || packet?.headInWater === true;
    if (typeof packet?.gameMode === 'string') musicState.gameMode = packet.gameMode;
  });
  on('biome', packet => {
    if (typeof packet?.dimension === 'string') musicState.dimension = packet.dimension;
    if (typeof packet?.name === 'string') musicState.biome = packet.name;
    weatherState.precipitation = packet?.precipitation === 'rain' ? 'rain' : packet?.precipitation === 'snow' ? 'snow' : null;
  });
  on('weather', packet => { weatherState.raining = packet?.raining === true; tickWeather(); });
  on('lightingState', packet => { weatherState.sky = Number.isFinite(packet?.sky) ? packet.sky : null; tickWeather(); });
  on('musicContext', packet => { explicitMusic = cortiAudioName(packet?.name); });
  on('digProgress', packet => {
    if (!Number.isInteger(packet?.stage) || packet.stage < 0 || packet.stage > 9) { digKey = null; return; }
    const key = `${packet.x},${packet.y},${packet.z}`;
    if (key !== digKey || now() - lastDigAt >= 250) {
      const sound = cortiBlockSound(packet.blockName, 'hit', blockSounds, manifest?.events);
      if (sound) playLocal({ name: sound.name, category: 'blocks', position: { x: packet.x + 0.5, y: packet.y + 0.5, z: packet.z + 0.5 }, volume: (sound.volume + 1) / 8, pitch: sound.pitch * 0.5 });
      digKey = key; lastDigAt = now();
    }
  });
  // An actual attack instruction has a swing sound, but never implies a hit.
  on('tacticalAttack', () => playLocal({ name: 'entity.player.attack.nodamage', category: 'players', position: null, volume: 1, pitch: 1 }));
  on('combatFeedback', packet => {
    if (packet?.critical === true) playLocal({ name: 'entity.player.attack.crit', category: 'players', position: null, volume: 1, pitch: 1 });
  });
  on('presentationEvent', localPickup); on('viewerReset', reset);
  on('disconnect', () => { connected = false; reset(); update(); });
  on('connect', () => { connected = true; reset(); update(); });
  const gesture = () => { hasGesture = true; void resume(); };
  // Let the dedicated button's click own its unlock/toggle decision. Unlocking
  // on pointerdown first would turn an initial "enable" click into "disable".
  const pageGesture = event => {
    if (event?.target === button || event?.target === musicButton || button?.contains?.(event?.target)
      || musicButton?.contains?.(event?.target) || event?.target === testButton || event?.target === playMusicButton
      || testButton?.contains?.(event?.target) || playMusicButton?.contains?.(event?.target)) return;
    gesture();
  };
  document.addEventListener('pointerdown', pageGesture, { passive: true });
  document.addEventListener('keydown', pageGesture);
  const uiClick = event => {
    if (event?.isTrusted === false || !enabled || now() - lastClickAt < 90) return;
    if (event?.target === testButton || event?.target === playMusicButton
      || testButton?.contains?.(event?.target) || playMusicButton?.contains?.(event?.target)) return;
    const control = event?.target?.closest?.('button,[role="button"],summary');
    if (!control || control.disabled) return;
    lastClickAt = now();
    playLocal({ name: 'ui.button.click', category: 'master', position: null, volume: 0.25, pitch: 1 });
  };
  document.addEventListener('click', uiClick);
  const toggleEffects = () => {
    hasGesture = true; enabled = !enabled || context?.state !== 'running';
    savePreference('corti-viewer-sound', enabled ? 'on' : 'off');
    if (!enabled) for (const voice of [...voices.values()]) if (voice.category !== 'music') stopVoice(voice);
    mixer(); if (enabled) void resume();
  };
  const toggleMusic = () => {
    hasGesture = true; musicEnabled = !musicEnabled || context?.state !== 'running';
    savePreference('corti-viewer-music', musicEnabled ? 'on' : 'off');
    if (!musicEnabled) stop({ category: 'music' }); else scheduleMusic(true);
    mixer(); if (musicEnabled) void resume();
  };
  button?.addEventListener('click', toggleEffects); musicButton?.addEventListener('click', toggleMusic);
  const testSound = async () => {
    hasGesture = true;
    await resume();
    return play({ name: 'ui.button.click', category: 'players', position: null, volume: 0.5, pitch: 1 }, true);
  };
  const playMusicNow = async () => {
    hasGesture = true; musicEnabled = true;
    savePreference('corti-viewer-music', 'on'); mixer(); await resume();
    const key = musicCandidate();
    if (!key || !origin || !volumes.master || !volumes.music
      || [...voices.values()].some(voice => ['music', 'records'].includes(voice.category))) return false;
    nextMusicAt = Infinity;
    const played = await play({ name: key, category: 'music', position: null, volume: 1, pitch: 1 }, true);
    if (!played && !disposed && connected) scheduleMusic(true);
    update(); return played;
  };
  const onTestSound = () => { void testSound(); };
  const onPlayMusic = () => { void playMusicNow(); };
  testButton?.addEventListener('click', onTestSound); playMusicButton?.addEventListener('click', onPlayMusic);
  const inputs = [...document.querySelectorAll('[data-corti-audio-volume]')];
  const setVolume = (key, value) => {
    if (!Object.hasOwn(volumes, key) || !Number.isFinite(value)) return false;
    volumes[key] = Math.max(0, Math.min(1, value));
    savePreference('mc-viewer-audio-volumes', JSON.stringify(volumes)); mixer(); return true;
  };
  const inputHandlers = inputs.map(input => {
    const key = input.dataset.cortiAudioVolume;
    if (Object.hasOwn(volumes, key)) input.value = String(volumes[key]);
    const handler = () => { setVolume(key, Number(input.value)); gesture(); };
    input.addEventListener('input', handler); return [input, handler];
  });
  const timer = setInterval(() => { tickMusic(); tickWeather(); tickBurning(); update(); }, 1000);
  const controller = { state, setVolume, play, stop, reset, unlock: gesture,
    dispose() {
      if (disposed) return; disposed = true; reset(); clearInterval(timer);
      for (const [name, handler] of bindings) socket.off?.(name, handler);
      document.removeEventListener('pointerdown', pageGesture); document.removeEventListener('keydown', pageGesture);
      document.removeEventListener('click', uiClick);
      button?.removeEventListener('click', toggleEffects); musicButton?.removeEventListener('click', toggleMusic);
      testButton?.removeEventListener('click', onTestSound); playMusicButton?.removeEventListener('click', onPlayMusic);
      for (const [input, handler] of inputHandlers) input.removeEventListener('input', handler);
      context?.removeEventListener?.('statechange', update); void context?.close(); buffers.clear();
    } };
  window.addEventListener('pagehide', () => controller.dispose(), { once: true });
  window.cortiWorldAudio = controller;
  // Metadata keeps the same URL across rebuilds. Revalidate it instead of
  // retaining a previous partial sound catalogue for the HTTP cache lifetime.
  void fetch('/sounds/manifest.json', { cache: 'no-cache' }).then(response => response.ok ? response.json() : null).then(value => {
    if (disposed) return;
    if (value?.minecraftVersion === '1.20.6' && value.events && /^[a-f0-9]{40}$/.test(value.assetIndexSha1 || '')
      && /^[a-f0-9]{40}$/.test(value.soundsJsonSha1 || '')) manifest = value;
    else lastAudioError = '缺少匹配的本地 1.20.6 声音资源';
    update();
  }).catch(() => { if (!disposed) { lastAudioError = '无法读取本地声音资源'; update(); } });
  void fetch('/sounds/block-sounds.json', { cache: 'no-cache' }).then(response => response.ok ? response.json() : null).then(value => {
    if (disposed) return;
    if (value?.minecraftVersion === '1.20.6' && value.schemaVersion === 1 && value.blocks
      && typeof value.blocks === 'object' && !Array.isArray(value.blocks)) blockSounds = value.blocks;
    update();
  }).catch(() => { /* Packet-driven audio still works without optional block mapping. */ });
  update();
  return controller;
}

cortiInstallWorldSound(socket);
