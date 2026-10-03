/** Minecraft 1.20.6 survival HUD rendered from the current Mineflayer avatar stream. */
let cortiHudSignature = '';
let cortiHudPoisoned = false;

function cortiSetHudPoisoned(poisoned) {
  const next = poisoned === true;
  if (next === cortiHudPoisoned) return;
  cortiHudPoisoned = next;
  if (typeof pendingAvatarState !== 'undefined') renderCortiSurvivalHud(pendingAvatarState);
}

function renderCortiSurvivalHud(state) {
  const root = document.getElementById('corti-survival');
  if (!root || !state) return;
  const number = (value, fallback = 0) => Number.isFinite(value) ? Number(value) : fallback;
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const slots = Array.isArray(state.hotbar) ? state.hotbar : [];
  const offhand = state.offhand ?? state.equipment?.[1];
  const signature = [state.health, state.maxHealth, state.absorption, state.food, state.armor, state.oxygen,
    state.inWater, state.experienceLevel, state.experienceProgress, state.quickBarSlot, cortiHudPoisoned,
    `${offhand?.name ?? ''}:${offhand?.customName ?? ''}:${offhand?.enchanted === true}:${offhand?.durability?.left ?? ''}`,
    ...slots.map((row) => `${row?.item?.name ?? ''}:${row?.item?.count ?? ''}:${row?.item?.customName ?? ''}:${row?.item?.headTextureHash ?? ''}:${row?.item?.enchanted === true}:${row?.item?.durability?.left ?? ''}:${row?.item?.durability?.max ?? ''}`)].join('|');
  if (signature === cortiHudSignature) return;
  cortiHudSignature = signature;

  const sprite = (name) => `/textures/gui/sprites/hud/${name}.png`;
  const icons = (target, count, value, full, half, empty) => {
    const parent = root.querySelector(target);
    if (!parent) return;
    const needed = Math.max(0, Math.min(target === '[data-corti-hearts]' ? 80 : 20, count));
    while (parent.children.length < needed) parent.append(document.createElement('span'));
    while (parent.children.length > needed) parent.lastElementChild.remove();
    for (let i = 0; i < needed; i += 1) {
      const icon = parent.children[i];
      icon.className = 'corti-icon';
      const amount = value - i * 2;
      const overlay = amount >= 2 ? full : amount > 0 ? half : '';
      icon.style.backgroundImage = overlay
        ? `url("${sprite(overlay)}"),url("${sprite(empty)}")`
        : `url("${sprite(empty)}")`;
    }
  };

  const health = clamp(number(state.health), 0, 80);
  const maxHealth = clamp(number(state.maxHealth, 20), 1, 80);
  const absorption = clamp(number(state.absorption), 0, 80);
  const food = clamp(number(state.food, 20), 0, 20);
  const armor = clamp(number(state.armor), 0, 20);
  const oxygen = clamp(number(state.oxygen, 20), 0, 20);
  const baseHearts = Math.ceil(maxHealth / 2);
  const goldenHearts = Math.ceil(absorption / 2);
  icons('[data-corti-hearts]', baseHearts + goldenHearts, health,
    cortiHudPoisoned ? 'heart/poisoned_full' : 'heart/full',
    cortiHudPoisoned ? 'heart/poisoned_half' : 'heart/half', 'heart/container');
  const hearts = root.querySelector('[data-corti-hearts]');
  const heartRows = Math.max(1, Math.ceil(hearts.children.length / 10));
  hearts.style.display = 'grid';
  hearts.style.gridTemplateColumns = 'repeat(10, 16px)';
  hearts.style.gridAutoRows = '18px';
  hearts.style.width = '160px';
  hearts.style.height = `${heartRows * 18}px`;
  for (let i = 0; i < hearts.children.length; i += 1) {
    hearts.children[i].style.gridColumn = String(i % 10 + 1);
    hearts.children[i].style.gridRow = String(heartRows - Math.floor(i / 10));
  }
  const vitals = root.querySelector('.corti-vitals');
  const hasAir = state.inWater && oxygen < 20;
  if (vitals) {
    vitals.classList.toggle('corti-has-air', hasAir);
    vitals.style.height = `${Math.max(hasAir ? 54 : 36, heartRows * 18 + 2)}px`;
  }
  const foodIcons = root.querySelector('[data-corti-food]');
  if (foodIcons) foodIcons.style.alignSelf = 'flex-end';
  for (let i = baseHearts; i < hearts.children.length; i += 1) {
    const amount = absorption - (i - baseHearts) * 2;
    const gold = amount >= 2 ? 'heart/absorbing_full' : 'heart/absorbing_half';
    hearts.children[i].style.backgroundImage =
      `url("${sprite(gold)}"),url("${sprite('heart/container')}")`;
  }
  icons('[data-corti-food]', 10, food, 'food_full', 'food_half', 'food_empty');
  icons('[data-corti-armor]', armor > 0 ? 10 : 0, armor,
    'armor_full', 'armor_half', 'armor_empty');
  icons('[data-corti-air]', state.inWater && oxygen < 20 ? 10 : 0,
    oxygen, 'air', 'air', 'air_bursting');
  hearts.title = `血量 ${health}/${maxHealth}${absorption > 0 ? ` · 吸收生命 ${absorption}` : ''}`
    + `${cortiHudPoisoned ? ' · 中毒' : ''}`;
  root.querySelector('[data-corti-food]').title = `饥饿值 ${food}/20`;
  root.querySelector('[data-corti-armor]').title = `护甲 ${armor}/20`;
  const level = root.querySelector('[data-corti-level]');
  level.textContent = number(state.experienceLevel) > 0 ? String(Math.floor(state.experienceLevel)) : '';
  level.title = `等级 ${number(state.experienceLevel)}`;
  root.querySelector('[data-corti-xp]').style.width = `${Math.round(clamp(number(state.experienceProgress), 0, 1) * 364)}px`;

  const selection = root.querySelector('[data-corti-selection]');
  selection.style.left = `${4 + clamp(Math.floor(number(state.quickBarSlot)), 0, 8) * 40}px`;
  const offhandSlot = root.querySelector('[data-corti-offhand]');
  if (offhandSlot) {
    const name = typeof offhand?.name === 'string' ? offhand.name.replace(/^minecraft:/, '') : '';
    const safe = /^[a-z0-9_]+$/.test(name) ? name : '';
    offhandSlot.replaceChildren();
    offhandSlot.classList.toggle('corti-enchanted', offhand?.enchanted === true);
    const durability = cortiDurability(offhand);
    offhandSlot.title = offhand ? `副手：${offhand.displayName || name}${durability ? ` · 耐久 ${durability.left}/${durability.max}` : ''}` : '副手：空';
    if (safe) {
      const image = document.createElement('img');
      image.alt = '';
      image.src = `/icons/${safe}.png`;
      image.onerror = () => {
        if (image.isConnected) image.remove();
      };
      offhandSlot.append(image);
    }
    if (offhand) {
      cortiAppendEnchantmentGlint(offhandSlot, offhand, 4);
      cortiAppendDurability(offhandSlot, offhand);
    }
  }
  const bar = root.querySelector('[data-corti-slots]');
  while (bar.children.length < 9) {
    const slot = document.createElement('div');
    slot.className = 'corti-slot';
    bar.append(slot);
  }
  for (let i = 0; i < 9; i += 1) {
    const slot = bar.children[i];
    const item = slots[i]?.item;
    const name = typeof item?.name === 'string' ? item.name.replace(/^minecraft:/, '') : '';
    const safe = /^[a-z0-9_]+$/.test(name) ? name : '';
    const identity = `${name}:${item?.count ?? ''}:${item?.customName ?? ''}:${item?.headTextureHash ?? ''}:${item?.enchanted === true}:${item?.durability?.left ?? ''}:${item?.durability?.max ?? ''}`;
    slot.classList.toggle('corti-enchanted', item?.enchanted === true);
    if (slot.dataset.identity === identity) continue;
    slot.dataset.identity = identity;
    slot.replaceChildren();
    const durability = cortiDurability(item);
    slot.title = item ? `${item.displayName || name} × ${item.count || 1}${item.enchanted === true ? ' · 附魔' : ''}${durability ? ` · 耐久 ${durability.left}/${durability.max}` : ''}` : `快捷栏 ${i + 1}`;
    if (!item) continue;
    if (safe) {
      const image = document.createElement('img');
      image.alt = '';
      image.src = `/icons/${safe}.png`;
      image.onerror = () => {
        if (!image.isConnected) return;
        image.remove();
        const fallback = document.createElement('span');
        fallback.className = 'corti-item-fallback';
        fallback.textContent = String(item.displayName || name).slice(0, 2);
        slot.prepend(fallback);
      };
      slot.append(image);
    } else {
      const fallback = document.createElement('span');
      fallback.className = 'corti-item-fallback';
      fallback.textContent = String(item.displayName || name).slice(0, 2);
      slot.append(fallback);
    }
    cortiAppendHeadFace(slot, item, 4);
    cortiAppendEnchantmentGlint(slot, item, 4);
    cortiAppendDurability(slot, item);
    if (number(item.count, 1) > 1) {
      const count = document.createElement('span');
      count.className = 'corti-slot-count';
      count.textContent = String(item.count);
      slot.append(count);
    }
  }
}
