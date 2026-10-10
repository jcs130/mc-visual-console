/** Keep admission failures distinct from a lost stream and recover when a slot frees. */
export function installViewerConnectionStatus(socket, {
  setStatus, isRendererReady, reload, onDisconnect,
  schedule = setTimeout, cancel = clearTimeout,
}) {
  let connectedBefore = false;
  let freshPagePending = false;
  let busy = false;
  let busyAttempts = 0;
  let timer = null;
  let disposed = false;
  const clearRetry = () => { if (timer !== null) cancel(timer); timer = null; };
  const retry = (delay) => {
    clearRetry();
    timer = schedule(() => {
      timer = null;
      if (!disposed && !socket.connected) socket.connect();
    }, delay);
  };
  const handlers = {
    connect() {
      clearRetry();
      freshPagePending = connectedBefore && isRendererReady();
      connectedBefore = true;
      busy = false;
      setStatus(isRendererReady() ? '实时画面已重新连接' : '正在同步世界数据…', false, isRendererReady());
    },
    version() {
      busyAttempts = 0;
      // A rejected connection also emits connect. Reload only after admission,
      // when the new world snapshot starts, to avoid a reload loop at capacity.
      if (freshPagePending) { freshPagePending = false; reload(); }
    },
    viewerBusy() {
      busy = true;
      freshPagePending = false;
      setStatus('本地画面连接已满，正在等待空位；可关闭多余的画面页面。', true);
      retry(Math.min(15_000, 3_000 * 2 ** Math.min(busyAttempts++, 3)));
    },
    disconnect(reason) {
      onDisconnect();
      if (busy) return;
      setStatus('画面数据流暂时中断，正在重连…', true);
      if (reason === 'io server disconnect') retry(350);
    },
    connect_error() { setStatus('无法连接本地画面服务，正在重试…', true); },
  };
  for (const [event, handler] of Object.entries(handlers)) socket.on(event, handler);
  return () => {
    disposed = true;
    clearRetry();
    for (const [event, handler] of Object.entries(handlers)) socket.off(event, handler);
  };
}
