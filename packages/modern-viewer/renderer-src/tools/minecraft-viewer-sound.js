/** Local 1.20.6 game sounds; the observer must enable browser audio once. */
function cortiInstallWorldSound(socket) {
  const button = document.getElementById('corti-sound-toggle');
  if (!button) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  let enabled = true;
  try { enabled = localStorage.getItem('corti-viewer-sound') !== 'off'; } catch { /* storage may be disabled */ }
  let context = null;
  let activeVoices = 0;
  const buffers = new Map();
  const recent = new Map();
  const manifestPromise = fetch('/sounds/manifest.json')
    .then(response => response.ok ? response.json() : null)
    .then(data => data?.minecraftVersion === '1.20.6' ? data : null)
    .catch(() => null);
  const updateButton = (available = true) => {
    button.textContent = !AudioContextClass || !available ? '音效 不可用'
      : !enabled ? '音效 关闭'
        : context?.state === 'running' ? '音效 开启' : '音效 点击开启';
    button.dataset.active = String(enabled && context?.state === 'running');
  };
  const resume = async () => {
    if (!enabled || !AudioContextClass) return;
    context ??= new AudioContextClass();
    try { await context.resume(); } catch { /* browser may require another click */ }
    updateButton();
  };
  button.addEventListener('click', () => {
    enabled = !enabled || context?.state !== 'running';
    try { localStorage.setItem('corti-viewer-sound', enabled ? 'on' : 'off'); } catch { /* session only */ }
    if (enabled) void resume();
    else updateButton();
  });
  document.addEventListener('pointerdown', event => {
    if (enabled && event.target !== button && !button.contains(event.target)) void resume();
  }, { passive: true });
  void manifestPromise.then(manifest => updateButton(Boolean(manifest)));
  void resume();

  const playSound = async event => {
    if (!enabled || !context || context.state !== 'running' || activeVoices >= 12 ||
        !event || typeof event.name !== 'string') return;
    const manifest = await manifestPromise;
    const variants = manifest?.events?.[event.name];
    if (!Array.isArray(variants) || !variants.length) return;
    const origin = latestPosition?.pos;
    const position = event.position;
    const distance = origin && position ? Math.hypot(
      position.x - origin.x, position.y - origin.y, position.z - origin.z) : 0;
    const volume = Math.max(0, Math.min(4, Number(event.volume) || 0));
    if (!volume) return;
    const attenuation = Math.max(0, 1 - distance / (16 * Math.max(1, volume)));
    if (attenuation <= 0) return;
    const now = performance.now();
    const cooldown = event.name === 'entity.player.teleport' ? 350
      : event.name.endsWith('.step') ? 120 : 45;
    if (now - (recent.get(event.name) ?? -Infinity) < cooldown) return;
    recent.set(event.name, now);
    if (recent.size > 128) recent.clear();
    const variant = variants[Math.floor(Math.random() * variants.length)];
    if (!/^[a-z0-9_/-]+\.ogg$/.test(variant?.file ?? '')) return;
    let bufferPromise = buffers.get(variant.file);
    if (!bufferPromise) {
      bufferPromise = fetch(`/sounds/${variant.file}`)
        .then(response => { if (!response.ok) throw Error('sound unavailable'); return response.arrayBuffer(); })
        .then(bytes => context.decodeAudioData(bytes));
      buffers.set(variant.file, bufferPromise);
      if (buffers.size > 96) buffers.delete(buffers.keys().next().value);
    }
    let buffer;
    try { buffer = await bufferPromise; } catch { buffers.delete(variant.file); return; }
    if (!enabled || context.state !== 'running') return;
    const gain = context.createGain();
    gain.gain.value = Math.min(0.32, 0.26 * volume *
      Math.max(0, Math.min(2, Number(variant.volume) || 1)) * attenuation);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = Math.max(0.5, Math.min(2,
      (Number(event.pitch) || 1) * (Number(variant.pitch) || 1)));
    source.connect(gain).connect(context.destination);
    activeVoices += 1;
    source.onended = () => { activeVoices -= 1; source.disconnect(); gain.disconnect(); };
    try { source.start(); } catch { activeVoices -= 1; source.disconnect(); gain.disconnect(); }
  };
  socket.on('worldSound', playSound);
  let lastTeleportPosition = null;
  socket.on('position', packet => {
    const pos = packet?.pos;
    if (!pos || ![pos.x, pos.y, pos.z].every(Number.isFinite)) return;
    if (packet.teleport === true && lastTeleportPosition &&
        Math.hypot(pos.x - lastTeleportPosition.x, pos.y - lastTeleportPosition.y,
          pos.z - lastTeleportPosition.z) > 4) {
      void playSound({ name: 'entity.player.teleport', position: null, volume: 1, pitch: 1 });
    }
    lastTeleportPosition = { x: pos.x, y: pos.y, z: pos.z };
  });
  socket.on('viewerReset', () => { lastTeleportPosition = null; });
}

cortiInstallWorldSound(socket);
