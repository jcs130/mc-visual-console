import { strict as assert } from 'node:assert';
import { test } from 'node:test';

// A small DOM port verifies data rendering without a game/account in CI.
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.disabled = false; this.textContent = ''; this.attributes = new Map(); this.writes = 0; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes.set(name, value); this.writes++; }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
}
const elements = new Map();
globalThis.document = {
  querySelector: selector => { if (!elements.has(selector)) elements.set(selector, new Element('div')); return elements.get(selector); },
  createElement: tag => new Element(tag), addEventListener() {}, querySelectorAll: () => [],
};
globalThis.__MC_CONSOLE_TEST__ = true;
const { renderClientState, viewerUrl, showView } = await import('../console.js');
const descendants = element => [element, ...element.children.flatMap(descendants)];
const all = selector => descendants(elements.get(selector));
const base = { runtime: { phase: 'started' }, configuredAccounts: { agent: 'AccountAlias' },
  connection: { server: { host: 'demo.test', port: 25565, requestedVersion: 'auto', actualVersion: null },
    accounts: { agent: { mode: 'microsoft', phase: 'awaiting-user', challenge: {
      userCode: 'FIXTURE-1234', verificationUri: 'https://www.microsoft.com/link', expiresAt: '2099-01-01T00:00:00Z',
    } } }, clients: { observer: { phase: 'starting', windowReady: false, versionId: '1.21.1' } } }, links: [] };

test('separates pending OAuth, negotiated protocol and process/window readiness', () => {
  renderClientState(base);
  assert.match(elements.get('#version').textContent, /协议尚未验证/);
  assert.ok(all('#accounts').some(n => n.textContent === 'FIXTURE-1234'));
  assert.ok(all('#accounts').some(n => n.textContent.includes('正在准备窗口')));
  assert.equal(all('#accounts').find(n => n.dataset.action === 'observer.start').disabled, true);
  assert.equal(all('#accounts').find(n => n.dataset.action === 'observer.stop').disabled, false);
  renderClientState({ ...base, connection: { ...base.connection, server: { ...base.connection.server, actualVersion: '1.21.1' },
    accounts: { agent: { mode: 'microsoft', phase: 'ready', profile: { name: 'ActualName' } } } } });
  assert.match(elements.get('#version').textContent, /已协商 Java 1.21.1/);
  assert.ok(all('#accounts').some(n => n.textContent.includes('ActualName')));
  assert.ok(!all('#accounts').some(n => n.tagName === 'code'));
});
test('uses text nodes and rejects scripts, remote device-login pages and credential URLs', () => {
  const hostile = '<img src=x onerror=alert(1)>';
  renderClientState({ ...base, connection: { ...base.connection, accounts: { agent: { mode: 'microsoft', phase: 'failed',
    detail: hostile, challenge: { ...base.connection.accounts.agent.challenge, verificationUri: 'https://evil.test/login' } } } },
    links: [{ href: 'javascript:alert(1)', label: 'bad' }, { href: 'https://name:secret@example.test', label: 'bad' },
      { href: 'http://127.0.0.1:7798/', label: hostile }] });
  assert.ok(all('#accounts').some(n => n.textContent === hostile));
  assert.equal(all('#accounts').filter(n => n.tagName === 'a').length, 0);
  assert.equal(all('#views').filter(n => n.tagName === 'a').length, 1);
  assert.equal(all('#views').find(n => n.tagName === 'a').textContent, hostile);
  assert.equal(all('#views').find(n => n.tagName === 'a').rel, 'noreferrer noopener');
});
test('disconnect removes stale challenges, ready profiles and viewer links', () => {
  renderClientState({ runtime: { phase: 'disconnected' }, configuredAuthentication: { agent: 'microsoft' }, connection: {} });
  assert.equal(elements.get('[data-action="connect"]').disabled, false);
  assert.equal(elements.get('[data-action="disconnect"]').disabled, true);
  assert.equal(all('#accounts').filter(n => n.tagName === 'a' || n.tagName === 'code').length, 0);
  assert.match(elements.get('#version').textContent, /未验证/);
});
test('embeds only an actually ready same-agent local viewer and does not reconnect it on each poll', () => {
  const state = {...base, host:{model:'deepseek-flash',reasoningEffort:'off',name:'Fixture',coreVersion:'fixture-core',adapterVersion:'fixture-host'},
    connection:{...base.connection,connection:{ready:true}}, links:[{href:'http://127.0.0.1:17852/'}]};
  renderClientState(state); const frame = elements.get('#game-frame'), writes = frame.writes;
  assert.equal(frame.getAttribute('src'), 'http://127.0.0.1:17852/');
  renderClientState(state); assert.equal(frame.writes,writes);
  assert.match(elements.get('#host-model').textContent,/deepseek-flash · 无思考/);
  for(const bad of ['http://remote.test:1234/','javascript:alert(1)','http://127.0.0.1:1234/metrics','http://user:pass@127.0.0.1:1234/'])
    assert.equal(viewerUrl({...state,links:[{href:bad}]}),null);
  assert.equal(viewerUrl({...state,host:{paused:true}}),null);
  assert.equal(viewerUrl({...state,connection:{connection:{ready:false}}}),null);
  showView('metrics'); assert.equal(frame.getAttribute('src'),null);
  showView('game'); assert.equal(frame.getAttribute('src'),'http://127.0.0.1:17852/');
  renderClientState({...state,runtime:{phase:'disconnected'},host:{paused:true}});
  assert.equal(frame.getAttribute('src'),null); assert.equal(frame.hidden,true);
  assert.equal(elements.get('#phase').textContent,'已暂停');
});
test('missing model settings remain unknown and connection help uses the primary version',()=>{
  renderClientState({runtime:{phase:'disconnected'}});
  assert.match(elements.get('#host-model').textContent,/模型未知.*设置未知/);
  assert.match(elements.get('#asset-note').textContent,/Java 1.21.1/);
});

test('a host can omit native launcher controls while preserving the Agent account and OAuth', () => {
  renderClientState({...base, capabilities:{nativeClients:false}});
  assert.ok(all('#accounts').some(n => n.textContent === 'Agent 游戏连接'));
  assert.ok(all('#accounts').some(n => n.textContent === 'FIXTURE-1234'));
  assert.equal(all('#accounts').filter(n => n.dataset.action).length, 0);
  assert.ok(!all('#accounts').some(n => /观察者客户端|玩家客户端/.test(n.textContent)));
});

test('a connected 1.21.11 game reports viewer failure honestly and never embeds a stale scene', () => {
  const state = {...base, connection:{...base.connection, connection:{ready:true},
    server:{actualVersion:'1.21.11',requestedVersion:'auto'},
    viewer:{phase:'failed',code:'VIEWER_ASSETS_MISSING',message:'缺少 Java 1.21.11 画面资源。'}},
    links:[{href:'http://127.0.0.1:17852/'}]};
  showView('game');renderClientState(state);
  assert.equal(elements.get('#game-frame').getAttribute('src'), null);
  assert.ok(all('#game-empty').some(n => n.textContent === '游戏已连接，画面加载失败'));
  assert.ok(all('#game-empty').some(n => n.textContent.includes('1.21.11')));
  renderClientState({...state,connection:{...state.connection,viewer:{phase:'starting'}}});
  assert.ok(all('#game-empty').some(n => n.textContent === '游戏已连接，正在准备画面'));
  renderClientState({...state,connection:{...state.connection,viewer:{phase:'ready'}}});
  assert.equal(elements.get('#game-frame').getAttribute('src'), 'http://127.0.0.1:17852/');
});
