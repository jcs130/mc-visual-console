import { normalizeSceneSettings, SCENE_SETTINGS_KEY } from './scene-quality.js';

export function installSceneSettings({ document, window, settings, onChange, hidden = false }) {
  if (hidden) return { status() {}, dispose() {} };
  let current = normalizeSceneSettings(settings), disposed = false;
  const root = document.createElement('details'); root.className = 'viewer-scene-settings viewer-quality-settings';
  root.setAttribute('aria-label', '画质与特效设置');
  const make = (tag, parent, text) => { const el = document.createElement(tag); if (text) el.textContent = text; parent.append(el); return el; };
  make('summary', root, '画质与特效');
  const panel = make('div', root); panel.className = 'viewer-scene-panel';
  const listeners = [];
  for (const [key, title, options] of [
    ['quality', '画质', [['auto','自动'],['high','精细'],['balanced','均衡'],['performance','省电']]],
    ['style', '画面风格', [['native','原色'],['soft','柔和'],['cinematic','电影']]],
    ['avatarSampling', '人物贴图', [['auto','自动（清晰原色）'],['original','原始像素'],['smooth','远景抗闪烁']]],
  ]) {
    const label = make('label', panel, title), select = make('select', label);
    select.setAttribute('aria-label', title); select.dataset.sceneSetting = key;
    for (const [value, text] of options) make('option', select, text).value = value;
    select.value = current[key];
    const change = () => { current = normalizeSceneSettings({ ...current, [key]: select.value }); publish(); };
    select.addEventListener('change', change); listeners.push([select, 'change', change]);
  }
  for (const [key, title] of [
    ['particles', '粒子与受击特效'], ['effectCues', '声音波纹、光环与技能提示'],
    ['weather', '雨雪画面'], ['shadows', '动态人物阴影'], ['occlusion', '自动剔除遮挡区域'],
  ]) {
    const label = make('label', panel, title), checkbox = make('input', label);
    checkbox.type = 'checkbox'; checkbox.checked = current[key]; checkbox.dataset.sceneSetting = key;
    checkbox.setAttribute('aria-label', title);
    const toggle = () => { current = normalizeSceneSettings({ ...current, [key]: checkbox.checked }); publish(); };
    checkbox.addEventListener('change', toggle); listeners.push([checkbox, 'change', toggle]);
  }
  make('small', panel, '关闭特效立即清理画面并停止生成；生命值、状态图标和游戏行为不变。声音仍由音效开关控制。阴影还需电影风格与精细档；设置自动保存在当前浏览器。');
  const status = make('output', panel); status.setAttribute('aria-live', 'polite');
  const close = e => { if (e.code === 'Escape') root.open = false; };
  window.addEventListener('keydown', close); listeners.push([window, 'keydown', close]);
  function publish() {
    try { window.localStorage?.setItem(SCENE_SETTINGS_KEY, JSON.stringify(current)); } catch {}
    onChange?.(current);
  }
  function dispose() {
    if (disposed) return; disposed = true;
    for (const [el, name, fn] of listeners) el.removeEventListener(name, fn);
    window.removeEventListener('pagehide', dispose); root.remove();
  }
  document.body.append(root); window.addEventListener('pagehide', dispose, { once: true });
  return { status(text) { if (status.textContent !== text) status.textContent = text; }, dispose };
}
