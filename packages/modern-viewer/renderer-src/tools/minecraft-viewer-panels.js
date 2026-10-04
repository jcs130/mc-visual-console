/** Read-only 1.20.6 inventory, container, minimap and skill overlays. */
let cortiPanelAvatar = null;
let cortiPanelWindow = null;
let cortiInventoryOpen = false;
let cortiIdleInventoryOpen = false;
let cortiIdleInventoryTimer = null;
let cortiPanelMap = null;
const cortiMapCells = new Map();
let cortiMapDimension = '';
let cortiMapSampleY = null;
let cortiPanelSkills = null;
const cortiAbilityCooldowns = new Map();
const cortiAbilityCastSequences = new Map();
const cortiPinnedAbilityStorageKey = 'minecraft.viewer.pinnedAbilities.v1';
let cortiPinnedAbilityIds = cortiReadPinnedAbilities();
let cortiShowAllAbilities = false;
const cortiAbilityIcons = Object.freeze({
  starbolt: 'spectral_arrow', frostnova: 'blue_ice', flamewave: 'blaze_powder',
  leap: 'feather', flight: 'elytra', golem: 'iron_block', sense: 'spyglass',
  heal: 'golden_apple', home: 'ender_pearl', conjure_bread: 'bread',
});
let cortiMapDrawAt = 0;
let cortiMenuSignature = '';
let cortiDismissedWindowId = null;
let cortiCombatUntil = 0;
let cortiCombatTimer = null;
let cortiInventoryPlayerPreview = null;

function cortiSyncInventoryPlayerPreview() {
  const menu = document.getElementById('corti-menu');
  const host = menu?.querySelector('[data-inventory-player-preview]');
  if (!menu || menu.hidden || !host) {
    cortiInventoryPlayerPreview?.setVisible(false);
    return;
  }
  if (cortiInventoryPlayerPreview?.disposed) cortiInventoryPlayerPreview = null;
  cortiInventoryPlayerPreview ??= new InventoryPlayerPreview({
    THREE: CortiThree,
    resolveSource: () => {
      const entities = globalThis.world?.entities;
      const id = cortiPanelAvatar?.entity?.id;
      if (id === undefined || id === null) return null;
      const entity = entities?.entities?.[String(id)];
      if (entity?.playerObject) return entity;
      const special = entities?.playerEntity;
      return special?.originalEntity?.id === id ? special : null;
    },
    createFallback: () => createInventoryPreviewFallback(CortiThree, {
      getAvatar: () => cortiPanelAvatar,
      getSkin: () => selectedPlayerSkin,
      getEntities: () => globalThis.world?.entities,
    }),
  });
  cortiInventoryPlayerPreview.attach(host);
}

const cortiMenuTextures = '/textures/gui/container/';
const cortiMenuLayouts = Object.freeze({
  anvil: { texture: 'anvil', slots: [[27, 47], [76, 47], [134, 47]] },
  beacon: { texture: 'beacon', width: 230, height: 219, inventoryX: 36, inventoryY: 136,
    slots: [[136, 110]] },
  brewing_stand: { texture: 'brewing_stand',
    slots: [[56, 51], [79, 58], [102, 51], [79, 17], [17, 53]] },
  enchantment: { texture: 'enchanting_table', slots: [[15, 47], [35, 47]] },
  enchanting_table: { texture: 'enchanting_table', slots: [[15, 47], [35, 47]] },
  grindstone: { texture: 'grindstone', slots: [[49, 19], [49, 40], [129, 34]] },
  hopper: { texture: 'hopper', height: 133, inventoryY: 51,
    slots: [[44, 20], [62, 20], [80, 20], [98, 20], [116, 20]] },
  loom: { texture: 'loom', slots: [[13, 26], [33, 26], [23, 45], [143, 58]] },
  smithing: { texture: 'smithing',
    slots: [[8, 48], [26, 48], [44, 48], [98, 48]] },
  cartography: { texture: 'cartography_table', slots: [[15, 15], [15, 52], [140, 34]] },
  cartography_table: { texture: 'cartography_table', slots: [[15, 15], [15, 52], [140, 34]] },
  stonecutter: { texture: 'stonecutter', slots: [[20, 33], [143, 33]] },
});
const cortiMenuLayoutCss = `.corti-menu-background-slice{position:absolute;left:0;width:352px;background-size:512px 512px;background-repeat:no-repeat;pointer-events:none}
  .corti-trade-list{position:absolute;left:8px;top:32px;width:184px;height:280px;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:#9d9d9d #5e5e5e}
  .corti-trade-row{position:relative;height:40px;box-sizing:border-box;border:1px solid #8e8e8e;background:#999;box-shadow:inset 1px 1px #d7d7d7}
  .corti-trade-row:nth-child(even){background:#898989}
  .corti-trade-row.is-disabled{filter:grayscale(1);opacity:.65}
  .corti-trade-arrow,.corti-trade-empty,.corti-trade-level,.corti-menu-cost,.corti-menu-enchant-level,.corti-menu-brew-time{position:absolute;font:700 12px/1.2 system-ui;text-shadow:1px 1px #252525;color:#f7f5e8;pointer-events:none}
  .corti-trade-arrow{color:#e7f5db;font-size:18px}
  .corti-trade-empty{max-width:158px;color:#ece9dd}
  .corti-trade-level{color:#354035;text-shadow:none}
  .corti-menu-cost{color:#8b1010;text-shadow:none}
  .corti-menu-enchant-level{color:#4b3f2f;text-shadow:none}
  .corti-menu-brew-time{color:#454035;text-shadow:none}
  .corti-menu-book{width:min(440px,82vw);min-height:310px;box-sizing:border-box;padding:22px 25px;background:#e5d7a5;color:#342a1d;border:8px ridge #896c45;box-shadow:inset 0 0 20px #8b7448aa}
  .corti-menu-book-page{min-height:240px;white-space:pre-wrap;overflow-wrap:anywhere;font:17px/1.45 serif}
  .corti-menu-book footer{display:flex;align-items:center;justify-content:space-between;gap:20px;font:15px system-ui}
  .corti-menu-book footer button{border:1px solid #765b36;border-radius:3px;background:#ebdfbd;color:#392915;font:24px/1 serif;cursor:pointer}
  .corti-menu-book footer button:disabled{opacity:.35;cursor:default}
  .corti-menu[data-compact="true"]{top:35%;right:10px;left:auto;transform:none;zoom:.66;opacity:.82;max-width:60vw;max-height:85vh;box-shadow:0 4px 20px #0008}
  .corti-menu[data-compact="true"]:hover,.corti-menu[data-compact="true"]:focus-within{opacity:1}
  @media(max-width:720px){.corti-menu[data-compact="true"]{top:38%;right:4px;zoom:.44;max-width:55vw;max-height:105vh}}`;
const cortiTerrainColors = Object.freeze({
  '?': '#26343b', ' ': '#27323b', W: '#4b91c1', L: '#ed743c', F: '#4f9a63',
  T: '#826545', G: '#91b75d', P: '#ad9a6d', S: '#d7c68b', N: '#edf1e5',
  C: '#b7bd69', R: '#929ca0', B: '#8f725b', H: '#a57d66', X: '#8b8e7b',
});

function cortiReadPinnedAbilities() {
  try {
    const saved = window.localStorage.getItem(cortiPinnedAbilityStorageKey);
    if (saved === null) return null;
    const ids = JSON.parse(saved);
    return Array.isArray(ids) ? new Set(ids.filter((id) => typeof id === 'string')) : null;
  } catch { return null; }
}

function cortiAbilityPins(abilities) {
  return cortiPinnedAbilityIds ?? new Set(abilities.slice(0, 8).map((ability) => cortiAbilityKey(ability.id)));
}

function cortiToggleAbilityPin(id, abilities) {
  const pins = new Set(cortiAbilityPins(abilities));
  if (pins.has(id)) pins.delete(id);
  else pins.add(id);
  cortiPinnedAbilityIds = pins;
  try { window.localStorage.setItem(cortiPinnedAbilityStorageKey, JSON.stringify([...pins])); } catch {}
  cortiRenderSkills();
}

function cortiInstallAbilityControls(root) {
  if (root.querySelector('[data-corti-ability-controls]')) return;
  const style = document.createElement('style');
  style.textContent = `#corti-skills [data-corti-ability-controls]{position:sticky;top:-10px;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:7px;padding:5px 0;background:#11242cf2;color:#dce9e8;font:11px/1.3 system-ui}
    #corti-skills [data-corti-ability-controls] button{padding:3px 7px;border:1px solid #9bc3cb;border-radius:5px;background:#254553;color:#f4fbff;font:11px system-ui;cursor:pointer}
    #corti-skills .corti-ability{cursor:pointer;padding:0}
    #corti-skills .corti-ability:focus-visible{outline:2px solid #f5d88d;outline-offset:2px}
    #corti-skills .corti-ability[data-pinned="true"]{border-color:#efd080}
    #corti-skills .corti-ability-pin{position:absolute;top:1px;right:2px;color:#ffe49a;font:13px/1 system-ui;text-shadow:1px 1px #091923;pointer-events:none}`;
  document.head.append(style);
  const controls = document.createElement('div');
  controls.dataset.cortiAbilityControls = '';
  const count = document.createElement('span');
  count.dataset.cortiAbilityCount = '';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.dataset.cortiAbilityToggle = '';
  toggle.addEventListener('click', () => {
    cortiShowAllAbilities = !cortiShowAllAbilities;
    cortiRenderSkills();
  });
  controls.append(count, toggle);
  root.querySelector('[data-ability-list]')?.before(controls);
}

function cortiInstallPanels(socket) {
  if (!document.getElementById('corti-menu-layout-style')) {
    const style = document.createElement('style');
    style.id = 'corti-menu-layout-style';
    style.textContent = cortiMenuLayoutCss;
    document.head.append(style);
  }
  const skillsRoot = document.getElementById('corti-skills');
  if (skillsRoot) cortiInstallAbilityControls(skillsRoot);
  const button = document.getElementById('corti-inventory-toggle');
  const menu = document.getElementById('corti-menu');
  button?.addEventListener('click', () => {
    cortiCancelInventoryPreview(false);
    cortiInventoryOpen = !cortiInventoryOpen;
    cortiRenderMenu();
  });
  menu?.querySelector('[data-menu-close]')?.addEventListener('click', () => {
    cortiCancelInventoryPreview(false);
    cortiInventoryOpen = false;
    cortiDismissedWindowId = cortiPanelWindow?.id ?? null;
    menu.hidden = true;
    cortiSyncInventoryPlayerPreview();
  });
  window.addEventListener('keydown', (event) => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
    if (event.code === 'KeyE') {
      cortiCancelInventoryPreview(false);
      cortiInventoryOpen = !cortiInventoryOpen;
      cortiRenderMenu();
      event.preventDefault();
    } else if (event.code === 'Escape' && menu && !menu.hidden) {
      cortiCancelInventoryPreview(false);
      cortiInventoryOpen = false;
      cortiDismissedWindowId = cortiPanelWindow?.id ?? null;
      menu.hidden = true;
      cortiSyncInventoryPlayerPreview();
      event.preventDefault();
    }
  });
  socket.on('avatarState', (state) => {
    cortiPanelAvatar = state;
    cortiRenderMana();
    if ((cortiInventoryOpen || cortiIdleInventoryOpen) && !cortiPanelWindow) cortiRenderMenu();
    cortiSyncInventoryPlayerPreview();
    if (performance.now() - cortiMapDrawAt > 120) {
      cortiMapDrawAt = performance.now();
      cortiDrawMinimap();
    }
  });
  socket.on('containerState', (state) => {
    const previousId = cortiPanelWindow?.id;
    cortiPanelWindow = state && typeof state === 'object' ? state : null;
    if (cortiPanelWindow) cortiCancelInventoryPreview(false);
    if (!cortiPanelWindow || cortiPanelWindow.id !== previousId) cortiDismissedWindowId = null;
    if (cortiPanelWindow || previousId !== undefined || cortiInventoryOpen) cortiRenderMenu();
  });
  socket.on('inventoryPreview', cortiInventoryPreview);
  for (const name of ['disconnect', 'viewerReset']) socket.on(name, () => {
    cortiCancelInventoryPreview();
    cortiInventoryPlayerPreview?.reset();
  });
  window.addEventListener('pagehide', (event) => {
    cortiCancelInventoryPreview();
    if (event.persisted) cortiInventoryPlayerPreview?.reset();
    else cortiInventoryPlayerPreview?.dispose();
  });
  window.addEventListener('pageshow', () => cortiSyncInventoryPlayerPreview());
  for (const eventName of ['entityDamage', 'tacticalAttack', 'combatFeedback']) {
    socket.on(eventName, (event) => {
      if (eventName === 'entityDamage' && event?.isSelf !== true) return;
      cortiMarkCombat();
    });
  }
  socket.on('rangedUse', (event) => {
    if (event?.phase === 'draw' || event?.phase === 'release') cortiMarkCombat();
  });
  socket.on('minimap', (state) => {
    if (!state || typeof state.cells !== 'string' || state.radius !== 12 || state.cells.length !== 625) return;
    if (cortiMapDimension !== state.dimension ||
        (cortiMapSampleY !== null && Math.abs(cortiMapSampleY - state.sampleY) > 5)) cortiMapCells.clear();
    cortiMapDimension = state.dimension;
    cortiMapSampleY = state.sampleY;
    const width = state.radius * 2 + 1;
    for (let z = 0; z < width; z++) for (let x = 0; x < width; x++) {
      cortiMapCells.set(`${state.centerX + x - state.radius},${state.centerZ + z - state.radius}`,
        state.cells[z * width + x]);
    }
    for (const key of cortiMapCells.keys()) {
      const [x, z] = key.split(',').map(Number);
      if (Math.abs(x - state.centerX) > 36 || Math.abs(z - state.centerZ) > 36) cortiMapCells.delete(key);
    }
    cortiPanelMap = state;
    cortiDrawMinimap();
  });
  socket.on('skillsState', (state) => {
    cortiPanelSkills = state;
    const activeIds = new Set();
    for (const ability of state?.abilities || []) {
      const id = cortiAbilityKey(ability.id);
      activeIds.add(id);
      if (ability.cooldownRemainingMs > 0) cortiAbilityCooldowns.set(id, {
        until: Date.now() + ability.cooldownRemainingMs,
        duration: Math.max(ability.cooldownMs || 0, ability.cooldownRemainingMs),
      });
      else cortiAbilityCooldowns.delete(id);
    }
    for (const id of cortiAbilityCooldowns.keys()) {
      if (!activeIds.has(id)) cortiAbilityCooldowns.delete(id);
    }
    cortiRenderSkills();
  });
  socket.on('castCue', (event) => {
    if (event?.phase !== 'succeeded') return;
    const spellId = cortiAbilityKey(event.spellId);
    const known = cortiPanelSkills?.abilities || [];
    const matches = known.filter((entry) => cortiAbilityId(entry.id) === cortiAbilityId(spellId));
    const ability = known.find((entry) => cortiAbilityKey(entry.id) === spellId)
      || (matches.length === 1 ? matches[0] : null);
    const id = ability && cortiAbilityKey(ability.id);
    if (!ability || !Number.isSafeInteger(event.seq) ||
        cortiAbilityCastSequences.get(id) === event.seq) return;
    cortiAbilityCastSequences.set(id, event.seq);
    if (Number.isFinite(ability.cooldownMs) && ability.cooldownMs > 0) {
      cortiAbilityCooldowns.set(id, { until: Date.now() + ability.cooldownMs,
        duration: ability.cooldownMs });
      const icon = [...document.querySelectorAll('#corti-skills .corti-ability')]
        .find((entry) => entry.dataset.abilityId === id);
      if (icon) icon.dataset.cooldownStatus = 'running';
    }
    cortiUpdateAbilityIcons();
  });
  setInterval(cortiUpdateAbilityIcons, 200);
  cortiRenderSkills();
}

function cortiMarkCombat() {
  cortiCombatUntil = performance.now() + 5_000;
  cortiCancelInventoryPreview(false);
  cortiRenderMenu();
  if (cortiCombatTimer !== null) clearTimeout(cortiCombatTimer);
  cortiCombatTimer = setTimeout(() => {
    cortiCombatTimer = null;
    cortiRenderMenu();
  }, 5_000);
}

function cortiCancelInventoryPreview(render = true) {
  cortiIdleInventoryOpen = false;
  if (cortiIdleInventoryTimer !== null) clearTimeout(cortiIdleInventoryTimer);
  cortiIdleInventoryTimer = null;
  if (render) cortiRenderMenu();
}

function cortiInventoryPreview(event) {
  cortiCancelInventoryPreview(false);
  if (event?.open === true && !cortiInventoryOpen && !cortiPanelWindow &&
      performance.now() >= cortiCombatUntil) {
    cortiIdleInventoryOpen = true;
    const ttlMs = Number.isFinite(event.ttlMs) && event.ttlMs > 0
      ? Math.min(event.ttlMs, 2_400) : 2_400;
    cortiIdleInventoryTimer = setTimeout(() => {
      cortiIdleInventoryTimer = null;
      cortiIdleInventoryOpen = false;
      cortiRenderMenu();
    }, ttlMs);
  }
  cortiRenderMenu();
}

function cortiRenderMenu() {
  const root = document.getElementById('corti-menu');
  if (!root) return;
  const container = cortiPanelWindow;
  if ((!container && !cortiInventoryOpen && !cortiIdleInventoryOpen) ||
      (container && cortiDismissedWindowId === container.id && !cortiInventoryOpen)) {
    root.hidden = true;
    cortiSyncInventoryPlayerPreview();
    return;
  }
  const source = container ? 'container' : cortiInventoryOpen ? 'manual' : 'idle';
  root.dataset.inventorySource = source;
  root.dataset.compact = String(performance.now() < cortiCombatUntil);
  const signature = JSON.stringify([source, container || cortiPanelAvatar?.inventory || []]);
  const wasHidden = root.hidden;
  root.hidden = false;
  if (!wasHidden && signature === cortiMenuSignature) { cortiSyncInventoryPlayerPreview(); return; }
  cortiMenuSignature = signature;
  root.querySelector('[data-menu-title]').textContent = container?.title || '背包';
  root.querySelector('[data-menu-source]').textContent = container ? '游戏窗口 · 只读'
    : source === 'idle' ? '待机预览 · 只读' : '玩家物品 · 只读';
  const target = root.querySelector('[data-menu-body]');
  cortiInventoryPlayerPreview?.setVisible(false);
  target.replaceChildren();
  if (!container) { cortiRenderInventory(target, cortiPanelAvatar?.inventory); return; }
  const type = String(container.type || '').replace(/^minecraft:/, '');
  if (['furnace', 'blast_furnace', 'smoker'].includes(type)) {
    cortiRenderFurnace(target, container, type);
  } else if (type === 'inventory') {
    cortiRenderInventory(target, container.slots);
  } else if (type === 'crafting' || type === 'crafting_table') {
    cortiRenderCrafting(target, container);
  } else if (type === 'merchant' || type === 'villager') {
    cortiRenderMerchant(target, container);
  } else if (type === 'lectern') {
    cortiRenderLectern(target, container);
  } else if (type === 'EntityHorse') {
    cortiRenderHorse(target, container);
  } else if (/^generic_9x[1-6]$/.test(type) || type === 'shulker_box') {
    cortiRenderChest(target, container, type);
  } else if (type === 'generic_3x3' || type === 'crafter_3x3') {
    cortiRenderThreeGrid(target, container, type);
  } else if (cortiMenuLayouts[type]) {
    cortiRenderStation(target, container, type);
  } else {
    cortiRenderGenericContainer(target, container);
  }
}

function cortiVanillaBackground(parent, name, width = 176, height = 166) {
  const body = document.createElement('div');
  body.className = 'corti-menu-body corti-menu-vanilla';
  body.style.backgroundImage = `url("${cortiMenuTextures}${name}.png")`;
  body.style.width = `${width * 2}px`;
  body.style.height = `${height * 2}px`;
  body.style.backgroundSize = `${name === 'villager' ? 1024 : 512}px 512px`;
  parent.append(body);
  return body;
}

function cortiSlot(parent, x, y, item, label = '') {
  const slot = document.createElement('div');
  slot.className = 'corti-menu-slot';
  slot.style.left = `${x * 2}px`;
  slot.style.top = `${y * 2}px`;
  const durability = cortiDurability(item);
  slot.title = item ? `${item.displayName || item.name} × ${item.count || 1}${item.enchanted === true ? ' · 附魔' : ''}${durability ? ` · 耐久 ${durability.left}/${durability.max}` : ''}` : label;
  if (item) {
    const name = String(item.name || '').replace(/^minecraft:/, '');
    if (/^[a-z0-9_]+$/.test(name)) {
      const image = document.createElement('img');
      image.alt = '';
      image.src = `/icons/${name}.png`;
      image.onerror = () => {
        if (!image.isConnected) return;
        image.remove();
        cortiSlotFallback(slot, item);
      };
      slot.append(image);
    } else cortiSlotFallback(slot, item);
    cortiAppendHeadFace(slot, item, 2);
    cortiAppendEnchantmentGlint(slot, item, 2);
    cortiAppendDurability(slot, item);
    if (Number(item.count) > 1) {
      const count = document.createElement('small');
      count.textContent = String(item.count);
      slot.append(count);
    }
  }
  parent.append(slot);
  return slot;
}

function cortiSlotFallback(slot, item) {
  const fallback = document.createElement('span');
  fallback.className = 'corti-item-fallback';
  fallback.textContent = String(item.displayName || item.name).slice(0, 2);
  slot.prepend(fallback);
}

function cortiPlayerRows(parent, slots, start, hotbarStart, y = 84, x = 8) {
  for (let i = 0; i < 27; i++) {
    cortiSlot(parent, x + (i % 9) * 18, y + Math.floor(i / 9) * 18,
      slots?.[start + i], `背包 ${i + 1}`);
  }
  for (let i = 0; i < 9; i++) {
    cortiSlot(parent, x + i * 18, y + 58, slots?.[hotbarStart + i], `快捷栏 ${i + 1}`);
  }
}

function cortiRenderInventory(parent, slots) {
  const body = cortiVanillaBackground(parent, 'inventory');
  const preview = document.createElement('div');
  preview.className = 'corti-inventory-player-preview';
  preview.dataset.inventoryPlayerPreview = '';
  preview.dataset.previewState = 'waiting';
  preview.setAttribute('role', 'img');
  preview.setAttribute('aria-label', '玩家皮肤与当前装备预览');
  preview.title = '移动鼠标查看当前皮肤与装备';
  body.append(preview);
  for (let i = 0; i < 4; i++) cortiSlot(body, 8, 8 + i * 18, slots?.[5 + i], '护甲');
  for (let i = 0; i < 4; i++) cortiSlot(body, 98 + (i % 2) * 18, 18 + Math.floor(i / 2) * 18, slots?.[1 + i], '合成');
  cortiSlot(body, 154, 28, slots?.[0], '合成结果');
  cortiSlot(body, 77, 62, slots?.[45], '副手');
  cortiPlayerRows(body, slots, 9, 36);
  cortiSyncInventoryPlayerPreview();
}

function cortiRenderFurnace(parent, container, type) {
  const slots = container.slots;
  const body = cortiVanillaBackground(parent, type);
  cortiSlot(body, 56, 17, slots?.[0], '原料');
  cortiSlot(body, 56, 53, slots?.[1], '燃料');
  cortiSlot(body, 116, 35, slots?.[2], '产物');
  cortiPlayerRows(body, slots, container.inventoryStart, container.hotbarStart);
  const progress = container.furnace || {};
  cortiFurnaceProgress(body, type, 'lit_progress', 56, 36, 14, 14, progress.burn, true);
  cortiFurnaceProgress(body, type, 'burn_progress', 79, 34, 24, 16, progress.cook, false);
}

function cortiFurnaceProgress(parent, type, sprite, x, y, width, height, fraction, vertical) {
  if (!Number.isFinite(fraction) || fraction <= 0) return;
  const clip = document.createElement('div');
  clip.className = 'corti-menu-progress';
  clip.style.left = `${x * 2}px`;
  clip.style.top = `${y * 2}px`;
  clip.style.width = `${width * 2}px`;
  clip.style.height = `${height * 2}px`;
  const image = document.createElement('span');
  image.style.backgroundImage = `url("/textures/gui/sprites/container/${type}/${sprite}.png")`;
  image.style.backgroundSize = `${width * 2}px ${height * 2}px`;
  image.style.width = `${width * 2}px`;
  image.style.height = `${height * 2}px`;
  image.style.clipPath = vertical
    ? `inset(${Math.round((1 - fraction) * 100)}% 0 0 0)`
    : `inset(0 ${Math.round((1 - fraction) * 100)}% 0 0)`;
  clip.append(image);
  parent.append(clip);
}

function cortiRenderCrafting(parent, container) {
  const body = cortiVanillaBackground(parent, 'crafting_table');
  const slots = container.slots;
  for (let i = 0; i < 9; i++) cortiSlot(body, 30 + (i % 3) * 18, 17 + Math.floor(i / 3) * 18, slots?.[i + 1], '合成');
  cortiSlot(body, 124, 35, slots?.[0], '合成结果');
  cortiPlayerRows(body, slots, container.inventoryStart, container.hotbarStart);
}

function cortiRenderStation(parent, container, type) {
  const layout = cortiMenuLayouts[type];
  const body = cortiVanillaBackground(parent, layout.texture,
    layout.width || 176, layout.height || 166);
  const slots = container.slots || [];
  const count = Math.min(layout.slots.length, Math.max(0, Number(container.containerCount) || 0));
  for (let i = 0; i < count; i++) {
    const position = type === 'smithing' && count === 3
      ? layout.slots[i === 2 ? 3 : i + 1] : layout.slots[i];
    const [x, y] = position;
    cortiSlot(body, x, y, slots[i], `工作台槽位 ${i + 1}`);
  }
  cortiPlayerRows(body, slots, container.inventoryStart, container.hotbarStart,
    layout.inventoryY ?? 84, layout.inventoryX ?? 8);
  const properties = container.properties || {};
  if (type === 'anvil' && Number(properties[0]) > 0) {
    cortiMenuText(body, 57, 20, `花费 ${properties[0]} 级`, 'corti-menu-cost');
  } else if (type === 'enchantment' || type === 'enchanting_table') {
    for (let i = 0; i < 3; i++) {
      if (Number(properties[i]) > 0) {
        cortiMenuText(body, 125, 19 + i * 19, `Lv.${properties[i]}`, 'corti-menu-enchant-level');
      }
    }
  } else if (type === 'brewing_stand' && Number(properties[0]) > 0) {
    const seconds = Math.ceil(Number(properties[0]) / 20);
    cortiMenuText(body, 60, 37, `${seconds}s`, 'corti-menu-brew-time');
  }
}

function cortiMenuText(parent, x, y, content, className) {
  const label = document.createElement('span');
  label.className = className;
  label.style.left = `${x * 2}px`;
  label.style.top = `${y * 2}px`;
  label.textContent = content;
  parent.append(label);
}

function cortiRenderThreeGrid(parent, container, type) {
  const crafter = type === 'crafter_3x3';
  const body = cortiVanillaBackground(parent, crafter ? 'crafter' : 'dispenser');
  const slots = container.slots || [];
  for (let i = 0; i < 9; i++) {
    cortiSlot(body, (crafter ? 26 : 62) + i % 3 * 18,
      17 + Math.floor(i / 3) * 18, slots[i], `容器 ${i + 1}`);
  }
  if (crafter) cortiSlot(body, 129, 31, slots[9], '合成结果');
  cortiPlayerRows(body, slots, container.inventoryStart, container.hotbarStart);
}

function cortiRenderChest(parent, container, type) {
  const slots = container.slots || [];
  const rows = type === 'shulker_box' ? 3
    : Math.max(1, Math.min(6, Number(type.slice(-1)) || Math.ceil(container.containerCount / 9)));
  const height = rows * 18 + 113;
  const body = cortiVanillaBackground(parent,
    type === 'shulker_box' ? 'shulker_box' : 'generic_54', 176, height);
  if (type !== 'shulker_box' && rows < 6) {
    body.style.backgroundImage = 'none';
    const top = document.createElement('div');
    top.className = 'corti-menu-background-slice';
    top.style.height = `${(rows * 18 + 17) * 2}px`;
    top.style.backgroundImage = `url("${cortiMenuTextures}generic_54.png")`;
    const bottom = document.createElement('div');
    bottom.className = 'corti-menu-background-slice';
    bottom.style.top = top.style.height;
    bottom.style.height = '192px';
    bottom.style.backgroundImage = top.style.backgroundImage;
    bottom.style.backgroundPosition = '0 -250px';
    body.append(top, bottom);
  }
  for (let i = 0; i < rows * 9; i++) {
    cortiSlot(body, 8 + i % 9 * 18, 18 + Math.floor(i / 9) * 18,
      slots[i], `容器 ${i + 1}`);
  }
  cortiPlayerRows(body, slots, container.inventoryStart, container.hotbarStart,
    30 + rows * 18);
}

function cortiRenderMerchant(parent, container) {
  const body = cortiVanillaBackground(parent, 'villager', 276, 166);
  const slots = container.slots || [];
  cortiSlot(body, 136, 37, slots[0], '支付物品');
  cortiSlot(body, 162, 37, slots[1], '第二种支付物品');
  cortiSlot(body, 215, 36, slots[2], '交易产物');
  cortiPlayerRows(body, slots, container.inventoryStart, container.hotbarStart, 83, 107);
  const offers = Array.isArray(container.trades?.offers) ? container.trades.offers : [];
  const list = document.createElement('div');
  list.className = 'corti-trade-list';
  list.setAttribute('role', 'list');
  list.setAttribute('aria-label', '村民交易报价');
  for (const [index, offer] of offers.entries()) {
    const row = document.createElement('div');
    row.className = `corti-trade-row${offer.disabled ? ' is-disabled' : ''}`;
    row.setAttribute('role', 'listitem');
    const pay = Number.isFinite(offer.realPrice) && offer.realPrice > 0
      ? { ...offer.input, count: offer.realPrice } : offer.input;
    cortiSlot(row, 1, 1, pay, `报价 ${index + 1} 支付`);
    if (offer.secondInput) cortiSlot(row, 20, 1, offer.secondInput, '第二种支付');
    cortiMenuText(row, 44, 4, '➜', 'corti-trade-arrow');
    cortiSlot(row, 64, 1, offer.output, '交易产物');
    const stock = Math.max(0, Number(offer.maxUses) - Number(offer.uses));
    row.title = `报价 ${index + 1}：${pay.displayName} ×${pay.count}`
      + (offer.secondInput ? ` + ${offer.secondInput.displayName} ×${offer.secondInput.count}` : '')
      + ` → ${offer.output.displayName} ×${offer.output.count}`
      + (offer.disabled ? ' · 已售罄' : offer.maxUses > 0 ? ` · 剩余 ${stock}/${offer.maxUses}` : '');
    list.append(row);
  }
  body.append(list);
  if (!offers.length) cortiMenuText(body, 9, 21, '报价待同步', 'corti-trade-empty');
  if (Number.isFinite(container.trades?.level) && container.trades.regularVillager) {
    cortiMenuText(body, 108, 6, `村民等级 ${container.trades.level}`, 'corti-trade-level');
  }
}

function cortiRenderHorse(parent, container) {
  const body = cortiVanillaBackground(parent, 'horse');
  const slots = container.slots || [];
  cortiSlot(body, 8, 18, slots[0], '鞍');
  cortiSlot(body, 8, 36, slots[1], '马铠');
  for (let i = 2; i < Math.min(17, container.containerCount); i++) {
    cortiSlot(body, 80 + (i - 2) % 5 * 18, 18 + Math.floor((i - 2) / 5) * 18,
      slots[i], `坐骑储物 ${i - 1}`);
  }
  cortiPlayerRows(body, slots, container.inventoryStart, container.hotbarStart);
}

function cortiBookText(value, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return '';
  if (typeof value === 'string') {
    if (value.startsWith('{') || value.startsWith('[')) {
      try { return cortiBookText(JSON.parse(value), depth + 1); } catch {}
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((part) => cortiBookText(part, depth + 1)).join('');
  if (typeof value !== 'object') return '';
  if (typeof value.text === 'string') {
    return value.text + cortiBookText(value.extra, depth + 1);
  }
  if (value.raw !== undefined) return cortiBookText(value.raw, depth + 1);
  if (value.value !== undefined) return cortiBookText(value.value, depth + 1);
  return '';
}

function cortiBookPages(item) {
  const parts = Array.isArray(item?.components) ? item.components : [];
  const content = parts.find((part) => /^(?:written|writable)_book_content$/.test(part?.type))?.data;
  const nbtPages = item?.nbt?.value?.pages?.value?.value;
  const pages = content?.pages || nbtPages;
  return Array.isArray(pages) ? pages.slice(0, 100).map((page) => cortiBookText(page).slice(0, 2048)) : [];
}

function cortiRenderLectern(parent, container) {
  const card = document.createElement('article');
  card.className = 'corti-menu-book';
  const item = container.slots?.[0];
  const pages = cortiBookPages(item);
  const page = document.createElement('div');
  page.className = 'corti-menu-book-page';
  const footer = document.createElement('footer');
  const previous = document.createElement('button');
  const next = document.createElement('button');
  previous.type = next.type = 'button';
  previous.textContent = '‹';
  next.textContent = '›';
  let index = 0;
  const render = () => {
    page.textContent = pages[index] || (item ? item.displayName || item.name : '书本尚未同步');
    footer.textContent = '';
    previous.disabled = index === 0;
    next.disabled = index >= pages.length - 1;
    const number = document.createElement('span');
    number.textContent = pages.length ? `${index + 1}/${pages.length}` : '';
    footer.append(previous, number, next);
  };
  previous.addEventListener('click', () => { index--; render(); });
  next.addEventListener('click', () => { index++; render(); });
  render();
  card.append(page, footer);
  parent.append(card);
}

function cortiRenderGenericContainer(parent, container) {
  const body = document.createElement('div');
  body.className = 'corti-menu-generic';
  const slots = container.slots || [];
  const count = Math.max(0, Math.min(54, Number(container.containerCount) || 0));
  const sections = [
    { title: '容器', start: 0, count },
    { title: '背包', start: container.inventoryStart, count: 27 },
    { title: '快捷栏', start: container.hotbarStart, count: 9 },
  ];
  for (const section of sections) {
    const label = document.createElement('h3');
    label.className = 'corti-menu-section';
    label.textContent = section.title;
    body.append(label);
    const grid = document.createElement('div');
    grid.className = 'corti-menu-grid';
    for (let i = 0; i < section.count; i++) {
      const slot = cortiSlot(grid, 0, 0, slots?.[section.start + i], `${section.title} ${i + 1}`);
      slot.style.left = '';
      slot.style.top = '';
    }
    body.append(grid);
  }
  parent.append(body);
}

function cortiDrawMinimap() {
  const canvas = document.querySelector('#corti-minimap canvas');
  const data = cortiPanelMap;
  if (!canvas || !data) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const size = data.radius * 2 + 1;
  const tile = canvas.width / size;
  const position = cortiPanelAvatar?.entity?.pos || cortiPanelAvatar?.entity?.position;
  const centerX = Number.isFinite(position?.x) ? position.x : data.centerX + .5;
  const centerZ = Number.isFinite(position?.z) ? position.z : data.centerZ + .5;
  ctx.fillStyle = cortiTerrainColors['?'];
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const worldX = Math.floor(centerX) + x - data.radius;
    const worldZ = Math.floor(centerZ) + z - data.radius;
    const kind = cortiMapCells.get(`${worldX},${worldZ}`) || '?';
    ctx.fillStyle = cortiTerrainColors[kind] || cortiTerrainColors.X;
    ctx.fillRect((worldX - centerX + data.radius + .5) * tile,
      (worldZ - centerZ + data.radius + .5) * tile, Math.ceil(tile) + 1, Math.ceil(tile) + 1);
  }
  const marker = (x, z, color, radius) => {
    const px = (x - centerX + data.radius + .5) * tile;
    const pz = (z - centerZ + data.radius + .5) * tile;
    if (px < 0 || pz < 0 || px > canvas.width || pz > canvas.height) return;
    ctx.fillStyle = '#152d35';
    ctx.beginPath(); ctx.arc(px, pz, radius + 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(px, pz, radius, 0, Math.PI * 2); ctx.fill();
  };
  for (const entity of entityCache.values()) {
    if (!entity || entity.isSelf || entity.id === cortiPanelAvatar?.entity?.id) continue;
    const pos = entity.pos || entity.position;
    if (!pos) continue;
    marker(pos.x, pos.z, entity.name === 'player' ? '#85d8f9' : '#f6d380', 2.5);
  }
  if (position) {
    const px = canvas.width / 2;
    const pz = canvas.height / 2;
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-(Number(cortiPanelAvatar.entity.yaw) || 0));
    ctx.fillStyle = '#162c2d';
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 7); ctx.lineTo(0, 4); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#faf7dd';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#f7f5df';
  ctx.font = 'bold 12px system-ui';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#102029';
  ctx.shadowBlur = 4;
  ctx.fillText('N', canvas.width / 2, 13);
  ctx.shadowBlur = 0;
  const caption = document.querySelector('[data-map-caption]');
  if (caption) caption.textContent = `${data.dimension.replace(/^minecraft:/, '')} · ${Math.floor(position?.x ?? data.centerX)}, ${Math.floor(position?.z ?? data.centerZ)} · N↑`;
}

function cortiRenderMana() {
  const root = document.getElementById('corti-skills');
  if (!root) return;
  const mana = root.querySelector('[data-mana]');
  const status = root.querySelector('[data-skill-status]');
  const data = cortiPanelSkills;
  const hasMana = Number.isFinite(data?.mana?.current) && Number.isFinite(data?.mana?.max);
  // The server publishes state on changes rather than on every render tick.
  // A quiet ten seconds at full mana must not blank an otherwise valid reading.
  const stale = hasMana && Number.isFinite(data?.observedAt)
    && Date.now() - data.observedAt > 120_000;
  const value = hasMana ? `${Math.round(data.mana.current)}/${Math.round(data.mana.max)}` : '--/--';
  mana.textContent = `魔力 ${value}`;
  const vital = document.querySelector('[data-corti-mana-vital]');
  if (vital) {
    vital.querySelector('[data-corti-mana-label]').textContent = `✦ 魔力 ${value}`;
    vital.querySelector('[data-corti-mana-fill]').style.width = hasMana && data.mana.max > 0
      ? `${Math.max(0, Math.min(100, data.mana.current / data.mana.max * 100))}%` : '0%';
    vital.title = stale ? `上次同步 ${new Date(data.observedAt).toLocaleTimeString()}，等待服务端更新` : `魔力 ${value}`;
    vital.dataset.stale = String(stale);
  }
  const manaFill = root.querySelector('[data-mana-fill]');
  if (manaFill) manaFill.style.width = hasMana && data.mana.max > 0
    ? `${Math.max(0, Math.min(100, data.mana.current / data.mana.max * 100))}%` : '0%';
  status.textContent = stale ? `上次读数 ${value} · 等待服务端更新`
    : !data ? '暂无服务端技能数据' : data.source === 'chat'
      ? '最近魔力回执 · 技能列表未同步' : `${data.skills.length} 项技能 · ${data.abilities?.length || 0} 项能力`;
}

function cortiAbilityId(value) {
  return String(value || '').replace(/^.*:/, '').toLowerCase();
}

function cortiAbilityKey(value) {
  return String(value || '').toLowerCase();
}

function cortiUpdateAbilityIcons() {
  const mana = cortiPanelSkills?.mana?.current;
  for (const icon of document.querySelectorAll('#corti-skills .corti-ability')) {
    const id = icon.dataset.abilityId;
    const cost = icon.dataset.manaCost === '' ? NaN : Number(icon.dataset.manaCost);
    const cooldown = cortiAbilityCooldowns.get(id);
    const left = cooldown ? Math.max(0, cooldown.until - Date.now()) : 0;
    if (cooldown && !left) cortiAbilityCooldowns.delete(id);
    const needsMana = Number.isFinite(mana) && Number.isFinite(cost) && mana < cost;
    const cooldownReady = icon.dataset.cooldownStatus === 'ready';
    icon.dataset.state = left ? 'cooldown' : needsMana ? 'mana'
      : cooldownReady && Number.isFinite(mana) ? 'ready' : 'unknown';
    icon.style.setProperty('--corti-cooldown-angle',
      `${left && cooldown ? Math.max(0, Math.min(360, left / cooldown.duration * 360)) : 0}deg`);
    icon.querySelector('.corti-ability-overlay').textContent = left
      ? String(Math.ceil(left / 1000)) : needsMana ? '⊘' : icon.dataset.state === 'unknown' ? '?' : '';
    icon.title = `${icon.dataset.abilityName} · ${Number.isFinite(cost) ? `${cost} 魔力` : '魔力消耗未知'}`
      + (left ? ` · 冷却 ${Math.ceil(left / 1000)} 秒` : needsMana ? ' · 魔力不足'
        : icon.dataset.state === 'unknown' ? ' · 冷却状态待同步' : ' · 冷却结束')
      + (icon.dataset.pinned === 'true' ? ' · 点击取消固定' : ' · 点击固定到常用栏');
    icon.setAttribute('aria-label', icon.title);
  }
}

function cortiRenderSkills() {
  const root = document.getElementById('corti-skills');
  if (!root) return;
  cortiRenderMana();
  const list = root.querySelector('[data-skill-list]');
  const abilities = root.querySelector('[data-ability-list]');
  const data = cortiPanelSkills;
  const allAbilities = data?.abilities || [];
  const pins = cortiAbilityPins(allAbilities);
  const selectedCount = allAbilities.filter((ability) => pins.has(cortiAbilityKey(ability.id))).length;
  root.querySelector('[data-corti-ability-count]').textContent = `常用 ${selectedCount} / 全部 ${allAbilities.length}`;
  const toggle = root.querySelector('[data-corti-ability-toggle]');
  toggle.textContent = cortiShowAllAbilities ? '收起目录' : '选择技能';
  toggle.setAttribute('aria-expanded', String(cortiShowAllAbilities));
  list.replaceChildren();
  for (const skill of data?.skills || []) {
    const row = document.createElement('div');
    row.className = 'corti-skill';
    const name = document.createElement('span');
    name.textContent = `${skill.name} `;
    const level = document.createElement('strong');
    level.textContent = `Lv.${skill.level}`;
    row.append(name, level);
    if (Number.isFinite(skill.xp) && Number.isFinite(skill.requiredXp) && skill.requiredXp > 0) {
      const track = document.createElement('div');
      track.className = 'corti-skill-bar';
      const fill = document.createElement('span');
      fill.style.width = `${Math.max(0, Math.min(100, skill.xp / skill.requiredXp * 100))}%`;
      track.append(fill);
      row.append(track);
      row.title = `${skill.xp}/${skill.requiredXp} XP`;
    }
    list.append(row);
  }
  abilities.replaceChildren();
  for (const ability of allAbilities.filter((entry) =>
    cortiShowAllAbilities || pins.has(cortiAbilityKey(entry.id)))) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'corti-ability';
    const id = cortiAbilityId(ability.id);
    row.dataset.abilityId = cortiAbilityKey(ability.id);
    row.dataset.pinned = String(pins.has(row.dataset.abilityId));
    row.dataset.cooldownStatus = Number.isFinite(ability.cooldownRemainingMs)
      ? ability.cooldownRemainingMs === 0 ? 'ready' : 'running' : 'unknown';
    row.dataset.abilityName = ability.name;
    row.dataset.manaCost = Number.isFinite(ability.manaCost) ? String(ability.manaCost) : '';
    row.setAttribute('aria-label', ability.name);
    row.setAttribute('aria-pressed', row.dataset.pinned);
    row.addEventListener('click', () => cortiToggleAbilityPin(row.dataset.abilityId, allAbilities));
    const image = document.createElement('img');
    const icon = /^[a-z0-9_]+$/.test(ability.icon || '') ? ability.icon : cortiAbilityIcons[id] || 'enchanted_book';
    image.src = `/icons/${icon}.png`;
    image.alt = '';
    image.onerror = () => {
      if (!image.isConnected) return;
      image.replaceWith(Object.assign(document.createElement('span'),
        { className: 'corti-ability-glyph', textContent: ability.name.slice(0, 1) }));
    };
    const mask = document.createElement('span');
    mask.className = 'corti-ability-mask';
    const overlay = document.createElement('span');
    overlay.className = 'corti-ability-overlay';
    const name = document.createElement('span');
    name.className = 'corti-ability-name';
    name.textContent = ability.name;
    const pin = document.createElement('span');
    pin.className = 'corti-ability-pin';
    pin.textContent = row.dataset.pinned === 'true' ? '★' : '☆';
    row.append(image, mask, overlay, name, pin);
    abilities.append(row);
  }
  cortiUpdateAbilityIcons();
}

cortiInstallPanels(socket);
