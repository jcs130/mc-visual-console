const MODES = {
  starting: '正在启动', waiting_for_player: '等待玩家进入游戏', thinking: '等待模型决策', acting: '执行动作',
  observing: '观察／等待下一轮', paused: '已暂停', paused_unknown: '结果未知，已暂停',
  paused_model: '模型接口受限，已暂停',
  model_rate_backoff: '模型请求受限，退避等待',
  decision_backoff: '决策失败，退避等待', stopping: '正在停止'
}
const text = value => typeof value === 'string' && value.length ? value : null
const compact = (value, max = 180) => value.length > max ? value.slice(0, max) + '…' : value
function unavailable (reason) {
  return { available: false, name: '未提供', mode: '不可用', goal: '未提供', action: '未收到动作回执', receipt: '未收到', receiptAt: '未提供', decisionAt: '未提供', notice: reason }
}
function timestamp (value) {
  if (typeof value !== 'string' || !value) return '未提供'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { hour12: false }) : '时间无效'
}

// This view uses only the same host's injected Agent record. A positive receipt
// is displayed as ok=true, never promoted to a verified Minecraft effect.
export function agentStatusView (status, expectedPlayer = null) {
  if (status?.mode !== 'live_same_player_connection' || !text(status?.identity?.player)) return unavailable('玩家连接身份不可用')
  if ((expectedPlayer && status.identity.player !== expectedPlayer) ||
      (text(status.agent?.details?.username) && status.agent.details.username !== status.identity.player)) return unavailable('Agent 身份与玩家连接不一致')
  if (status.agent?.available !== true || status.agent.source !== 'caller_injected') {
    return unavailable(status.agent?.reason === 'AGENT_STATUS_NOT_PROVIDED' ? '此连接尚未提供 Agent 状态' : 'Agent 状态暂不可用')
  }
  const details = status.agent.details
  if (!details || typeof details !== 'object' || Array.isArray(details)) return unavailable('Agent 状态格式不可用')
  const receipts = Array.isArray(details.receipts) ? details.receipts : []
  const last = receipts.at(-1), result = last?.result
  const action = [text(last?.action?.type), text(last?.action?.operation)].filter(Boolean).join(' / ')
  let receipt = '未收到'
  if (result && typeof result === 'object') {
    if (result.outcome === 'unknown' || result.outcomeUnknown === true || result.outcomeKnown === false) receipt = '结果未知'
    else if (result.ok === true) receipt = 'ok=true'
    else if (result.ok === false) receipt = 'ok=false'
    else receipt = '结果未注明'
    if (result.effectVerified === false) receipt += ' · 效果未验证'
    if (text(result.code)) receipt += ' · ' + result.code
  }
  const mode = text(details.mode)
  const modelNotice = mode === 'model_rate_backoff'
    ? '模型请求暂受限制，退避等待后重试；游戏连接仍在线'
    : mode?.startsWith('paused') && /\bMODEL_QUOTA_EXCEEDED\b/.test(text(details.lastError) || '')
    ? '模型接口返回请求限制错误，决策已暂停；游戏连接仍在线'
    : mode?.startsWith('paused') && details.modelTask?.status === 'failed' ? '决策已暂停；最近一次模型任务失败，游戏连接仍在线' : ''
  return { available: true, name: text(details.username) || status.identity.player,
    mode: mode ? `${MODES[mode] || mode} (${mode})` : '未提供', goal: text(details.goal) || '未提供',
    action: action || '未收到动作回执', receipt, receiptAt: timestamp(last?.at), decisionAt: timestamp(details.lastDecision?.at),
    notice: status.connection?.ended ? '玩家连接已断开；以下为最后收到的状态' : details.online === false ? '尚未进入游戏' : modelNotice }
}

export function renderAgentStatus (view, element) {
  for (const [field, id] of Object.entries({ name: 'agent-name', mode: 'agent-mode', goal: 'agent-goal', action: 'agent-action',
    receipt: 'agent-receipt', receiptAt: 'agent-receipt-at', decisionAt: 'agent-decision-at', notice: 'agent-notice' })) {
    const target = element(id)
    if (!target) continue
    target.textContent = compact(view[field])
    target.title = view[field]
  }
}

// GET only. Schedule after each response to prevent overlapping requests; the
// timeout clears stale fields instead of leaving an old "acting" indicator.
export function startAgentStatusPolling ({ fetchStatus, onView, expectedPlayer = () => null, intervalMs = 2000,
  setTimer = setTimeout, clearTimer = clearTimeout }) {
  if (!Number.isInteger(intervalMs) || intervalMs < 1000 || intervalMs > 3000) throw Error('AGENT_STATUS_POLL_INTERVAL_INVALID')
  let stopped = false, next = null, timeout = null, controller = null
  async function poll () {
    controller = new AbortController()
    timeout = setTimer(() => controller?.abort(), 3000)
    try {
      const response = await fetchStatus(controller.signal)
      if (!response.ok) throw Error('AGENT_STATUS_HTTP_UNAVAILABLE')
      const status = await response.json()
      if (!stopped) onView(agentStatusView(status, expectedPlayer()))
    } catch {
      if (!stopped) onView(unavailable('Agent 状态接口暂不可用'))
    } finally {
      clearTimer(timeout); timeout = null; controller = null
      if (!stopped) next = setTimer(poll, intervalMs)
    }
  }
  void poll()
  return () => { stopped = true; clearTimer(next); clearTimer(timeout); controller?.abort() }
}
