/** Server-attested subject/window state for an existing player or spectator connection. */
const CHANNELS = new Set(['mcviewer:state', 'corti:viewer_state']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createViewerObserverBridge(bot, { now = Date.now, staleMs = 12_000, serializeWindow } = {}) {
  const subscribers = new Set();
  let nativeWindow = null;
  const windowChanged = () => {
    if (nativeWindow && current?.viewerSession?.attached && current.viewerSession.windowOpen && serializeWindow)
      emit('containerState', serializeWindow(nativeWindow));
  };
  function openWindow(window) {
    nativeWindow?.off?.('updateSlot', windowChanged);
    nativeWindow = window;
    nativeWindow?.on?.('updateSlot', windowChanged);
    windowChanged();
  }
  let current = null, pending = null, cameraId = null, at = 0, closed = false;
  const key = state => state?.viewerSession?.attached ? [state.viewerSession.playerUuid,
    state.viewerSession.entityId, state.viewerSession.worldUuid].join(':') : '';
  const emit = (event, value) => { for (const socket of subscribers) socket.emit(event, value); };
  function reset(reason) {
    openWindow(null);
    current = null; pending = null; at = 0;
    emit('viewerSession', { mode: 'observer', attached: false, reason });
    emit('containerState', null);
    emit('skillsState', { schemaVersion: 1, mana: null, skills: [], abilities: [] });
    emit('observerState', { attached: false, reason });
  }
  function accept(state) {
    const session = state.viewerSession;
    if (session.mode === 'observer' && session.attached && session.entityId !== cameraId) { pending = state; return; }
    if (key(current) !== key(state)) emit('containerState', null);
    current = state; pending = null; at = now();
    emit('viewerSession', session);
    if (!session.attached || !session.windowOpen) emit('containerState', null);
    emit('skillsState', state);
    emit('observerState', { ...session, vitals: state.vitals ?? null });
    windowChanged();
  }
  function payload(packet) {
    if (!CHANNELS.has(packet.channel) || !Buffer.isBuffer(packet.data) || packet.data.length > 16_384) return;
    let state; try { state = JSON.parse(packet.data.toString('utf8')); } catch { return; }
    const session = state?.viewerSession;
    if (state?.schemaVersion !== 1 || !session || !UUID.test(session.recipientUuid ?? '')
        || session.recipientUuid.toLowerCase() !== String(bot.player?.uuid ?? bot.entity?.uuid ?? bot.uuid).toLowerCase()
        || !['self', 'observer'].includes(session.mode) || typeof session.attached !== 'boolean') return;
    if (session.attached && (!UUID.test(session.playerUuid ?? '') || !UUID.test(session.worldUuid ?? '')
        || !Number.isSafeInteger(session.entityId) || !/^[A-Za-z0-9_.]{1,32}$/.test(session.playerName ?? '')
        || typeof session.windowOpen !== 'boolean')) return;
    accept(state);
  }
  function camera(packet) {
    const previous = cameraId, candidate = pending; cameraId = packet.cameraId;
    if (current?.viewerSession?.mode === 'observer' && current.viewerSession.entityId !== cameraId) reset('camera_changed');
    if (previous !== cameraId && candidate?.viewerSession?.entityId === cameraId) accept(candidate);
  }
  const respawn = () => { cameraId = null; reset('respawn'); };
  const closeWindow = () => { openWindow(null); emit('containerState', null); };
  const outgoing = (name) => { if (name === 'close_window') closeWindow(); };
  const register = () => {
    if (bot._client?.state === 'play') bot._client.write('custom_payload', {
      channel: 'minecraft:register', data: Buffer.from('mcviewer:state') });
  };
  bot._client.on('custom_payload', payload); bot._client.on('camera', camera);
  bot._client.on('respawn', respawn); bot._client.on('close_window', closeWindow);
  bot._client.on('writePacket', outgoing); bot.on('windowClose', closeWindow); bot.on('spawn', register);
  if (serializeWindow) bot.on('windowOpen', openWindow);
  const onEnd = () => reset('disconnected'); bot.on('end', onEnd);
  register();
  const timer = setInterval(() => { if (current && now() - at > staleMs) reset('state_stale'); }, 1000);
  timer.unref?.();
  return {
    subscribeSocket(socket) {
      if (closed) throw Error('observer_bridge_closed');
      subscribers.add(socket);
      if (current) {
        socket.emit('viewerSession', current.viewerSession);
        socket.emit('skillsState', current);
        socket.emit('observerState', { ...current.viewerSession, vitals: current.vitals ?? null });
        if (nativeWindow && current.viewerSession.attached && current.viewerSession.windowOpen && serializeWindow)
          socket.emit('containerState', serializeWindow(nativeWindow));
      }
      const off = () => { subscribers.delete(socket); socket.off?.('disconnect', off); };
      socket.on('disconnect', off); return off;
    },
    snapshot: () => current,
    dispose() {
      if (closed) return; closed = true; clearInterval(timer); reset('disposed'); subscribers.clear();
      bot._client.off('custom_payload', payload); bot._client.off('camera', camera);
      bot._client.off('respawn', respawn); bot._client.off('close_window', closeWindow);
      bot._client.off('writePacket', outgoing); bot.off('windowClose', closeWindow);
      bot.off('spawn', register); bot.off('end', onEnd);
      bot.off('windowOpen', openWindow);
    },
  };
}
