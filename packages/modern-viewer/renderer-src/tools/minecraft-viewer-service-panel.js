/** Read-only host documents. Optional presets adapt received messages without issuing game actions. */
(function installViewerDocuments() {
  const style = document.createElement('style');
  style.textContent = `.mc-viewer-document{position:fixed;z-index:8;top:76px;right:14px;width:min(410px,calc(100vw - 28px));max-height:calc(100vh - 190px);overflow:auto;box-sizing:border-box;padding:12px;color:#f5f2df;background:#172832ed;border:1px solid #c5c9a5b3;border-radius:10px;box-shadow:0 8px 30px #0008;font:13px/1.45 system-ui}.mc-viewer-document[hidden]{display:none}.mc-viewer-document header{display:flex;gap:10px;align-items:center}.mc-viewer-document header strong{flex:1;min-width:0;font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mc-viewer-document button{border:1px solid #c5c9a577;border-radius:5px;background:#ffffff0e;color:#fff2c7;padding:3px 8px;cursor:pointer;font:12px system-ui}.mc-viewer-document-subtitle{color:#c4d0c7;margin:4px 0 8px}.mc-viewer-document-section{margin-top:10px}.mc-viewer-document-section h3{margin:0 0 4px;color:#dbc884;font-size:12px}.mc-viewer-document-row{padding:8px;border:1px solid #bcc8b32b;border-radius:6px;background:#ffffff05;margin:5px 0}.mc-viewer-document-row strong{font-size:14px}.mc-viewer-document-row p{margin:3px 0;color:#e1e6dc;overflow-wrap:anywhere}.mc-viewer-document-row small{color:#a9d9cf}.mc-viewer-document-status{float:right;max-width:48%;margin-left:6px;color:#ffde95;font:11px/1.5 system-ui}.mc-viewer-document-summary{padding:9px;background:#c2deaa12;border-left:3px solid #a4d692;border-radius:4px;margin:8px 0}.mc-viewer-document-summary strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mc-viewer-document-summary p{margin:3px 0;color:#dcebd6}.mc-viewer-document footer{margin-top:8px;color:#aebbc3;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mc-viewer-document[data-compact="true"]{width:min(290px,calc(100vw - 28px));max-height:min(170px,24vh);overflow:hidden;background:#172832dc}.mc-viewer-document[data-compact="true"] header strong{font-size:13px}.mc-viewer-document[data-compact="true"] .mc-viewer-document-section,.mc-viewer-document[data-compact="true"] .mc-viewer-document-subtitle{display:none}.mc-viewer-document[data-compact="true"] .mc-viewer-document-summary{margin-bottom:0;padding:5px 8px}.mc-viewer-document[data-compact="true"] .mc-viewer-document-summary p{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}.mc-viewer-document[data-compact="true"] .mc-viewer-document-summary small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mc-viewer-document[data-combat="true"]{opacity:.78;pointer-events:none}@media(max-width:800px){.mc-viewer-document{top:98px;right:8px;width:min(410px,calc(100vw - 16px));max-height:52vh;padding:8px;font-size:11px}.mc-viewer-document header strong{font-size:14px}.mc-viewer-document[data-compact="true"]{width:min(290px,calc(100vw - 16px))}.mc-viewer-document-row strong{font-size:12px}}`;
  style.textContent += 'body.mc-viewer-document-expanded #corti-skills{display:none}';
  document.head.append(style);
  const root = document.createElement('aside');
  root.id = 'mc-viewer-document';
  root.className = 'mc-viewer-document';
  root.hidden = true;
  root.setAttribute('aria-label', '正在查看的资料');
  document.body.append(root);
  let current = null;
  let expandedUntil = 0;
  let combatUntil = 0;
  let containerOpen = false;
  let timer = null;
  const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
  const row = (value) => value && typeof value === 'object' && typeof value.title === 'string'
    ? { id: text(value.id, 80), title: text(value.title, 100), body: text(value.body, 400),
      detail: text(value.detail, 200), status: text(value.status, 80) } : null;
  function normalize(value) {
    if (!value || value.schemaVersion !== 1 || typeof value.id !== 'string'
      || !/^[a-z0-9_.:-]{1,80}$/.test(value.id) || typeof value.title !== 'string'
      || !value.title.trim() || !Number.isFinite(value.observedAt)) return null;
    const sections = [];
    let remaining = 64;
    for (const section of Array.isArray(value.sections) ? value.sections.slice(0, 8) : []) {
      if (!section || typeof section.title !== 'string' || !Array.isArray(section.rows)) continue;
      const rows = section.rows.slice(0, remaining).map(row).filter(Boolean);
      remaining -= rows.length;
      sections.push({ title: text(section.title, 100), rows });
    }
    return { schemaVersion: 1, id: value.id, title: text(value.title, 100),
      subtitle: text(value.subtitle, 200), source: text(value.source, 80),
      observedAt: value.observedAt, sections, summary: row(value.summary) };
  }
  function element(tag, className, content) {
    const node = document.createElement(tag);
    node.className = className;
    if (content) node.textContent = content;
    return node;
  }
  function render() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    root.replaceChildren();
    root.hidden = current === null;
    if (!current) {
      document.body.classList.remove('mc-viewer-document-expanded');
      return;
    }
    const now = Date.now();
    const combat = now < combatUntil;
    const compact = combat || containerOpen || now >= expandedUntil;
    document.body.classList[compact ? 'remove' : 'add']('mc-viewer-document-expanded');
    root.dataset.compact = String(compact);
    root.dataset.combat = String(combat);
    const header = element('header', '', '');
    header.append(element('strong', '', current.title));
    const button = element('button', '', compact ? '查看' : '收起');
    button.type = 'button';
    button.addEventListener('click', () => {
      expandedUntil = compact ? Date.now() + 18_000 : 0;
      render();
    });
    header.append(button);
    root.append(header);
    if (current.subtitle) root.append(element('div', 'mc-viewer-document-subtitle', current.subtitle));
    if (current.summary) {
      const summary = element('div', 'mc-viewer-document-summary', '');
      summary.append(element('strong', '', current.summary.title));
      if (current.summary.body) summary.append(element('p', '', current.summary.body));
      if (current.summary.status || current.summary.detail)
        summary.append(element('small', '', [current.summary.status, current.summary.detail].filter(Boolean).join(' · ')));
      root.append(summary);
    }
    for (const section of current.sections) {
      if (!section.rows.length) continue;
      const group = element('section', 'mc-viewer-document-section', '');
      group.append(element('h3', '', section.title));
      for (const entry of section.rows) {
        const card = element('div', 'mc-viewer-document-row', '');
        if (entry.id) card.dataset.id = entry.id;
        if (entry.status) card.append(element('span', 'mc-viewer-document-status', entry.status));
        card.append(element('strong', '', entry.title));
        if (entry.body) card.append(element('p', '', entry.body));
        if (entry.detail) card.append(element('small', '', entry.detail));
        group.append(card);
      }
      root.append(group);
    }
    const count = current.sections.reduce((total, section) => total + section.rows.length, 0);
    const observed = new Date(current.observedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    root.append(element('footer', '', `${current.source || '服务端资料'} · ${observed} 所见${count ? ` · ${count} 项` : ''}`));
    const next = [expandedUntil, combatUntil].filter(at => at > now);
    if (next.length) timer = setTimeout(render, Math.min(...next) - now);
  }
  const api = Object.freeze({
    set(value, options = {}) {
      const next = normalize(value);
      if (!next) return false;
      current = next;
      if (options.expand === true) expandedUntil = Date.now() + 18_000;
      render();
      return true;
    },
    clear() {
      current = null;
      expandedUntil = combatUntil = 0;
      containerOpen = false;
      render();
      globalThis.mcViewerGameMessagePreset?.reset?.();
    },
    state() {
      return current && JSON.parse(JSON.stringify(current));
    },
    consumeMessage(event) {
      return typeof globalThis.mcViewerGameMessagePreset === 'function'
        && globalThis.mcViewerGameMessagePreset(event, api) === true;
    },
  });
  globalThis.MinecraftViewerDocuments = api;
  socket.on('documentState', (value) => value === null ? api.clear() : api.set(value, { expand: true }));
  for (const name of ['viewerReset', 'disconnect']) socket.on(name, api.clear);
  window.addEventListener('pagehide', api.clear);
  const combat = () => { combatUntil = Date.now() + 5_000; render(); };
  socket.on('entityDamage', event => { if (event?.isSelf === true) combat(); });
  socket.on('tacticalAttack', combat);
  socket.on('combatFeedback', combat);
  socket.on('rangedUse', event => { if (event?.phase === 'draw' || event?.phase === 'release') combat(); });
  socket.on('containerState', event => { containerOpen = event !== null; render(); });
})();
