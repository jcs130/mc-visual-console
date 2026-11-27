/** First-person display of the observed player's bounded interaction frames. */
function cortiInstallInteractionView(socket) {
  const titles = { 'book-read': '读书', 'book-write': '写书', 'sign-write': '编辑告示牌', craft: '合成', rename: '铁砧改名' };
  let panel;
  let frame = null;
  let timer;
  let shownAt = 0;
  let replaying = false;
  let container = false;
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };
  const render = () => {
    if (!frame) {
      if (panel) { panel.hidden = true; panel.replaceChildren(); }
      return;
    }
    if (!panel) {
      panel = element('section', null, 'corti-interaction');
      panel.setAttribute('aria-label', '第一人称交互');
      document.body.append(panel);
    }
    panel.dataset.kind = frame.kind;
    panel.dataset.phase = frame.phase;
    panel.dataset.withContainer = String(container);
    const heading = element('header');
    heading.append(element('span', titles[frame.kind]), element('strong', frame.title));
    panel.replaceChildren(heading);
    const status = frame.phase === 'confirmed' ? (frame.result || '已确认')
      : frame.phase === 'unconfirmed' ? '结果待确认' : replaying ? '刚才的操作'
        : frame.kind === 'book-read' ? '' : '正在操作';
    if (frame.kind === 'book-read' || frame.kind === 'book-write') {
      panel.append(element('p', frame.text, 'corti-interaction-page'));
      const page = Number.isInteger(frame.page) ? `第 ${frame.page} / ${frame.pageCount} 页`
        : Number.isInteger(frame.pageCount) ? `共 ${frame.pageCount} 页` : '';
      panel.append(element('footer', [frame.author, page, status].filter(Boolean).join(' · ')));
    } else if (frame.kind === 'sign-write') {
      const board = element('div', null, 'corti-interaction-sign');
      for (let row = 0; row < 4; row++) board.append(element('div', frame.lines?.[row] || ' '));
      panel.append(board, element('footer', [frame.side === 'back' ? '背面' : '正面', status].filter(Boolean).join(' · ')));
    } else if (frame.kind === 'craft') {
      if (!container) {
        const board = element('div', null, 'corti-interaction-grid');
        const size = frame.gridSize === 3 ? 3 : 2;
        board.style.gridTemplateColumns = `repeat(${size}, minmax(0, 1fr))`;
        for (let slot = 0; slot < size ** 2; slot++) board.append(element('span', frame.grid?.[slot] || ''));
        panel.append(board, element('small', frame.shaped ? '配方摆位' : '无序材料'));
      }
      panel.append(element('footer', status));
    } else {
      panel.append(element('p', frame.name, 'corti-interaction-name'), element('footer', [frame.item, status].filter(Boolean).join(' · ')));
    }
    panel.hidden = container && !['craft', 'rename'].includes(frame.kind);
  };
  const clear = () => {
    clearTimeout(timer);
    frame = null;
    replaying = false;
    render();
  };
  const show = (value, elapsed = 0) => {
    frame = value;
    replaying = false;
    shownAt = performance.now();
    render();
    timer = setTimeout(clear, Math.min(Math.max(0, value.remainingMs - elapsed), 10000));
  };
  socket.on('viewerInteraction', value => {
    document.body.dataset.interactionView = 'true';
    clearTimeout(timer);
    if (!value || !Object.hasOwn(titles, value.kind) || typeof value.title !== 'string' ||
        !['active', 'confirmed', 'unconfirmed'].includes(value.phase) ||
        !Number.isFinite(value.remainingMs) || value.remainingMs <= 0) {
      clear();
      return;
    }
    const hold = frame?.id === value.id && frame.phase === 'active' && value.phase !== 'active'
      ? Math.max(0, 650 - (performance.now() - shownAt)) : 0;
    if (hold > 0) {
      replaying = true;
      render();
      timer = setTimeout(() => show(value, hold), hold);
      return;
    }
    show(value);
  });
  socket.on('containerState', value => {
    const open = !!value;
    if (open === container) return;
    container = open;
    render();
  });
  for (const event of ['viewerReset', 'disconnect']) socket.on(event, () => {
    container = false;
    clear();
  });
  window.addEventListener('keydown', event => { if (event.code === 'Escape') clear(); });
}
