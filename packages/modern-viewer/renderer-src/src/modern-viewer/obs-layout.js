export const OBS_COMPONENTS = Object.freeze([
  ['hands', '第一人称手和物品', '#viewer-canvas'],
  ['survival', '血量、魔力和快捷物品栏', '#corti-survival'],
  ['minimap', '小地图', '#corti-minimap'],
  ['skills', '技能面板', '#corti-skills'],
  ['chat', '聊天记录', '.corti-chat'],
  ['inventory', '背包和交易界面', '#corti-menu'],
  ['inventoryButton', '背包按钮', '#corti-inventory-toggle'],
  ['effects', '状态效果', '#corti-effects'],
  ['boss', 'Boss 血条', '#corti-boss-bars'],
  ['scoreboard', '计分板', '#corti-scoreboard'],
  ['messages', '游戏消息', '#corti-event-feed'],
  ['actionbar', '行动提示', '#corti-actionbar'],
  ['title', '标题提示', '#corti-game-title'],
  ['cast', '施法提示', '#corti-cast, #skill-cue'],
  ['toasts', '事件提示', '#corti-presentation-toasts, #viewer-fishing-catch'],
  ['speech', '语音气泡', '#corti-speech-bubble'],
  ['combat', '战斗数字', '#corti-combat-floats'],
  ['fire', '着火效果', '.corti-self-fire'],
  ['mapPhoto', '手持地图和照片', '#corti-held-map'],
  ['crosshair', '准星', '.corti-crosshair'],
].map(([id, label, selector]) => Object.freeze({ id, label, selector })));
const bounded = (v, min, max, fallback) => Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
export function normalizeObsLayout(value) {
  const source = value?.version === 1 && value.components && typeof value.components === 'object' ? value.components : {};
  return { version: 1, components: Object.fromEntries(OBS_COMPONENTS.map(({ id }) => {
    const row = source[id];
    return [id, { visible: typeof row?.visible === 'boolean' ? row.visible : id !== 'crosshair',
      x: bounded(row?.x, -100, 100, 0), y: bounded(row?.y, -100, 100, 0), scale: bounded(row?.scale, .3, 3, 1) }];
  })) };
}
export function readObsLayout({ query, storage }) {
  try {
    const encoded = query.get('obsLayout');
    if (encoded && encoded.length <= 8192) return normalizeObsLayout(JSON.parse(encoded));
  } catch { /* Malformed shared links cannot prevent the HUD from opening. */ }
  try { return normalizeObsLayout(JSON.parse(storage?.getItem('minecraft.viewer.obsLayout.v1') || 'null')); }
  catch { return normalizeObsLayout(null); }
}
export function obsLayoutUrl(url, layout) {
  const target = new URL(url);
  target.pathname = '/'; target.hash = '';
  target.searchParams.delete('obsEdit'); target.searchParams.delete('photo');
  target.searchParams.set('obs', '1');
  const normalized = normalizeObsLayout(layout), defaults = normalizeObsLayout(null);
  // Keep copied OBS URLs short; unspecified components use versioned defaults.
  const components = Object.fromEntries(Object.entries(normalized.components)
    .filter(([id, row]) => JSON.stringify(row) !== JSON.stringify(defaults.components[id])));
  target.searchParams.set('obsLayout', JSON.stringify({ version: 1, components }));
  return target.href;
}
export function moveObsComponent(row, dx, dy, viewport) {
  return { ...row, x: bounded(row.x + dx * 100 / Math.max(1, viewport.width), -100, 100, 0),
    y: bounded(row.y + dy * 100 / Math.max(1, viewport.height), -100, 100, 0) };
}

/** Local presentation only. No control packets, inventory clicks, game commands
 * or changes to the original `hidden` attributes are made by this editor. */
export function installObsLayout({ document, window, query = new URLSearchParams(window.location.search) }) {
  let storage; try { storage = window.localStorage; } catch {}
  let layout = readObsLayout({ query, storage }), editing = false, selected = 'hands', drag = null, disposed = false;
  const style = document.createElement('style'); style.dataset.obsLayoutStyle = 'true'; document.head.append(style);
  const panel = document.createElement('section'); panel.className = 'obs-layout-editor'; panel.hidden = true;
  panel.setAttribute('aria-label', 'OBS 布局设置');
  const make = (tag, text, parent = panel) => { const el = document.createElement(tag); if (text) el.textContent = text; parent.append(el); return el; };
  const header = make('header'); make('strong', 'OBS 布局设置', header);
  const done = make('button', '完成', header); done.type = 'button';
  make('p', '选择组件后拖动蓝色名称移动，拖动右下角调整大小。设置自动保存在本浏览器。');
  const list = make('div'); list.className = 'obs-layout-list';
  const checks = new Map(), selectors = new Map();
  for (const { id, label } of OBS_COMPONENTS) {
    const row = make('div', '', list), check = make('input', '', row); check.type = 'checkbox'; check.setAttribute('aria-label', `显示${label}`);
    const button = make('button', label, row); button.type = 'button'; button.dataset.obsSelect = id;
    check.addEventListener('change', () => change(id, { visible: check.checked }));
    button.addEventListener('click', () => { selected = id; syncPanel(); });
    checks.set(id, check); selectors.set(id, button);
  }
  const fields = new Map();
  for (const [key, label, min, max, step] of [['scale', '大小（倍）', .3, 3, .05], ['x', '横向偏移（%）', -100, 100, .1], ['y', '纵向偏移（%）', -100, 100, .1]]) {
    const row = make('label', label), input = make('input', '', row); input.type = 'number';
    input.min = min; input.max = max; input.step = step; input.dataset.obsField = key;
    input.addEventListener('input', () => { if (input.value !== '') change(selected, { [key]: Number(input.value) }, false); });
    input.addEventListener('change', syncPanel); fields.set(key, input);
  }
  const actions = make('div'); actions.className = 'obs-layout-actions';
  const resetOne = make('button', '复位此项', actions), resetAll = make('button', '恢复默认', actions), copy = make('button', '复制布局链接', actions);
  for (const button of [resetOne, resetAll, copy]) button.type = 'button';
  const output = make('textarea'); output.readOnly = true; output.hidden = true; output.setAttribute('aria-label', 'OBS 布局链接');
  const notice = make('output'); notice.setAttribute('aria-live', 'polite');
  const box = document.createElement('div'); box.className = 'obs-layout-selection'; box.hidden = true;
  const caption = make('span', '', box), handle = make('button', '↘', box); handle.type = 'button'; handle.className = 'obs-layout-resize'; handle.setAttribute('aria-label', '拖动调整组件大小');
  document.body.append(panel, box);
  function apply() {
    // Rules apply to late mounted chat/photo/effect elements too. Visibility is
    // independent of server-driven hidden/expiry state (no resurrected windows).
    style.textContent = OBS_COMPONENTS.map(({ id, selector }) => selector.split(',').map(s => {
      const row = layout.components[id];
      return `body[data-obs-overlay=true] ${s.trim()}{${row.visible ? '' : 'display:none!important;'}translate:${row.x}vw ${row.y}vh;scale:${row.scale};}`;
    }).join('\n')).join('\n');
  }
  function save() {
    try { storage?.setItem('minecraft.viewer.obsLayout.v1', JSON.stringify(layout)); notice.textContent = '已保存 · 按 F8 可重新设置'; }
    catch { notice.textContent = '浏览器不允许保存；请复制布局链接到 OBS。'; }
  }
  function change(id, patch, sync = true) {
    layout = normalizeObsLayout({ version: 1, components: { ...layout.components, [id]: { ...layout.components[id], ...patch } } });
    apply(); save(); if (sync) syncPanel();
  }
  function syncPanel() {
    for (const { id } of OBS_COMPONENTS) { checks.get(id).checked = layout.components[id].visible; selectors.get(id).setAttribute('aria-pressed', String(id === selected)); }
    for (const [key, field] of fields) field.value = String(Math.round(layout.components[selected][key] * 100) / 100);
    positionBox();
  }
  function positionBox() {
    const definition = OBS_COMPONENTS.find(row => row.id === selected);
    const rects = [...document.querySelectorAll(definition.selector)].filter(el => !el.hidden && el.getClientRects().length && window.getComputedStyle(el).display !== 'none').map(el => el.getBoundingClientRect());
    const visible = editing && layout.components[selected].visible && rects.length > 0;
    box.hidden = !visible;
    if (!visible) return;
    const left = Math.min(...rects.map(r => r.left)), top = Math.min(...rects.map(r => r.top));
    const right = Math.max(...rects.map(r => r.right)), bottom = Math.max(...rects.map(r => r.bottom));
    const x = Math.max(2, Math.min(window.innerWidth - 38, left)), y = Math.max(2, Math.min(window.innerHeight - 38, top));
    Object.assign(box.style, { left: `${x}px`, top: `${y}px`, width: `${Math.max(32, Math.min(window.innerWidth - x - 2, right - left))}px`, height: `${Math.max(32, Math.min(window.innerHeight - y - 2, bottom - top))}px` });
    caption.textContent = definition.label;
  }
  function edit(value) { editing = value; panel.hidden = !value; document.body.dataset.obsEditing = String(value); drag = null; syncPanel(); }
  done.addEventListener('click', () => edit(false));
  resetOne.addEventListener('click', () => change(selected, normalizeObsLayout(null).components[selected]));
  resetAll.addEventListener('click', () => { layout = normalizeObsLayout(null); apply(); save(); syncPanel(); });
  copy.addEventListener('click', async () => {
    const url = obsLayoutUrl(window.location.href, layout); output.hidden = false; output.value = url; output.select();
    try { await window.navigator.clipboard.writeText(url); notice.textContent = '链接已复制；在 OBS 浏览器来源粘贴此链接。'; }
    catch { notice.textContent = '请复制上面的链接到 OBS 浏览器来源。'; }
  });
  const key = event => { if (event.code === 'F8') { event.preventDefault(); edit(!editing); } else if (event.code === 'Escape' && editing) edit(false); };
  window.addEventListener('keydown', key);
  box.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); box.setPointerCapture(event.pointerId);
    drag = { id: selected, pointerId: event.pointerId, x: event.clientX, y: event.clientY, row: { ...layout.components[selected] }, resize: event.target === handle,
      width: Math.max(60, box.getBoundingClientRect().width), height: Math.max(60, box.getBoundingClientRect().height) };
  });
  box.addEventListener('pointermove', event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    const rx = dx / drag.width, ry = dy / drag.height;
    change(drag.id, drag.resize ? { scale: drag.row.scale * (1 + (Math.abs(rx) > Math.abs(ry) ? rx : ry)) }
      : moveObsComponent(drag.row, dx, dy, { width: window.innerWidth, height: window.innerHeight }));
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) box.addEventListener(event, () => { drag = null; });
  const blur = () => { drag = null; }; window.addEventListener('blur', blur);
  const timer = window.setInterval(() => { if (editing && !drag) positionBox(); }, 250);
  apply(); edit(query.get('obsEdit') === '1');
  const dispose = () => { if (disposed) return; disposed = true; window.clearInterval(timer); window.removeEventListener('keydown', key); window.removeEventListener('blur', blur); style.remove(); panel.remove(); box.remove(); };
  window.addEventListener('pagehide', dispose, { once: true });
  return { visible: id => layout.components[id]?.visible !== false, edit, snapshot: () => normalizeObsLayout(layout), dispose };
}
