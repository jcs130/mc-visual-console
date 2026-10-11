/** Read-only, bounded chat history. Never persists or transfers another subject's messages. */
function cortiInstallChatHistory(socket) {
  if (new URLSearchParams(globalThis.location?.search ?? '').get('photo') === '1') return null;
  const root = document.createElement('section');
  root.className = 'corti-chat'; root.setAttribute('aria-label', '游戏消息记录');
  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.className = 'corti-chat-toggle';
  toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', 'corti-chat-panel');
  const panel = document.createElement('section');
  panel.id = 'corti-chat-panel'; panel.className = 'corti-chat-panel'; panel.hidden = true;
  const header = document.createElement('header'), heading = document.createElement('strong');
  heading.textContent = '消息记录';
  const close = document.createElement('button'); close.type = 'button'; close.textContent = '收起';
  const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = '清空';
  header.append(heading, clear, close);
  const tabs = document.createElement('nav'); tabs.setAttribute('aria-label', '消息分类');
  const categories = { all: '全部', chat: '聊天', whisper: '私聊', task: '任务 / 提醒', system: '系统', raw: '详细回执' };
  const buttons = new Map();
  for (const [key, label] of Object.entries(categories)) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.dataset.channel = key; button.addEventListener('click', () => { channel = key; render(); });
    buttons.set(key, button); tabs.append(button);
  }
  const search = document.createElement('input'); search.type = 'search'; search.placeholder = '搜索当前视角的消息';
  search.setAttribute('aria-label', '搜索消息'); search.maxLength = 100;
  const list = document.createElement('div'); list.className = 'corti-chat-list'; list.setAttribute('role', 'log');
  const footer = document.createElement('small'); footer.className = 'corti-chat-footer';
  footer.textContent = '仅保留本页最近 200 条；切换角色或断线会清空。';
  panel.append(header, tabs, search, list, footer); root.append(toggle, panel); document.body.append(root);
  let messages = [], unread = 0, channel = 'all', subject = null, sequence = 0, paused = false;
  const labels = { chat: '聊天', whisper: '私聊', task: '任务', system: '系统', raw: '回执' };
  const time = at => new Date(at).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  function badge() { toggle.textContent = unread ? `消息 · ${Math.min(unread, 200)} 条未读` : '消息记录'; }
  function visible(row) {
    return (channel === 'all' ? row.channel !== 'raw' : row.channel === channel)
      && (!search.value?.trim() || row.text.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()));
  }
  function render(follow = true) {
    const wasNearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 50;
    const top = list.scrollTop;
    list.replaceChildren();
    for (const button of buttons.values()) button.setAttribute('aria-pressed', String(button.dataset.channel === channel));
    const rows = messages.filter(visible);
    if (!rows.length) { const empty = document.createElement('p'); empty.className = 'corti-chat-empty'; empty.textContent = '当前分类还没有消息'; list.append(empty); }
    for (const row of rows) {
      const item = document.createElement('article'); item.className = 'corti-chat-message'; item.dataset.channel = row.channel;
      const stamp = document.createElement('small'); stamp.textContent = `${time(row.at)} · ${labels[row.channel]}`;
      item.append(stamp);
      if (row.channel === 'raw') {
        const detail = document.createElement('details'), summary = document.createElement('summary'), body = document.createElement('pre');
        summary.textContent = row.text.split(' ', 1)[0] + ' · 展开原始回执'; body.textContent = row.text;
        detail.append(summary, body); item.append(detail);
      } else {
        const body = document.createElement('p'); body.textContent = row.text; item.append(body);
      }
      list.append(item);
    }
    if (follow && wasNearBottom) list.scrollTop = list.scrollHeight;
    else list.scrollTop = top;
    badge();
  }
  function reset() { messages = []; unread = 0; search.value = ''; render(); }
  function setOpen(open) {
    panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open));
    root.dataset.open = String(open);
    if (open) { unread = 0; render(); list.scrollTop = list.scrollHeight; search.focus?.(); }
    badge();
  }
  toggle.addEventListener('click', () => setOpen(panel.hidden)); close.addEventListener('click', () => setOpen(false));
  clear.addEventListener('click', reset); search.addEventListener('input', () => render(false));
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); toggle.focus?.(); } });
  // Do not let typing in the read-only history trigger viewer E/hotbar shortcuts.
  search.addEventListener('keydown', event => { if (event.key !== 'Escape') event.stopPropagation(); });
  socket.on('viewerSession', state => {
    if (!state || !['self','observer'].includes(state.mode) || typeof state.attached !== 'boolean') return;
    const next = state.attached ? `${state.mode}:${state.playerUuid ?? ''}:${state.entityId ?? ''}:${state.worldUuid ?? ''}` : null;
    if (next !== subject || !state.attached) reset();
    subject = next; paused = state.mode === 'observer' && !state.attached;
  });
  socket.on('viewerReset', () => { reset(); subject = null; paused = false; });
  socket.on('disconnect', () => { reset(); subject = null; paused = true; });
  socket.on('connect', () => { paused = false; });
  badge();
  return Object.freeze({
    receive(event) {
      if (paused) return { suppressed: true };
      if (!event || typeof event.text !== 'string' || !event.text.trim()
          || !['chat','whisper','system','advancement','death','title','subtitle'].includes(event.kind)) return null;
      const text = event.text.replace(/§[0-9a-fk-or]/gi, '').slice(0, 4096);
      const technical = event.kind === 'system' && /^MC_[A-Z0-9_]+\s/.test(text);
      const task = ['system','death','advancement','title','subtitle'].includes(event.kind)
        && /【(?:地下城|参战|公会|任务|委托|试炼|救援|倒地|操作未完成|正确做法|领地|保护)|待领奖|结算|挑战失败|奖励已|倒地|死亡/.test(text);
      const category = technical ? 'raw' : ['chat','whisper'].includes(event.kind) ? event.kind : task ? 'task' : 'system';
      const previous = messages.at(-1), now = Date.now();
      if (previous?.channel === category && previous.text === text && now - previous.at < 1500) return { technical };
      messages.push({ id: ++sequence, at: now, channel: category, text });
      if (technical && messages.filter(row => row.channel === 'raw').length > 40)
        messages.splice(messages.findIndex(row => row.channel === 'raw'), 1);
      if (messages.length > 200) messages.shift();
      if (panel.hidden && !technical) unread = Math.min(200, unread + 1);
      if (!panel.hidden) render(); else badge();
      return { technical };
    },
  });
}
globalThis.MinecraftViewerChat = cortiInstallChatHistory(socket);
