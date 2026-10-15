// This panel selects a presentation only. Adapters own available original
// resources, identity binding and loading; there is deliberately no transport.
export function installAppearanceSettings({ document, window, onChange, hidden = false, parent } = {}) {
  if (hidden) return { update() {}, dispose() {} };
  const root = document.createElement('details');
  root.className = 'viewer-scene-settings viewer-appearance-settings';
  root.setAttribute('aria-label', '人物模型设置');
  const make = (tag, host, text) => { const el = document.createElement(tag); if (text) el.textContent = text; host.append(el); return el; };
  const summary = make('summary', root, '人物模型');
  const panel = make('div', root); panel.className = 'viewer-scene-panel';
  const subject = make('strong', panel);
  const label = make('label', panel, '模型与配色'), select = make('select', label);
  select.setAttribute('aria-label', '人物模型与配色');
  const restore = make('button', panel, '恢复服务器外观'); restore.type = 'button';
  make('small', panel, '只影响观战外观，不修改服务器外观。原生页面按玩家保留选择，可随时恢复跟随服务器。');
  const status = make('output', panel); status.setAttribute('aria-live', 'polite');
  const compatibility=make('small',panel);compatibility.hidden=true;
  let snapshot = null, signature = '', disposed = false;
  const choose = id => {
    if (disposed || !snapshot?.available || !snapshot.choices.some(row => row.id === id)) return;
    try { onChange?.(id); } catch (error) { status.textContent = `模型选择失败：${error.message}`; }
  };
  const change = () => choose(select.value), reset = () => choose('server');
  const close = event => { if (event.code === 'Escape') root.open = false; };
  const place = () => {
    if (!root.open || typeof summary.getBoundingClientRect !== 'function') return;
    const top = Math.max(12, Math.min(summary.getBoundingClientRect().bottom + 8, window.innerHeight - 120));
    panel.style.setProperty('--appearance-panel-top', `${top}px`);
  };
  select.addEventListener('change', change); restore.addEventListener('click', reset); window.addEventListener('keydown', close);
  root.addEventListener('toggle', place); window.addEventListener('resize', place);
  (parent ?? document.querySelector('.viewer-toolbar-tools') ?? document.body).append(root);
  function update(value) {
    if (disposed) return;
    snapshot = value ?? { choices: [{ id: 'server', label: '跟随服务器' }], selected: 'server', available: false, status: '等待当前观战玩家' };
    const next = JSON.stringify(snapshot.choices);
    if (next !== signature) {
      select.replaceChildren();
      for (const row of snapshot.choices) make('option', select, row.label).value = row.id;
      signature = next;
    }
    select.value = snapshot.selected; select.disabled = !snapshot.available;
    restore.disabled = !snapshot.available || snapshot.selected === 'server';
    subject.textContent = snapshot.subject || '当前观战人物';
    status.textContent = snapshot.status || (snapshot.selected === 'server' ? '跟随服务器外观' : 'Web 外观替换');
    const issues=snapshot.animationIssues??[];
    compatibility.hidden=!issues.length;
    const names={'query.vertical_speed':'垂直速度','query.health':'生命值','query.max_health':'生命上限'};
    compatibility.textContent=issues.length?'本次加载遇到的动作限制：'+issues.map(issue=>issue.startsWith('YSM_MOLANG_INPUT_UNAVAILABLE:')?'缺少'+(names[issue.split(':')[1]]??issue.split(':')[1]):issue).join('；'):'';
    summary.textContent=issues.length?'人物模型 · 兼容提示':'人物模型';
    root.dataset.appearanceSource = snapshot.selected === 'server' ? 'server' : 'web';
    root.dataset.appearanceSelection = snapshot.selected;
    place();
  }
  function dispose() {
    if (disposed) return; disposed = true;
    select.removeEventListener('change', change); restore.removeEventListener('click', reset); window.removeEventListener('keydown', close);
    root.removeEventListener('toggle', place); window.removeEventListener('resize', place);
    window.removeEventListener('pagehide', dispose); root.remove();
  }
  window.addEventListener('pagehide', dispose, { once: true }); update(null);
  return { update, dispose };
}
