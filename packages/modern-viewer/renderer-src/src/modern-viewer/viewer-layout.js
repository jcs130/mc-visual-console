import { OBS_COMPONENTS } from './obs-layout.js';

const KEY = 'minecraft.viewer.layout.v1';
const COMPONENTS = OBS_COMPONENTS.filter(row => !['hands', 'inventoryButton'].includes(row.id));
const DEFAULT_HIDDEN = new Set(['agentRoute', 'scoreboard']);
export function normalizeViewerLayout(value) {
  const source = value?.version === 1 ? value : {};
  return { version: 1, clean: source.clean === true, components: Object.fromEntries(COMPONENTS.map(({id}) =>
    [id, typeof source.components?.[id] === 'boolean' ? source.components[id] : !DEFAULT_HIDDEN.has(id)])) };
}

/** Presentation preferences never write game state, commands or hidden flags. */
export function installViewerLayout({document, window, photo = false, overlay = false} = {}) {
  if (photo || overlay) return {visible: () => true, dispose() {}};
  let storage, saved;
  try { storage = window.localStorage; saved = JSON.parse(storage.getItem(KEY)); } catch {}
  let layout = normalizeViewerLayout(saved), disposed = false;
  const roots = [], moved = new Map(), listeners = [];
  const make = (tag, className, parent, text) => {
    const el = document.createElement(tag); el.className = className;
    if (text) el.textContent = text; parent.append(el); return el;
  };
  const listen = (el, name, handler) => { el.addEventListener(name, handler); listeners.push([el, name, handler]); };
  const toolbar = make('header', 'viewer-toolbar', document.body); roots.push(toolbar);
  toolbar.setAttribute('aria-label', '画面工具栏');
  const views = make('div', 'viewer-toolbar-views', toolbar);
  const camera = make('div', 'viewer-toolbar-camera', toolbar);
  const tools = make('div', 'viewer-toolbar-tools', toolbar);
  const left = make('aside', 'viewer-rail viewer-rail-left', document.body); roots.push(left);
  const right = make('aside', 'viewer-rail viewer-rail-right', document.body); roots.push(right);
  const previousToolbarBottom=document.body.style.getPropertyValue?.('--viewer-toolbar-bottom')??'';
  let toolbarBottom=null;
  function measureToolbar(){
    const bottom=toolbar.getBoundingClientRect?.().bottom;
    if(!Number.isFinite(bottom)||toolbarBottom===Math.ceil(bottom))return;
    toolbarBottom=Math.ceil(bottom);document.body.style.setProperty?.('--viewer-toolbar-bottom',`${toolbarBottom}px`);
  }
  const toolbarObserver=window.ResizeObserver?new window.ResizeObserver(measureToolbar):null;
  toolbarObserver?.observe(toolbar);listen(window,'resize',measureToolbar);
  left.setAttribute('aria-label', '地图与操作信息'); right.setAttribute('aria-label', '技能与行动信息');
  const clean = make('button', '', tools, '简洁'); clean.type = 'button'; clean.title = '隐藏信息，保留画面工具栏（H）';
  const settings = make('details', 'viewer-display-settings', tools);
  const summary = make('summary', '', settings, '显示'); summary.setAttribute('aria-label', '显示设置');
  const panel = make('div', 'viewer-display-panel', settings);
  make('strong', '', panel, '画面信息');
  make('p', '', panel, '按需显示；设置会保存在当前浏览器。');
  const choices = make('div', 'viewer-display-choices', panel), checks = new Map();
  for (const {id, label} of COMPONENTS) {
    const row = make('label', '', choices), input = make('input', '', row); input.type = 'checkbox';
    input.setAttribute('aria-label', `显示${label}`); input.dataset.viewerComponent = id;
    make('span', '', row, id === 'agentPointer' ? '虚拟指针与点击反馈' : label);
    checks.set(id, input);
    listen(input, 'change', () => { layout.components[id] = input.checked; apply(); });
  }
  const footer = make('div', 'viewer-display-actions', panel);
  const reset = make('button', '', footer, '恢复默认'); reset.type = 'button';
  listen(reset, 'click', () => { layout = normalizeViewerLayout(null); apply(); });
  const firstView = document.querySelector('.corti-view-switch a');
  const base = firstView?.getAttribute('href')?.split('?')[0] || '/';
  for (const [href, text] of [[`${base}?obs=1`, 'OBS 覆盖'], [`${base}?obs=1&obsEdit=1`, 'OBS 布局']]) {
    const a = make('a', '', footer, text); a.href = href;
  }
  const style = make('style', '', document.head); roots.push(style);
  const nonce = document.querySelector('meta[name="viewer-style-nonce"]')?.content;
  if (nonce) style.nonce = nonce;
  function apply() {
    document.body.dataset.viewerLayout = 'docked'; document.body.dataset.viewerClean = String(layout.clean);
    clean.setAttribute('aria-pressed', String(layout.clean)); clean.textContent = layout.clean ? '显示信息' : '简洁';
    for (const [id, input] of checks) input.checked = layout.components[id];
    style.textContent = COMPONENTS.filter(({id}) => layout.clean || !layout.components[id])
      .map(({selector}) => `${selector}{display:none!important}`).join('\n');
    try { storage?.setItem(KEY, JSON.stringify(layout)); } catch {}
  }
  function move(el, parent) {
    if (!el || el.parentNode === parent) return;
    if (!moved.has(el)) moved.set(el, el.parentNode);
    parent.append(el);
  }
  function adopt() {
    if (disposed) return;
    move(document.querySelector('.corti-view-switch'), views);
    move(document.querySelector('.dungeon-camera-controls'), camera);
    move(document.querySelector('.viewer-camera-settings'), camera);
    for (const selector of ['.corti-chat', '.native-agent-status', '.native-console-diagnostics', '.native-target-panel', '#corti-inventory-toggle', '#corti-night-vision-toggle',
        '#corti-sound-toggle', '#corti-music-toggle', '.viewer-audio-controls', '.viewer-quality-settings', '.viewer-appearance-settings', '.viewer-play-controls', '.viewer-agent-views']) move(document.querySelector(selector), tools);
    // Re-append the persistent controls after late-created chat/camera modules.
    if (tools.lastElementChild !== settings) { tools.append(clean, settings); }
    // Inputs and transient messages have independent viewport anchors. A live
    // chat row must never reflow the input panel or scroll it with the rail.
    for (const id of ['corti-minimap', 'native-terrain-map', 'corti-scoreboard', 'corti-effects', 'corti-content-status', 'corti-held-map']) move(document.getElementById(id), left);
    for (const id of ['corti-skills', 'agent-intent', 'agent-route-map', 'agent-presentation', 'native-live-inspector']) move(document.getElementById(id), right);
    measureToolbar();
  }
  listen(clean, 'click', () => { layout.clean = !layout.clean; apply(); });
  listen(window, 'keydown', e => {
    if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || e.target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) return;
    if (e.code === 'KeyH') { layout.clean = !layout.clean; apply(); }
    if (e.code === 'Escape') settings.open = false;
  });
  listen(document, 'pointerdown', e => { if (settings.open && !settings.contains(e.target)) settings.open = false; });
  const observer = new window.MutationObserver(adopt); observer.observe(document.body, {childList: true});
  function dispose() {
    if (disposed) return; disposed = true; observer.disconnect();toolbarObserver?.disconnect();
    if(previousToolbarBottom)document.body.style.setProperty?.('--viewer-toolbar-bottom',previousToolbarBottom);
    else document.body.style.removeProperty?.('--viewer-toolbar-bottom');
    for (const [el, name, handler] of listeners) el.removeEventListener(name, handler);
    for (const [el, parent] of moved) if (parent?.isConnected) parent.append(el);
    for (const root of roots) root.remove(); delete document.body.dataset.viewerLayout; delete document.body.dataset.viewerClean;
    window.removeEventListener('pagehide', dispose);
  }
  window.addEventListener('pagehide', dispose, {once: true});
  apply(); adopt();
  return {visible: id => !layout.clean && layout.components[id] !== false, snapshot: () => normalizeViewerLayout(layout), adopt, dispose};
}
