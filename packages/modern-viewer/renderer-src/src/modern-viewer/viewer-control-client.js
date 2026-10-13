const reasonText = {
  not_authorized: '当前账号没有接管权限', control_busy: '正在交接或已有其他页面接管，请稍后再试',
  handoff_failed: 'Agent 暂时无法交还控制权', action_pending: '上一操作仍在执行',
  no_reachable_target: '准星附近没有可操作的目标', navigation_unavailable: '当前宿主尚未接入点地寻路',
  input_expired: '输入已超时，角色已停止', lease_expired: '接管已超时，请重新接管',
  actor_changed: '角色连接已变化，请重新接管', no_held_item: '手中没有可使用的物品',
  action_failed: '操作结果未知，请查看游戏状态', dig_not_confirmed: '挖掘未确认，请重新查看方块',
  cancelled: '操作已停止', acquire_cancelled: '已取消接管', navigation_failed: '无法到达目标，请选择附近可行走的地面',
  agent_resume_failed: '角色已停止，但 Agent 恢复失败，请检查运行端',
};

/** Same-origin Socket.IO controls. Embedded dashboards keep their existing
 * postMessage integration. Reconnecting never automatically reacquires. */
export function installViewerControlClient({ socket, document, window, onState, isReady = () => true, hidden = false, now = Date.now }) {
  let state = null, sequence = 0, disposed = false, pending = false, wantsControl = false, intent = 0, requestedAt = 0;
  const listeners = [];
  const listen = (el, name, fn) => { el.addEventListener(name, fn); listeners.push([el, name, fn]); };
  const root = document.createElement('div'); root.className = 'viewer-play-controls'; root.hidden = true;
  const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-label', '接管角色');
  const output = document.createElement('output'); output.setAttribute('aria-live', 'polite');
  root.append(button, output); document.body.append(root);

  function update(next) {
    if (next?.schemaVersion !== 1) return;
    // A server grant already in flight can arrive after blur/cancel. Release its
    // epoch without activating input handlers or replaying any buffered motion.
    if (next.active && !wantsControl) {
      if (socket.connected) socket.emit('viewerControl', { schemaVersion: 1, type: 'release', epoch: next.epoch, sequence: ++sequence });
      next = { ...next, active: false, phase: 'observe', reason: 'released' };
    }
    const wasActive = state?.active;
    if (next.active) pending = false;
    else if (wasActive) { wantsControl = false; pending = false; intent++; }
    state = next;
    root.hidden = hidden || !state.available;
    button.textContent = state.active ? '交还 Agent' : pending ? '取消接管' : '接管角色';
    button.setAttribute('aria-pressed', String(state.active === true));
    button.disabled = Boolean(state.busy && !state.active && !pending);
    output.textContent = reasonText[state.reason] ?? (state.active ? `正在控制 ${state.actor?.username ?? '角色'}` : pending ? '正在等待 Agent 交还控制权…' : '');
    onState?.({ active: state.active === true, phase: state.phase, stopLatched: state.reason === 'input_expired' });
    if (wasActive && !state.active) window.document?.exitPointerLock?.();
  }
  function send(type, data = {}) {
    if (disposed || !socket.connected) return false;
    if (type !== 'acquire' && type !== 'release' && !state?.active) return false;
    const requestIntent = intent;
    const packet = { schemaVersion: 1, type, epoch: state?.epoch, sequence: ++sequence, requestId: String(sequence), ...data };
    socket.emit('viewerControl', packet, result => {
      if (disposed || intent !== requestIntent || (type !== 'acquire' && packet.epoch !== state?.epoch)) return;
      if (!result?.ok) {
        if (type === 'acquire') { pending = false; wantsControl = false; update({ ...state, reason: result?.reason }); }
        output.textContent = reasonText[result?.reason] ?? '操作未完成，请查看角色状态';
      } else if (result.status === 'unknown') output.textContent = '操作结果未知，请查看游戏状态';
      // An acknowledgement is never an inventory or world snapshot.
    });
    return true;
  }
  function stop() {
    if (state?.active || pending) send('release');
    wantsControl = false; pending = false; intent++;
    update({ ...state, schemaVersion: 1, active: false, phase: 'observe', reason: 'released' });
  }
  listen(button, 'click', () => {
    if (pending || state?.active) { stop(); return; }
    if (!isReady() || !socket.connected) return;
    wantsControl = true; pending = true; requestedAt = now(); intent++;
    send('acquire'); update(state);
  });
  const disconnect = () => {
    wantsControl = false; pending = false; intent++;
    update({ schemaVersion: 1, available: false, active: false, phase: 'observe' });
  };
  const connect = () => { disconnect(); socket.emit('viewerControlStatus'); };
  socket.on('viewerControlState', update); socket.on('disconnect', disconnect); socket.on('connect', connect);
  listen(window, 'blur', stop); listen(window, 'pagehide', stop);
  listen(document, 'visibilitychange', () => { if (document.hidden) stop(); });
  const timer = window.setInterval(() => {
    if (pending && now() - requestedAt > 8000) { stop(); output.textContent = '接管尚未完成，已取消请求；请检查 Agent 运行端'; }
    if (state?.active && !document.hidden) send('heartbeat');
  }, 1000);
  if (socket.connected) socket.emit('viewerControlStatus');
  return {
    update, active: () => state?.active === true, send,
    route(message) {
      if (!state?.available) return false;
      const map = { 'lantern-control-motion': 'motion', 'lantern-control-stop': 'stop', 'lantern-control-release': 'release',
        'lantern-viewer-blur': 'release', 'lantern-control-navigate-ray': 'navigate', 'lantern-control-primary': 'primary',
        'lantern-control-secondary': 'secondary', 'lantern-control-hotbar': 'hotbar' };
      const type = map[message?.type]; if (!type) return false;
      if (type === 'release') { stop(); return true; }
      send(type, type === 'motion' ? { input: message.input } : type === 'navigate' ? { ray: message.ray }
        : type === 'hotbar' ? { slot: message.slot } : { pressed: message.pressed });
      return true;
    },
    dispose() {
      if (disposed) return; stop(); disposed = true; window.clearInterval(timer);
      socket.off('viewerControlState', update); socket.off('connect', connect); socket.off('disconnect', disconnect);
      for (const [el, name, fn] of listeners) el.removeEventListener(name, fn);
      root.remove();
    },
  };
}
