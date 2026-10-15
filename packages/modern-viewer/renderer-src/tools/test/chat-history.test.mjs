import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';
import { shell } from './fixtures/native-console-dom.mjs';
import { installChatHistory } from '../../src/modern-viewer/chat-history.js';

const chatSource = readFileSync(new URL('../minecraft-viewer-chat.js',import.meta.url),'utf8');
const eventsSource = readFileSync(new URL('../minecraft-viewer-events.js',import.meta.url),'utf8');
function browser(search = '') {
  const document = shell(), handlers = new Map(), timers = new Map(); let index = 0;
  for (const node of document.querySelectorAll('div')) node.style.setProperty = () => {};
  const bars = document.createElement('div'); bars.id = 'corti-boss-bars'; document.body.append(bars);
  const context = createContext({ document, installChatHistory, URLSearchParams, location: { search }, Date,
    performance: { now: () => Date.now() },
    socket: { on(name,fn) { const list = handlers.get(name) ?? []; list.push(fn); handlers.set(name,list); } },
    setTimeout: fn => { const id = ++index; timers.set(id,fn); return id; }, clearTimeout: id => timers.delete(id),
  });
  runInContext(chatSource + '\n' + eventsSource,context);
  const emit = (name,data) => { for (const callback of handlers.get(name) ?? []) callback(data); };
  const say = (kind,text) => emit('gameMessage',{ kind,text });
  const root = document.querySelector('.corti-chat');
  const toggle = root?.querySelector('.corti-chat-toggle');
  const tab = key => root.querySelectorAll('button').find(button => button.dataset.channel === key).dispatch('click');
  return { document, root, emit, say, toggle, tab, timers,
    open: () => toggle.dispatch('click'), rows: () => document.querySelectorAll('.corti-chat-message') };
}
test('chat history keeps complete long messages and displays safe classified text',() => {
  const view=browser();
  view.say('chat','<img src=x onerror=steal()>');
  view.say('whisper','【地下城】私聊不会被当作服务器任务');
  view.say('system','【地下城结算】参战登记不足。下一步：'+'请查看缺席房间；'.repeat(60));
  view.say('system','MC_SITE_DUNGEON_STATE {"active":false,"reason":"completed"}');
  assert.match(view.toggle.textContent,/3 条未读/); view.open();
  assert.equal(view.rows().length,3); assert.equal(view.document.querySelectorAll('img').length,0);
  assert.ok(view.rows().at(-1).textContent.length>160);
  view.tab('whisper'); assert.equal(view.rows().length,1); assert.match(view.rows()[0].textContent,/不会被当作/);
  view.tab('task'); assert.equal(view.rows().length,1); assert.match(view.rows()[0].textContent,/参战登记不足/);
  view.tab('raw'); assert.equal(view.rows().length,1);
  assert.ok(view.rows()[0].querySelector('details')); assert.match(view.rows()[0].textContent,/MC_SITE_DUNGEON_STATE/);
  assert.doesNotMatch(view.document.getElementById('corti-event-feed').textContent,/MC_SITE_DUNGEON_STATE/);
});
test('search and clear act on this page only, with bounded raw and normal history',() => {
  const view=browser(); view.say('chat','保留的重要聊天');
  for(let i=0;i<100;i++)view.say('system',`MC_TEST_RESULT {"n":${i}}`);
  view.open(); assert.match(view.rows()[0].textContent,/保留的重要聊天/);
  view.tab('raw'); assert.equal(view.rows().length,40);
  view.tab('all');
  for(let i=0;i<230;i++)view.say('chat','第'+i+'条旅途记录');
  assert.equal(view.rows().length,200);
  const search=view.root.querySelector('input'); search.value='229'; search.dispatch('input');
  assert.equal(view.rows().length,1); assert.match(view.rows()[0].textContent,/229/);
  view.root.querySelectorAll('button').find(x=>x.textContent==='清空').dispatch('click');
  assert.equal(view.rows().length,0); assert.equal(search.value,'');
});
test('same attested subject keeps history; changed subject, detached Eye and disconnect clear it',() => {
  const view=browser(), session={mode:'observer',attached:true,playerUuid:'a',entityId:7,worldUuid:'w'};
  view.emit('viewerSession',session); view.say('whisper','角色 A 的私聊'); view.say('actionbar','A 的操作'); view.open();
  view.emit('viewerSession',{...session,windowOpen:false}); assert.equal(view.rows().length,1);
  view.emit('viewerSession',{...session,playerUuid:'b',entityId:8}); assert.equal(view.rows().length,0);
  assert.equal(view.document.getElementById('corti-event-feed').children.length,0);
  assert.equal(view.document.getElementById('corti-actionbar').hidden,true);
  view.say('whisper','角色 B 的私聊'); assert.equal(view.rows().length,1);
  view.emit('viewerSession',{mode:'observer',attached:false}); view.say('whisper','迟到的旧消息');
  assert.equal(view.rows().length,0); assert.equal(view.document.getElementById('corti-event-feed').children.length,0);
  view.emit('viewerSession',{...session,playerUuid:'c'}); view.say('chat','C'); assert.equal(view.rows().length,1);
  view.emit('disconnect'); view.say('chat','断线迟到消息'); assert.equal(view.rows().length,0);
});
test('photo mode creates no history controls or history storage',() => {
  const view=browser('?photo=1'); assert.equal(view.root,null);
});
