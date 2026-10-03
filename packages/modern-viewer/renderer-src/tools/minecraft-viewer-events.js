/** Short-lived game feedback over the read-only viewer picture. */
function cortiInstallGameEvents(socket) {
  const feed = document.getElementById('corti-event-feed');
  const title = document.getElementById('corti-game-title');
  const titleMain = title?.querySelector('[data-game-title]');
  const titleSub = title?.querySelector('[data-game-subtitle]');
  const actionbar = document.getElementById('corti-actionbar');
  const bossBars = document.getElementById('corti-boss-bars');
  if (!feed || !title || !titleMain || !titleSub || !actionbar || !bossBars) return;
  const labels = { chat: '聊天', system: '系统', whisper: '私聊', advancement: '进度',
    title: '提示', subtitle: '副标题', actionbar: '动作栏', death: '阵亡' };
  let titleTimer = null;
  let titleDurationMs = 5_000;
  let actionbarTimer = null;
  let damageTimer = null;
  const recentSystemMessages = new Map();
  let systemWindowAt = 0;
  let systemWindowCount = 0;
  const clearTitle = () => {
    if (titleTimer !== null) clearTimeout(titleTimer);
    title.hidden = true;
    titleMain.textContent = '';
    titleSub.textContent = '';
    titleTimer = null;
  };
  const showTitle = (kind, message) => {
    title.hidden = false;
    title.dataset.kind = kind;
    if (kind === 'subtitle') titleSub.textContent = message;
    else {
      titleMain.textContent = message;
      if (kind === 'death') titleSub.textContent = '';
    }
    if (titleTimer !== null) clearTimeout(titleTimer);
    titleTimer = setTimeout(clearTitle, kind === 'death' ? 7_000 : titleDurationMs);
  };
  socket.on('gameTitleTiming', (timing) => {
    if (!timing || ![timing.fadeIn, timing.stay, timing.fadeOut].every((value) =>
      Number.isInteger(value) && value >= 0 && value <= 1_200)) return;
    titleDurationMs = Math.min(60_000, (timing.fadeIn + timing.stay + timing.fadeOut) * 50);
    title.style.setProperty('--corti-title-fade-in', `${timing.fadeIn * 50}ms`);
  });
  socket.on('gameTitleClear', clearTitle);
  socket.on('gameMessage', (event) => {
    if (!event || !Object.hasOwn(labels, event.kind) ||
        typeof event.text !== 'string' || !event.text.trim()) return;
    const kind = event.kind;
    const message = event.text.slice(0, 160);
    if (kind === 'actionbar') {
      actionbar.hidden = false;
      actionbar.textContent = message;
      if (actionbarTimer !== null) clearTimeout(actionbarTimer);
      actionbarTimer = setTimeout(() => { actionbar.hidden = true; actionbarTimer = null; }, 3_000);
      return;
    }
    if (kind === 'title' || kind === 'subtitle') {
      showTitle(kind, message);
      return;
    }
    if (kind === 'system') {
      const now = performance.now();
      if (message.length > 120 || /https?:\/\//i.test(message)) return;
      for (const [text, at] of recentSystemMessages) {
        if (now - at > 15_000) recentSystemMessages.delete(text);
      }
      if (recentSystemMessages.has(message)) return;
      recentSystemMessages.set(message, now);
      if (now - systemWindowAt > 3_000) { systemWindowAt = now; systemWindowCount = 0; }
      if (++systemWindowCount > 2) return;
    }
    const row = document.createElement('div');
    row.className = 'corti-event';
    row.dataset.kind = kind;
    const label = document.createElement('small');
    label.textContent = labels[kind];
    const body = document.createElement('span');
    body.textContent = message;
    row.append(label, body);
    feed.append(row);
    while (feed.children.length > 4) feed.firstElementChild.remove();
    setTimeout(() => row.remove(), kind === 'death' ? 8_000 : 7_000);
    if (kind === 'death') showTitle(kind, message);
  });
  socket.on('bossBars', (bars) => {
    if (!Array.isArray(bars) || bars.length > 8) return;
    bossBars.replaceChildren();
    for (const bar of bars) {
      if (!bar || typeof bar.title !== 'string' || bar.title.length > 100 ||
          typeof bar.progress !== 'number' || !Number.isFinite(bar.progress) ||
          bar.progress < 0 || bar.progress > 1 ||
          !['pink', 'blue', 'red', 'green', 'yellow', 'purple', 'white'].includes(bar.color)) continue;
      const row = document.createElement('div');
      row.className = 'corti-boss-bar';
      row.dataset.color = bar.color;
      const name = document.createElement('span');
      name.className = 'corti-boss-title';
      name.textContent = bar.title;
      const track = document.createElement('div');
      track.className = 'corti-boss-track';
      const fill = document.createElement('div');
      fill.className = 'corti-boss-fill';
      fill.style.width = `${Math.round(bar.progress * 100)}%`;
      track.append(fill);
      row.append(name, track);
      bossBars.append(row);
      if (/(?:经验|(?:^|\b)xp(?:\b|$)|auraskills)/i.test(bar.title)) {
        setTimeout(() => row.remove(), 5_000);
      }
    }
  });
  // A reconnect or dimension reset starts a new view of the server state.
  // Clear the previous session's bars until its fresh snapshot arrives.
  socket.on('viewerReset', () => bossBars.replaceChildren());
  socket.on('disconnect', () => bossBars.replaceChildren());
  const fire = document.createElement('div');
  fire.className = 'corti-self-fire';
  fire.hidden = true;
  fire.setAttribute('aria-hidden', 'true');
  const fireStyle = document.createElement('style');
  fireStyle.textContent = '.corti-self-fire{position:fixed;inset:0;z-index:2;pointer-events:none;' +
    'background:linear-gradient(0deg,#ef632a70,transparent 28%);' +
    'opacity:.68;animation:corti-fire-flicker .32s steps(2) infinite}' +
    '.corti-self-fire:before,.corti-self-fire:after{content:"";position:absolute;bottom:-5vh;' +
    'width:30vw;height:42vh;background-size:100% 3200%;background-position:center top;' +
    'background-repeat:no-repeat}.corti-self-fire:before{left:-5vw;' +
    'background-image:url(/textures/1.20.6/block/fire_0.png)}' +
    '.corti-self-fire:after{right:-5vw;' +
    'background-image:url(/textures/1.20.6/block/fire_1.png)}' +
    '@keyframes corti-fire-flicker{50%{opacity:.50;filter:brightness(1.15)}}' +
    '@media(prefers-reduced-motion:reduce){.corti-self-fire{animation:none}}';
  document.head.append(fireStyle);
  document.body.append(fire);
  socket.on('avatarState', state => { fire.hidden = state?.burning !== true; });
  socket.on('viewerReset', () => { fire.hidden = true; });
  socket.on('disconnect', () => { fire.hidden = true; });
  socket.on('entityDamage', (event) => {
    if (event?.isSelf !== true) return;
    document.body.classList.remove('corti-took-damage');
    void document.body.offsetWidth;
    document.body.classList.add('corti-took-damage');
    if (damageTimer !== null) clearTimeout(damageTimer);
    damageTimer = setTimeout(() => {
      document.body.classList.remove('corti-took-damage');
      damageTimer = null;
    }, 650);
  });
}

cortiInstallGameEvents(socket);
