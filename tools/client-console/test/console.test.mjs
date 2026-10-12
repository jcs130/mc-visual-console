import { strict as assert } from 'node:assert';
import { test } from 'node:test';

// A small DOM port verifies data rendering without a game/account in CI.
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.disabled = false; this.textContent = ''; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
}
const elements = new Map();
globalThis.document = {
  querySelector: selector => { if (!elements.has(selector)) elements.set(selector, new Element('div')); return elements.get(selector); },
  createElement: tag => new Element(tag), addEventListener() {},
};
globalThis.__MC_CONSOLE_TEST__ = true;
const { renderClientState } = await import('../console.js');
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
