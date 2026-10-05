/** Semantic HUD layer. Extensions may register a handler or switch a CSS theme. */
const cortiPresentationHandlers = new Map();
const cortiPresentationEffects = new Map();
const cortiPresentationCooldowns = new Map();
const cortiPresentationRoot = document.getElementById('corti-presentation-toasts');
const cortiEffectsRoot = document.getElementById('corti-effects');
const cortiStatusVignette = document.getElementById('corti-status-vignette');
const cortiScoreboardRoot = document.getElementById('corti-scoreboard');
const cortiPresentationThemes = new Map([['vanilla-bright', {}], ['corti-arcane', {}]]);
const cortiThemeTokens = new Set(['--mc-viewer-vfx-fire', '--mc-viewer-vfx-arcane', '--mc-viewer-vfx-life',
  '--mc-viewer-vfx-water', '--mc-viewer-vfx-combat', '--mc-viewer-vfx-neutral', '--mc-viewer-ui-bg',
  '--mc-viewer-ui-border', '--mc-viewer-ui-text']);
const legacyThemePrefix = /^--corti-(vfx|ui)-/;
let cortiActiveThemeTokens = [];

function cortiPresentationTheme(name) {
  const tokens = cortiPresentationThemes.get(name);
  if (!tokens) return false;
  for (const key of cortiActiveThemeTokens) document.body.style.removeProperty(key);
  for (const [key, value] of Object.entries(tokens)) document.body.style.setProperty(key, value);
  cortiActiveThemeTokens = Object.keys(tokens);
  document.body.dataset.viewerTheme = name;
  try { localStorage.setItem('minecraftViewerTheme', name); } catch {}
  return true;
}
try { cortiPresentationTheme(localStorage.getItem('minecraftViewerTheme') ||
  localStorage.getItem('cortiViewerTheme') || 'vanilla-bright'); } catch {}

function cortiPresentationToast(event) {
  if (!cortiPresentationRoot || !event || typeof event.title !== 'string') return;
  const row = document.createElement('div');
  row.className = 'corti-presentation-toast';
  row.dataset.tone = ['positive', 'neutral', 'warning', 'danger', 'arcane', 'healing', 'frost', 'fire', 'movement'].includes(event.tone)
    ? event.tone : 'neutral';
  const title = document.createElement('strong');
  title.textContent = event.title.slice(0, 80);
  const body = document.createElement('span');
  body.textContent = String(event.body || '').slice(0, 240);
  row.append(title, body);
  cortiPresentationRoot.append(row);
  while (cortiPresentationRoot.children.length > 3) cortiPresentationRoot.firstElementChild.remove();
  setTimeout(() => row.remove(), event.kind === 'achievement' ? 7_000 : 5_000);
}

function cortiPresentationEffectsRender() {
  cortiEffectsRoot?.replaceChildren();
  const now = Date.now();
  let poisoned = false;
  let nauseaStrength = 0;
  for (const [id, effect] of cortiPresentationEffects) {
    if (effect.until <= now) { cortiPresentationEffects.delete(id); continue; }
    if (effect.name === 'poison') poisoned = true;
    if (effect.name === 'nausea') {
      nauseaStrength = Math.min(1, (now - effect.startedAt) / 1500, (effect.until - now) / 1500);
    }
    if (!cortiEffectsRoot) continue;
    const row = document.createElement('div');
    row.className = 'corti-effect';
    row.dataset.type = effect.type === 'bad' ? 'bad' : 'good';
    if (effect.name === 'poison') {
      row.style.borderColor = '#a7df65';
      row.style.background = '#26411ae8';
      row.style.boxShadow = '0 0 12px #82c943bb';
    }
    const icon = document.createElement('img');
    icon.alt = '';
    icon.src = `/textures/mob_effect/${effect.name}.png`;
    icon.onerror = () => { icon.hidden = true; };
    const label = document.createElement('span');
    const title = effect.name === 'poison' ? '中毒' : effect.name === 'nausea' ? '反胃（眩晕）' : effect.title;
    label.textContent = `${title}${effect.amplifier > 0 ? ` ${effect.amplifier + 1}` : ''}`;
    const time = document.createElement('small');
    const left = Math.ceil((effect.until - now) / 1000);
    time.textContent = left > 3600 ? '∞' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    row.append(icon, label, time);
    cortiEffectsRoot.append(row);
  }
  cortiSetHudPoisoned(poisoned);
  document.body.classList.toggle('corti-has-nausea', nauseaStrength > 0);
  document.body.style.setProperty('--mc-viewer-nausea-strength', String(nauseaStrength));
  cortiStatusVignette?.classList.toggle('is-nauseated', nauseaStrength > 0);
}

function cortiPresentationCooldownsRender() {
  const now = Date.now();
  const slots = document.querySelectorAll('#corti-survival .corti-slot');
  for (let i = 0; i < slots.length; i++) {
    const itemId = pendingAvatarState?.hotbar?.[i]?.item?.type;
    const cooldown = cortiPresentationCooldowns.get(itemId);
    const overlay = slots[i].querySelector('.corti-cooldown');
    if (!cooldown || cooldown.until <= now) {
      overlay?.remove();
      if (cooldown) cortiPresentationCooldowns.delete(itemId);
      continue;
    }
    const mask = overlay || document.createElement('div');
    mask.className = 'corti-cooldown';
    mask.style.height = `${Math.round((cooldown.until - now) / cooldown.duration * 100)}%`;
    if (!overlay) slots[i].append(mask);
  }
}

function cortiPresentationScoreboard(event) {
  if (!cortiScoreboardRoot) return;
  cortiScoreboardRoot.replaceChildren();
  if (!event || !Array.isArray(event.rows) || !event.rows.length) {
    cortiScoreboardRoot.hidden = true;
    return;
  }
  cortiScoreboardRoot.hidden = false;
  const header = document.createElement('strong');
  header.textContent = String(event.title || '计分板').slice(0, 80);
  cortiScoreboardRoot.append(header);
  for (const entry of event.rows.slice(0, 15)) {
    const row = document.createElement('div');
    const label = document.createElement('span');
    const value = document.createElement('b');
    label.textContent = String(entry.name || '').slice(0, 80);
    value.textContent = String(entry.value ?? '');
    row.append(label, value);
    cortiScoreboardRoot.append(row);
  }
}

function cortiPresentationEvent(event) {
  if (!event || typeof event.kind !== 'string') return;
  if (event.kind === 'effect') {
    if (!Number.isInteger(event.id) || (event.active !== false && typeof event.name !== 'string')) return;
    if (event.self === false) return;
    if (event.active === false) cortiPresentationEffects.delete(event.id);
    else {
      const now = Date.now();
      const name = event.name.replace(/^minecraft:/, '').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
      const previous = cortiPresentationEffects.get(event.id);
      cortiPresentationEffects.set(event.id, {
        name, title: event.title || event.name, type: event.type,
        amplifier: Number(event.amplifier) || 0,
        startedAt: previous?.name === name ? previous.startedAt : now,
        until: event.durationTicks === -1 ? Infinity :
          now + Math.max(0, Math.min(3600, Number(event.durationTicks) / 20 || 0)) * 1000,
      });
    }
    cortiPresentationEffectsRender();
  } else if (event.kind === 'cooldown') {
    const duration = Math.max(0, Math.min(60_000, Number(event.durationTicks) * 50 || 0));
    if (!Number.isInteger(event.itemId)) return;
    if (duration) cortiPresentationCooldowns.set(event.itemId, { until: Date.now() + duration, duration });
    else cortiPresentationCooldowns.delete(event.itemId);
  } else if (event.kind !== 'particle' && event.kind !== 'explosion' &&
      event.kind !== 'world_event' && event.kind !== 'pickup') {
    const handler = cortiPresentationHandlers.get(event.kind);
    if (handler) handler(event);
    else if (event.kind !== 'skill') cortiPresentationToast(event);
  }
}

const cortiPresentationApi = Object.freeze({
  register(kind, handler) {
    if (!/^[a-z][a-z_]{0,31}$/.test(kind) || typeof handler !== 'function') return false;
    cortiPresentationHandlers.set(kind, handler);
    return true;
  },
  registerTheme(name, tokens) {
    if (typeof name !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(name) ||
        !tokens || typeof tokens !== 'object' || Object.keys(tokens).length > 9 ||
        !Object.entries(tokens).every(([key, value]) => cortiThemeTokens.has(key.replace(legacyThemePrefix, '--mc-viewer-$1-')) &&
          typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value))) return false;
    cortiPresentationThemes.set(name, Object.fromEntries(Object.entries(tokens).map(([key, value]) =>
      [key.replace(legacyThemePrefix, '--mc-viewer-$1-'), value])));
    return true;
  },
  setTheme: cortiPresentationTheme,
  get themes() { return [...cortiPresentationThemes.keys()]; },
});
globalThis.MinecraftViewerPresentation = cortiPresentationApi;
globalThis.CortiViewerPresentation = cortiPresentationApi;

socket.on('presentationEvent', cortiPresentationEvent);
socket.on('scoreboardState', cortiPresentationScoreboard);
let cortiLastTeleportPosition = null;
socket.on('position', packet => {
  const pos = packet?.pos;
  if (!pos || ![pos.x, pos.y, pos.z].every(Number.isFinite)) return;
  if (packet.teleport === true && cortiLastTeleportPosition &&
      Math.hypot(pos.x - cortiLastTeleportPosition.x, pos.y - cortiLastTeleportPosition.y,
        pos.z - cortiLastTeleportPosition.z) > 4) {
    cortiPresentationToast({ kind: 'teleport', tone: 'movement', title: '传送抵达',
      body: `坐标 ${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}` });
  }
  cortiLastTeleportPosition = { x: pos.x, y: pos.y, z: pos.z };
});
function cortiPresentationReset() {
  cortiLastTeleportPosition = null;
  cortiPresentationEffects.clear();
  cortiPresentationCooldowns.clear();
  cortiPresentationEffectsRender();
  cortiPresentationCooldownsRender();
}
socket.on('viewerReset', cortiPresentationReset);
socket.on('disconnect', cortiPresentationReset);
setInterval(() => { cortiPresentationEffectsRender(); cortiPresentationCooldownsRender(); }, 250);
