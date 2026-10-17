import { AgentActivityHistory } from './agent-activity.js';
import { AGENT_DECISION_COLORS, AGENT_DECISION_LABELS } from './agent-visual-protocol.js';
const stateLabels = { started: '开始', accepted: '已受理', running: '执行中', completed: '完成', failed: '失败', cancelled: '取消', unknown: '未确认' };
const kindLabels = { reasoning: '思考', message: '回应', tool: '工具调用', execution: '执行终态', decision: '快决策', phase: '当前状态' };
/** Only render text actually supplied by the host. Details stay collapsed by default. */
export function installAgentActivity({ socket, document, window, visible = () => true } = {}) {
  const history = new AgentActivityHistory(), listeners = [], roots = []; let disposed = false, scheduled = null, connected = false;
  const make = (tag, parent, className = '', text = '') => { const el = document.createElement(tag); el.className = className; el.textContent = text; parent.append(el); return el; };
  const panel = make('section', document.body, 'agent-activity-panel'); panel.id = 'agent-activity'; roots.push(panel);
  const header = make('div', panel, 'agent-activity-header'); make('strong', header, '', '思考与工具');
  const live = make('span', header, 'agent-activity-live', '等待宿主记录'); live.setAttribute('aria-live', 'polite');
  const details = make('details', panel, 'agent-activity-timeline');
  const summary = make('summary', details, '', '展开决策记录');
  const hint = make('p', details, 'agent-activity-hint', '显示模型返回的思考和真实调用；“已受理”不等于游戏动作完成。');
  const list = make('div', details, 'agent-activity-list'); list.setAttribute('role', 'log');
  const rows = new Map();
  const style = make('style', document.head); roots.push(style);
  const nonce = document.querySelector('meta[name="viewer-style-nonce"]')?.content; if (nonce) style.nonce = nonce;
  style.textContent = `#agent-activity{width:min(360px,calc(100vw - 32px));box-sizing:border-box;background:#101d2dea;color:#e6edf7;border:1px solid #52677f99;border-radius:12px;padding:11px;font:13px/1.5 system-ui;pointer-events:auto} .agent-activity-header{display:flex;justify-content:space-between;gap:10px}.agent-activity-live{font-size:11px;color:#aabbd1}.agent-activity-timeline>summary{cursor:pointer;color:#b8d8ff;padding-top:6px}.agent-activity-hint{font-size:11px;color:#9eb0c6;margin:6px 0}.agent-activity-list{max-height:min(48vh,500px);overflow:auto;overscroll-behavior:contain;scrollbar-width:thin}.agent-activity-row{border-left:3px solid #8190a4;background:#192a4099;border-radius:4px;margin:7px 0;padding:6px 8px;overflow-wrap:anywhere}.agent-activity-row>summary{cursor:pointer;white-space:normal}.agent-activity-row pre{white-space:pre-wrap;word-break:break-word;font:11px/1.5 ui-monospace,monospace;margin:6px 0;max-height:260px;overflow:auto}.agent-activity-meta{font-size:10px;color:#aebcd0}.agent-activity-section{font-size:11px;color:#c6d5e9;margin-top:7px}.agent-activity-preview{margin-top:3px;color:#e0e9f8;font-size:12px}body:not([data-viewer-layout]) #agent-activity{position:fixed;top:116px;right:14px;z-index:35}`;
  function updateRow(row) {
    let entry = rows.get(row.id);
    if (!entry) { const root = make('details', list, 'agent-activity-row'); const head = make('summary', root); const meta = make('div', root, 'agent-activity-meta'); const body = make('div', root); entry = { root, head, meta, body, signature: '' }; rows.set(row.id, entry); }
    const signature = JSON.stringify(row); if (entry.signature === signature) return; entry.signature = signature;
    entry.root.dataset.source = row.source; entry.root.dataset.status = row.status;
    entry.root.style.borderLeftColor = AGENT_DECISION_COLORS[row.source] || '#8190a4';
    entry.head.textContent = `${AGENT_DECISION_LABELS[row.source] || '来源未知'} · ${kindLabels[row.kind]} · ${row.title} · ${stateLabels[row.status]}`;
    entry.meta.textContent = [new Date(row.at).toLocaleTimeString(), row.model, row.round !== undefined ? `轮次 ${row.round}` : '', row.callId ? `调用 ${row.callId}` : '', row.taskId ? `任务 ${row.taskId}` : '', row.durationMs !== undefined ? `${(row.durationMs / 1000).toFixed(1)}s` : ''].filter(Boolean).join(' · ');
    entry.body.replaceChildren();
    const section = (title, value) => { make('div', entry.body, 'agent-activity-section', title); make('pre', entry.body, '', typeof value === 'string' ? value : JSON.stringify(value, null, 2)); };
    if (row.text) section(row.kind === 'reasoning' ? '模型返回的思考文本' : '记录', row.text);
    if (row.kind === 'reasoning' && !row.text) section('思考文本', '服务未返回可展示的思考文本');
    if (row.arguments !== undefined) section('调用参数', row.arguments);
    if (row.result !== undefined) section('工具回执', row.result);
  }
  function render() {
    scheduled = null; if (disposed) return; panel.hidden = !visible('agentActivity');
    const records = history.snapshot(), ids = new Set(records.map(row => row.id));
    for (const [id, entry] of rows) if (!ids.has(id)) { entry.root.remove(); rows.delete(id); }
    for (const row of records) updateRow(row);
    const latest = records.at(-1); live.textContent = connected ? (latest ? `${kindLabels[latest.kind]} · ${stateLabels[latest.status]}` : '已连接，等待记录') : (records.length ? '连接断开 · 历史记录' : '等待宿主记录');
    summary.textContent = `展开决策记录（最近 ${records.length} 条）`;
  }
  function schedule() { if (scheduled === null && !disposed) scheduled = window.setTimeout(render, 100); }
  function on(name, fn) { socket.on(name, fn); listeners.push([name, fn]); }
  on('agentActivity', frame => {
    if (frame?.schema !== 'agent-activity-frame/v1' || !Array.isArray(frame.records)) return;
    connected = frame.available !== false;
    if (frame.reset) history.clear();
    for (const row of frame.records.slice(-80)) history.put(row);
    schedule();
  });
  on('disconnect', () => { connected = false; schedule(); });
  const refresh = window.setInterval(() => { panel.hidden = !visible('agentActivity'); }, 1000);
  function dispose() { if (disposed) return; disposed = true; for (const [name, fn] of listeners) socket.off(name, fn); if (scheduled !== null) window.clearTimeout(scheduled); window.clearInterval(refresh); for (const root of roots) root.remove(); window.removeEventListener('pagehide', dispose); }
  window.addEventListener('pagehide', dispose, { once: true }); render();
  return { dispose, snapshot: () => history.snapshot(), render };
}
