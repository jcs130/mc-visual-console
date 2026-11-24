// Default viewer chrome shows one short Chinese loading line. The English
// chunk diagnostics are developer output: only ?debugChunks=1 or the saved
// "区块调试信息" display setting turns them on (?debugChunks=0 forces off).
export const CHUNK_DEBUG_STORAGE_KEY = 'minecraft.viewer.debugChunks';

export function chunkDiagnosticsEnabled(search = '', storage = null) {
  let query = null;
  try { query = new URLSearchParams(search).get('debugChunks'); } catch {}
  if (query === '1') return true;
  if (query === '0') return false;
  try { return storage?.getItem?.(CHUNK_DEBUG_STORAGE_KEY) === '1'; } catch { return false; }
}

export function setChunkDiagnosticsPreference(storage, enabled) {
  try {
    if (enabled) storage?.setItem?.(CHUNK_DEBUG_STORAGE_KEY, '1');
    else storage?.removeItem?.(CHUNK_DEBUG_STORAGE_KEY);
  } catch {}
}

/**
 * One line, at most three short clauses, all Chinese.
 * `grid` is the visible chunk grid ((2·distance+1)², 81 at the default
 * distance 4) so the denominator is stable from the first frame instead of
 * following whatever has been received so far. Chunks count as ready when the
 * whole grid is meshed, or when every received chunk is meshed and no section
 * is waiting (the server may simply not send the outermost ring).
 */
export function viewerLoadStatus({ connected = true, grid = 81, pendingNear = 0, received = 0, meshed = 0, sectionsWaiting = 0, animation = null } = {}) {
  if (!connected) return { text: '画面未连接 · 正在重试', settled: false };
  const total = Math.max(1, Math.floor(grid));
  const synced = Math.max(0, Math.min(total, total - Math.max(0, pendingNear)));
  const chunksReady = received > 0 && (pendingNear <= 0 || (meshed >= received && sectionsWaiting <= 0));
  const parts = [chunksReady ? '画面就绪' : '画面加载中', received > 0 ? `已同步 ${synced}/${total} 区块` : '等待区块'];
  let animationReady = false;
  if (!animation || animation.pending) parts.push('动画准备中');
  else if (animation.loading) parts.push(Number.isFinite(animation.total) && animation.total > 0 ? `动画准备中 ${animation.loaded ?? 0}/${animation.total}` : '动画准备中');
  else if (animation.errors > 0 && !animation.sprites) parts.push('动画不可用');
  else { parts.push('动画就绪'); animationReady = true; }
  return { text: parts.join(' · '), settled: chunksReady && animationReady };
}
