import {test} from 'node:test';
import assert from 'node:assert/strict';
class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.textContent='';}
  append(...n){this.children.push(...n);}replaceChildren(...n){this.children=n;}setAttribute(k,v){this.attributes[k]=v;}
}
const elements=new Map();
globalThis.document={getElementById:id=>{if(!elements.has(id))elements.set(id,new Element('div'));return elements.get(id);},createElement:tag=>new Element(tag),addEventListener(){}};
const {renderExperiments,selectExperiment}=await import('../experiments.js');
const all=e=>[e,...e.children.flatMap(all)],texts=id=>all(elements.get(id)).map(n=>n.textContent).join('\n');
const assessment=achieved=>({achieved,measurements:{distance:achieved?0.2:5,gained:null,healthLoss:0,elapsedMs:100}});
const job={id:'walk',methodId:'walk-method',status:'completed',phase:'settled',stale:false,startedAt:1000,endedAt:2000,
  mode:'parallel',k:2,budget:{modelCalls:12,trials:10,wallMs:60000},modelCalls:6,trials:8,memory:'stored',
  usage:{inputTokens:null,outputTokens:200,cachedTokens:null,returnedCalls:6,usageSamples:5},
  result:{eligible:true,evidenceCount:8,train:{baseline:assessment(false),candidate:assessment(true)},holdout:[{caseId:'test',baseline:assessment(false),candidate:assessment(true)}]},
  timeline:[{id:'a'.repeat(64),kind:'trial',group:'holdout',role:'candidate',phase:'returned',caseId:'test',assessment:assessment(true),startedAt:1000,endedAt:1100}]};
const snapshot=jobs=>({schema:'agent-mc.experiments/v1',enabled:true,sampledAt:2000,jobs});
test('shows measured baseline/candidate/holdout without claiming live adoption; missing usage stays unknown',()=>{
  renderExperiments(snapshot([job]));const text=texts('experiment-detail');
  assert.match(text,/通过独立练习门槛/);assert.match(text,/未在线采用/);assert.match(text,/留出 · test/);
  assert.match(text,/原始基线/);assert.match(text,/未达成/);assert.match(text,/候选方案/);assert.match(text,/达成/);
  assert.match(text,/输入 — · 缓存输入 — · 输出 200/);assert.match(text,/游戏记忆：已写入/);
  assert.ok(!all(elements.get('experiment-detail')).some(n=>n.tagName==='button'||n.tagName==='a'));
});
test('switches configured experiments, renders text safely and preserves unknown in-flight effects',()=>{
  const id='<img src=x onerror=alert(1)>';
  renderExperiments(snapshot([job,{...job,id,status:'unknown',stale:true,result:null,phase:'probe',memory:'pending',
    timeline:[{id:'b'.repeat(64),kind:'trial',phase:'pending'}]}]));selectExperiment(id);
  const text=texts('experiment-detail');assert.match(text,/心跳已过期/);assert.match(text,/结果未知/);assert.ok(text.includes(id));
  assert.equal(all(elements.get('experiment-detail')).some(n=>n.tagName==='img'),false);
  renderExperiments(null);assert.equal(elements.get('experiment-detail').children.length,0);assert.match(elements.get('experiment-summary').textContent,/状态未知/);
  renderExperiments(snapshot([]));assert.match(texts('experiment-detail'),/还没有实验记录/);
});
