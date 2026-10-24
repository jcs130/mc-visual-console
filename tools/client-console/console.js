import { renderMetrics } from './metrics.js';
import { renderExperiments } from './experiments.js';
const $ = selector => document.querySelector(selector);
const labels = { disconnected:'未连接', starting:'正在连接', started:'环境已启动', stopping:'正在关闭', idle:'待连接',
  'not-required':'离线账号', authenticating:'正在验证', 'awaiting-user':'等待微软授权', ready:'正版验证完成', failed:'验证失败', stopped:'已停止' };
let controlToken = '', instanceId = '', inFlight = false, selectedView = 'game', latestState;
const node = (tag, text, className) => { const item = document.createElement(tag); if (text !== undefined) item.textContent = text; if (className) item.className = className; return item; };
function actionButton(label, action, disabled) { const button = node('button', label, 'quiet'); button.dataset.action = action; button.disabled = disabled; return button; }
function safeLink(url) { try { const value = new URL(url); return ['http:', 'https:'].includes(value.protocol) && !value.username && !value.password ? value.href : null; } catch { return null; } }
export function viewerUrl(state) {
  if (state.host?.paused || state.runtime?.phase !== 'started' || state.connection?.connection?.ready !== true) return null;
  if (state.connection?.viewer?.phase && state.connection.viewer.phase !== 'ready') return null;
  for (const link of state.links ?? []) {
    try { const url = new URL(link.href); if (url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port && !url.username && !url.password
      && url.pathname === '/' && !url.search && !url.hash) return url.href; } catch { /* Unavailable is preferable to an unrelated frame. */ }
  }
  return null;
}
export function showView(view) {
  if (!['game', 'connection', 'metrics', 'experiments'].includes(view)) return;
  selectedView = view;
  for (const name of ['game', 'connection', 'metrics', 'experiments']) {
    $(`#${name}-panel`).hidden = view !== name;
    $(`#tab-${name}`).setAttribute('aria-selected', String(view === name));
  }
  renderViewer(latestState);
  if (view === 'metrics') void refreshMetrics();
  if (view === 'experiments') void refreshExperiments();
  if (!globalThis.__MC_CONSOLE_TEST__) history.replaceState(null,'',view==='game'?'/':'/#'+view);
}
function renderViewer(state) {
  const frame = $('#game-frame'), href = state && selectedView === 'game' ? viewerUrl(state) : null;
  if (href && frame.getAttribute('src') !== href) frame.setAttribute('src', href);
  if (!href) frame.removeAttribute('src'); // No background WebGL/socket or stale disconnected scene.
  frame.hidden = !href; $('#game-empty').hidden = !!href;
  const empty = $('#game-empty');
  if (!href) {
    const viewer = state?.connection?.viewer, ready = state?.connection?.connection?.ready === true;
    let title = '尚未连接游戏', detail = '连接后显示同一 Agent 的实时画面；打开面板不会发起模型推理。';
    if (!state) { title = '连接状态未知'; detail = '等待连接台恢复，当前游戏与画面状态尚未验证。'; }
    else if (state.host?.paused) { title = 'Agent 已暂停'; detail = '恢复连接后显示实时画面。'; }
    else if (ready) {
      title = viewer?.phase === 'failed' ? '游戏已连接，画面加载失败' : viewer?.phase === 'disabled' ? '游戏已连接，网页画面未启用' : '游戏已连接，正在准备画面';
      detail = viewer?.message || '画面使用实际协商版本的资源；游戏连接状态与画面加载状态分别检查。';
    } else if (state.runtime?.phase === 'starting' || state.runtime?.phase === 'started') {
      title = '等待游戏连接就绪'; detail = '正在连接或等待服务器认证，尚未进入可行动状态。';
    }
    empty.replaceChildren(node('strong', title), node('p', detail));
  }
}
export function renderClientState(state) {
  latestState = state;
  const connection = state.connection ?? {}, server = connection.server ?? {}, accounts = connection.accounts ?? {};
  $('#phase').textContent = state.host?.paused ? '已暂停' : labels[state.runtime?.phase] ?? '状态未知';
  $('#agent-name').textContent = state.host?.name || 'Minecraft Agent';
  const effort = state.host?.reasoningEffort;
  $('#host-model').textContent = `${state.host?.model ?? '模型未知'} · ${effort === 'off' || effort === 'none' ? '无思考' : effort ? `思考 ${effort}` : '思考设置未知'}`;
  $('#host-note').textContent = state.host?.paused ? 'Agent 已暂停。连接与账号中可恢复；会话、目标和记忆保留。' : `Agent 状态：${state.host?.state ?? '未知'} · 画面来自执行动作的同一连接。`;
  $('#build-version').textContent = `核心 ${state.host?.coreVersion ?? '未知'} · 适配器 ${state.host?.adapterVersion ?? '未知'}`;
  renderViewer(state);
  $('#address').textContent = server.host ? `${server.host}:${server.port}` : '请配置服务器';
  $('#version').textContent = `${server.actualVersion ? `已协商 Java ${server.actualVersion}` : '协议尚未验证'} · ${server.requestedVersion === 'auto' ? '自动识别版本' : `指定 ${server.requestedVersion ?? '—'}`}`;
  const target = $('#accounts'); target.replaceChildren();
  const nativeClients = state.capabilities?.nativeClients !== false;
  $('#account-heading').textContent = nativeClients ? '账号与客户端' : 'Agent 账号';
  $('#account-note').textContent = nativeClients ? '各账号分别授权' : '同一连接提供游戏画面';
  $('#native-setup-help').hidden = !nativeClients;
  $('#account-identity-help').textContent = '账号标识用于本地缓存；实际游戏名以验证结果为准。' + (nativeClients ? 'Agent、观察者和玩家同时进服需要不同账号。观察者附身由服务器权限或插件决定。' : '网页画面不需要另开游戏客户端或额外账号。');
  for (const [key, title] of [['agent','Agent 游戏连接'], ['observer','观察者客户端'], ['player','玩家客户端']]) {
    if (key !== 'agent' && state.capabilities?.nativeClients === false) continue;
    const account = accounts[key] ?? {}, profile = account.profile, client = connection.clients?.[key];
    const row = node('div', undefined, 'account'), head = node('div', undefined, 'account-head');
    head.append(node('span', undefined, `dot ${account.phase ?? 'idle'}`), node('span', title, 'account-name'),
      node('span', (account.mode ?? state.configuredAuthentication?.[key]) === 'microsoft' ? '微软正版' : '离线', 'account-mode'));
    row.append(head, node('div', profile ? `${profile.name} · ${labels[account.phase] ?? account.phase}`
      : `${state.configuredAccounts?.[key] ?? '未设置'} · ${labels[account.phase ?? 'idle']}`, 'account-meta'));
    if (account.challenge) {
      const challenge = account.challenge, box = node('div', undefined, 'challenge'), info = node('div');
      info.append(node('code', challenge.userCode), node('p', `有效至 ${new Date(challenge.expiresAt).toLocaleTimeString()}`)); box.append(info);
      const href = safeLink(challenge.verificationUri);
      if (href && new URL(href).protocol === 'https:' && ['microsoft.com','www.microsoft.com','login.microsoftonline.com'].includes(new URL(href).hostname)) {
        const link = node('a', '打开微软授权', 'authorize'); link.href = href; link.target = '_blank'; link.rel = 'noreferrer noopener'; box.append(link);
      }
      row.append(box);
    }
    if (account.detail) row.append(node('div', account.detail, 'client-detail'));
    if (client) row.append(node('p', `${client.windowReady ? '窗口已就绪' : client.phase === 'starting' ? '正在准备窗口' : client.phase === 'running' ? '进程运行中' : client.phase === 'error' ? '客户端未启动' : '窗口未启动'} · ${client.versionId || '尚未选择安装版本'}`, 'account-meta'));
    if (client?.detail) row.append(node('div', client.detail, 'client-detail'));
    if (key !== 'agent') { const actions = node('div', undefined, 'actions'); actions.append(actionButton('启动窗口', `${key}.start`, state.runtime?.phase !== 'started' || client?.phase === 'starting' || client?.phase === 'running'), actionButton('关闭窗口', `${key}.stop`, !client || client.phase === 'stopped')); row.append(actions); }
    target.append(row);
  }
  const views = $('#views'); views.replaceChildren();
  for (const value of state.links ?? []) { const href = safeLink(value.href); if (!href) continue; const link = node('a', value.label || '游戏画面'); link.href = href; link.target = '_blank'; link.rel = 'noreferrer noopener'; views.append(link); }
  if (!views.children.length) views.append(node('span', '画面就绪后显示入口', 'empty'));
  $('#asset-note').textContent = '自动识别服务器协议；网页画面使用实际版本的资源。Java 1.21.1 是主要维护版本，不限制游戏连接版本。';
  $('[data-action="connect"]').disabled = state.runtime?.phase !== 'disconnected';
  $('[data-action="disconnect"]').disabled = state.runtime?.phase === 'disconnected' || state.runtime?.phase === 'stopping';
  const failed = Object.values(state.operations ?? {}).find(value => value.status === 'failed');
  $('#notice').textContent = failed?.error ?? '';
  for (const button of document.querySelectorAll('button[data-action]')) if (state.operations?.[button.dataset.action]?.status === 'running') button.disabled = true;
  $('#updated').textContent = `采样 ${new Date().toLocaleTimeString()}`;
}
async function refresh() {
  if (inFlight) return; inFlight = true;
  try { const response = await fetch('/api/client', { cache:'no-store' }); if (!response.ok) throw Error(); const state = await response.json(); controlToken = state.controlToken; instanceId = state.instanceId; renderClientState(state); }
  catch { controlToken = ''; latestState = undefined; renderViewer(); $('#phase').textContent = '状态未知'; $('#host-model').textContent = '数据已过期 · 等待连接恢复'; $('#notice').textContent = '连接台暂时不可用，当前游戏状态未验证。'; }
  finally { inFlight = false; }
}
document.addEventListener('click', async event => {
  const tab = event.target.closest?.('button[data-view]'); if (tab) { showView(tab.dataset.view); return; }
  const button = event.target.closest?.('button[data-action]'); if (!button || button.disabled || !controlToken) return;
  button.disabled = true;
  try { const response = await fetch('/api/client/action', { method:'POST', headers:{'content-type':'application/json','x-mc-control':controlToken,'x-mc-instance':instanceId}, body:JSON.stringify({action:button.dataset.action}) }); if (!response.ok) throw Error(); await refresh(); }
  catch { $('#notice').textContent = '操作未受理，请重新读取状态。'; }
});
let metricsPending = false;
async function refreshMetrics() {
  if (metricsPending || globalThis.__MC_CONSOLE_TEST__) return; metricsPending = true;
  try { const response = await fetch('/api/harness/metrics', { cache:'no-store' }); if (!response.ok) throw Error(); renderMetrics(await response.json()); }
  catch { $('#models').replaceChildren(); $('#tools').replaceChildren(); $('#coverage').textContent = '指标未知：连接已中断或数据已过期。'; }
  finally { metricsPending = false; }
}
let experimentsPending = false;
async function refreshExperiments() {
  if(experimentsPending || globalThis.__MC_CONSOLE_TEST__) return; experimentsPending=true;
  try { const r=await fetch('/api/experiments',{cache:'no-store'}); if(!r.ok)throw Error(); renderExperiments(await r.json()); }
  catch {renderExperiments(null);}finally{experimentsPending=false;}
}
if (!globalThis.__MC_CONSOLE_TEST__) { showView(location.hash.slice(1)||'game'); setInterval(()=>{if(selectedView==='experiments'&&!document.hidden)void refreshExperiments();},2000); await refresh(); setInterval(refresh, 1500); setInterval(() => { if (selectedView === 'metrics' && !document.hidden) void refreshMetrics(); }, 2000); }
