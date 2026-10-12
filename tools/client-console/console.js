const $ = selector => document.querySelector(selector);
const labels = { disconnected:'未连接', starting:'正在连接', started:'环境已启动', stopping:'正在关闭', idle:'待连接',
  'not-required':'离线账号', authenticating:'正在验证', 'awaiting-user':'等待微软授权', ready:'正版验证完成', failed:'验证失败', stopped:'已停止' };
let controlToken = '', inFlight = false;
const node = (tag, text, className) => { const item = document.createElement(tag); if (text !== undefined) item.textContent = text; if (className) item.className = className; return item; };
function actionButton(label, action, disabled) { const button = node('button', label, 'quiet'); button.dataset.action = action; button.disabled = disabled; return button; }
function safeLink(url) { try { const value = new URL(url); return ['http:', 'https:'].includes(value.protocol) && !value.username && !value.password ? value.href : null; } catch { return null; } }
export function renderClientState(state) {
  const connection = state.connection ?? {}, server = connection.server ?? {}, accounts = connection.accounts ?? {};
  $('#phase').textContent = labels[state.runtime?.phase] ?? '状态未知';
  $('#address').textContent = server.host ? `${server.host}:${server.port}` : '请配置服务器';
  $('#version').textContent = `${server.actualVersion ? `已协商 Java ${server.actualVersion}` : '协议尚未验证'} · ${server.requestedVersion === 'auto' ? '自动识别版本' : `指定 ${server.requestedVersion ?? '—'}`}`;
  const target = $('#accounts'); target.replaceChildren();
  for (const [key, title] of [['agent','Agent 游戏连接'], ['observer','观察者客户端'], ['player','玩家客户端']]) {
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
  $('#asset-note').textContent = '随包现代画面资源：Java 1.20.6。其他版本需匹配的资源包或使用基础画面。';
  $('[data-action="connect"]').disabled = state.runtime?.phase !== 'disconnected';
  $('[data-action="disconnect"]').disabled = state.runtime?.phase === 'disconnected' || state.runtime?.phase === 'stopping';
  const failed = Object.values(state.operations ?? {}).find(value => value.status === 'failed');
  $('#notice').textContent = failed?.error ?? '';
  $('#updated').textContent = `采样 ${new Date().toLocaleTimeString()}`;
}
async function refresh() {
  if (inFlight) return; inFlight = true;
  try { const response = await fetch('/api/client', { cache:'no-store' }); if (!response.ok) throw Error(); const state = await response.json(); controlToken = state.controlToken; renderClientState(state); }
  catch { $('#notice').textContent = '连接台暂时不可用，当前游戏状态未验证。'; }
  finally { inFlight = false; }
}
document.addEventListener('click', async event => {
  const button = event.target.closest?.('button[data-action]'); if (!button || button.disabled || !controlToken) return;
  button.disabled = true;
  try { const response = await fetch('/api/client/action', { method:'POST', headers:{'content-type':'application/json','x-mc-control':controlToken}, body:JSON.stringify({action:button.dataset.action}) }); if (!response.ok) throw Error(); await refresh(); }
  catch { $('#notice').textContent = '操作未受理，请重新读取状态。'; }
});
if (!globalThis.__MC_CONSOLE_TEST__) { await refresh(); setInterval(refresh, 1500); }
