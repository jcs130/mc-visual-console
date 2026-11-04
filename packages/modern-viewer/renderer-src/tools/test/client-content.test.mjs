import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {once} from 'node:events';import {createRequire} from 'node:module';
import {createClientContentStream,normalizeContentScope,normalizeContentPanels} from '../../host/client-content-stream.mjs';
import {agentActivityPanels} from '../../host/agent-content.mjs';
import {corticoContentRecords,corticoContentPhase} from '../../../../../hosts/cortico/content-records.mjs';
const {WebSocket,WebSocketServer}=createRequire(import.meta.url)(process.env.MCVISUAL_TEST_WS_MODULE||'ws');
const scope={instanceId:'fixture',epoch:1,server:'offline',recipientUuid:'11111111-1111-1111-1111-111111111111',subjectUuid:'22222222-2222-2222-2222-222222222222',entityId:5,dimension:'minecraft:overworld'};
const panel=title=>[{id:'fixture',title,anchor:'bottom_left',width:180,bottomInset:40,rows:[{label:'动作',text:'测试',tone:'info'}]}];
test('native HUD shows actual model wait and current body independently, without stale action claims',()=>{
 const now=Date.now(),ts=new Date(now).toISOString(),at=new Date(now-180000).toISOString();
 const records=corticoContentRecords([{ts,area:'worlds.mymc',run:'fixture',event:'body-status',data:{id:'current-body',kind:'phase',status:'unknown',at,title:'身体：空闲，等待任务',result:{schema:'body-status/v1',expiresAt:new Date(now+6000).toISOString()}}}],{now});
 const phase=corticoContentPhase({loop:{phase:{state:'model',round:6,enteredAt:new Date(now-33000).toISOString()}}},{now});
 const p=agentActivityPanels({name:'Agent',records,phase,now});
 assert.match(p[0].rows[0].text,/33秒/);assert.match(p[0].rows[1].text,/空闲.*180秒/);
 assert.equal(agentActivityPanels({records,now:now+7000})[0].rows.some(r=>r.label==='身体'),false);
});
const subscription=(s=scope,sequence=1)=>({schema:'mcvisual.subscribe/v1',sequence,scope:s,subjectName:'Agent',capabilities:['panels/v1']});
async function fixture(getPanels,authorizeScope){
 const http=createServer((req,res)=>res.writeHead(404).end());const stream=createClientContentStream({WebSocketServer,server:http,getPanels,authorizeScope,intervalMs:250});
 http.listen(0,'127.0.0.1');await once(http,'listening');
 const ws=new WebSocket('ws://127.0.0.1:'+http.address().port+'/content');ws.on('error',()=>{});await once(ws,'open');
 return{ws,stream,async close(){ws.terminate();await stream.close();await new Promise(r=>http.close(r));}};
}
test('real WebSocket subscription delivers bounded context-bound frames without file transport',async()=>{
 const f=await fixture(()=>panel('公开卡片'));try{const wait=once(f.ws,'message');f.ws.send(JSON.stringify(subscription()));const [data]=await wait,v=JSON.parse(data);assert.equal(v.schema,'mcvisual.content/v1');assert.deepEqual(v.scope,scope);assert.equal(v.panels[0].title,'公开卡片');assert.equal(v.expiresAt-v.issuedAt,3500);assert.equal(f.stream.stats().sent,1);}finally{await f.close();}
});
test('unknown commands and unauthorized target subscriptions cannot invoke a producer',async()=>{
 for(const value of [{schema:'mcvisual.command/v1',command:'attack'},subscription({...scope,subjectUuid:'33333333-3333-3333-3333-333333333333'})]){
  let calls=0;const f=await fixture(()=>{calls++;return panel('wrong');},s=>s.subjectUuid===scope.subjectUuid);try{const close=once(f.ws,'close');f.ws.send(JSON.stringify(value));const [code]=await close;assert.equal(code,1008);assert.equal(calls,0);}finally{await f.close();}
 }
});
test('switching target aborts an old projection and never labels late old content with the new subject',async()=>{
 let release,started;const began=new Promise(r=>started=r);const gate=new Promise(r=>release=r);let oldSignal;
 const f=await fixture(async({scope:s,signal})=>{if(s.epoch===1){oldSignal=signal;started();await gate;return panel('OLD');}return panel('NEW');});
 try{f.ws.send(JSON.stringify(subscription()));await began;const messages=[];f.ws.on('message',d=>messages.push(JSON.parse(d)));f.ws.send(JSON.stringify(subscription({...scope,epoch:2},2)));await new Promise(r=>setTimeout(r,40));assert.equal(oldSignal.aborted,true);release();await new Promise(r=>setTimeout(r,350));assert.ok(messages.length>0);assert.ok(messages.every(v=>v.scope.epoch===2&&v.panels[0].title==='NEW'));}finally{release();await f.close();}
});
test('server close aborts pending projection and a late resolution cannot revive the stream',async()=>{
 let release,start;const began=new Promise(r=>start=r),gate=new Promise(r=>release=r);let signal;
 const f=await fixture(async x=>{signal=x.signal;start();await gate;return panel('late');});f.ws.send(JSON.stringify(subscription()));await began;await f.close();release();await new Promise(r=>setImmediate(r));assert.equal(signal.aborted,true);assert.equal(f.stream.stats().sent,0);assert.equal(f.stream.stats().stopped,true);
});
test('display contracts reject remote/executable widgets, duplicate docks, false numeric values and missing scope',()=>{
 assert.equal(normalizeContentScope({...scope,epoch:1.5}),null);assert.equal(normalizeContentScope({...scope,subjectUuid:'name-only'}),null);
 for(const mutate of [p=>p[0].html='<script/>',p=>p[0].rows[0].progress='0.5',p=>p.push({...p[0],id:'second'}),p=>p[0].width=10000]){const p=panel('x');mutate(p);assert.throws(()=>normalizeContentPanels(p));}
});
test('audience projection omits reasoning and credentials, preserves explicit probability and acceptance semantics',()=>{
 const now=Date.now(),at=new Date(now).toISOString();const p=agentActivityPanels({name:'Agent',now,records:[
  {id:'private',kind:'reasoning',at,text:'HIDDEN_THOUGHT',status:'completed'},
  {id:'d',kind:'decision',at,title:'保持当前',status:'accepted',source:'system1',result:{probability:.82,displayStatus:'已下发，完成另验'}},
  {id:'t',kind:'tool',at,title:'/login secret-value',status:'accepted'}]});
 assert.equal(p[0].rows[0].progress,.82);assert.match(p[0].rows[0].label,/82%/);assert.match(p[0].rows[1].text,/已受理/);assert.ok(!JSON.stringify(p).includes('HIDDEN_THOUGHT'));assert.ok(!JSON.stringify(p).includes('secret-value'));
});
test('a changed combat scene is not executed; enqueue/start and unknown query remain separate outcomes',()=>{
 const now=Date.now(),ts=new Date(now).toISOString(),base={ts,area:'worlds.mymc',run:'fixture'};
 const r=corticoContentRecords([{...base,seq:1,event:'host.combat.result',data:{candidate:{kind:'engage'},probability:.9,outcome:'scene-changed',application:{dispatched:false}}},
 {...base,seq:2,event:'enqueue',msg:'受理任务#17',data:{steps:[{skill:'mine'}]}},{...base,seq:3,event:'start',msg:'开始任务#17',data:{steps:[{skill:'mine'}]}},
 {...base,seq:4,event:'minecraft.event',data:{meta:{serverQuery:{requestId:'query',outcomeUnknown:true}}}}],{now});
 assert.equal(r.length,3);assert.equal(r[0].status,'unknown');assert.match(r[0].result.displayStatus,/未采用/);assert.equal(r[1].taskId,'17');assert.equal(r[1].status,'running');assert.equal(r[2].status,'unknown');assert.ok(r.every(x=>x.status!=='completed'));
});
