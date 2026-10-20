/** Metadata-only experiment page. This module has no action, model or adoption endpoint. */
const $=id=>document.getElementById(id);
const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
const number=v=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('zh-CN',{maximumFractionDigits:2}):'—';
const duration=v=>typeof v==='number'&&v>=0?(v/1000).toFixed(1)+' s':'—';
const verdict=a=>a?.achieved===true?'达成':a?.achieved===false?'未达成':'未知';
const statuses={'not-started':'尚未开始',running:'进行中',completed:'已完成',blocked:'需核对现场',failed:'已停止',unknown:'状态未知'};
const phases={preparing:'准备',propose:'生成候选',probe:'实际试跑',compose:'合成方案',select:'选择方案',reflect:'整理经验',holdout:'留出验证',remember:'写入记忆',settled:'结束'};
let snapshot,selectedId;
function stat(label,value,note){const d=node('div',undefined,'experiment-stat');d.append(node('span',label),node('strong',value));if(note)d.append(node('small',note));return d;}
function comparison(label,baseline,candidate){
  const row=node('div',undefined,'experiment-comparison');row.append(node('strong',label));
  for(const [title,a] of [['原始基线',baseline],['候选方案',candidate]]){
    const col=node('div');col.append(node('span',title),node('b',verdict(a),a?.achieved===true?'good':a?.achieved===false?'warn':'muted'));
    col.append(node('small',`距离 ${number(a?.measurements?.distance)} · 增量 ${number(a?.measurements?.gained)}`),
      node('small',`掉血 ${number(a?.measurements?.healthLoss)} · ${duration(a?.measurements?.elapsedMs)}`));row.append(col);
  }return row;
}
export function renderExperiments(value){
  snapshot=value;const list=$('experiment-list'),detail=$('experiment-detail');list.replaceChildren();detail.replaceChildren();
  if(value?.schema!=='agent-mc.experiments/v1'||!Array.isArray(value.jobs)||typeof value.sampledAt!=='number'){
    $('experiment-summary').textContent='实验状态未知：读取失败，等待下一次采样。';return;
  }
  $('experiment-summary').textContent=`${value.enabled?'实验能力已配置':'实验能力未启用'} · ${value.jobs.length} 个配置任务 · 采样 ${new Date(value.sampledAt).toLocaleString('zh-CN')}`;
  if(!value.jobs.length){detail.append(node('h2','还没有实验记录'),node('p','配置独立练习环境与有预算的实验任务后，明确运行 mc_practice，过程与结果会出现在这里。打开页面不会启动实验。'));return;}
  if(!value.jobs.some(j=>j.id===selectedId))selectedId=value.jobs.find(j=>j.status==='running')?.id??value.jobs[0].id;
  for(const j of value.jobs){const button=node('button',undefined,'experiment-job');button.type='button';button.dataset.experimentId=j.id;
    button.setAttribute('aria-pressed',String(j.id===selectedId));button.append(node('strong',j.id),node('span',`${statuses[j.status]??'状态未知'} · ${j.methodId}`));list.append(button);}
  const j=value.jobs.find(j=>j.id===selectedId),title=node('div',undefined,'experiment-heading');
  title.append(node('h2',j.id),node('span',statuses[j.status]??'状态未知',`experiment-status ${j.status}`));detail.append(title);
  detail.append(node('p',`${j.mode==='parallel'?'并行生成候选 / 串行试跑':'顺序优化'} · k=${number(j.k)} · 独立练习环境`));
  if(j.stale)detail.append(node('p','运行心跳已过期，当前阶段和在途效果未确认。不要据此重复运行。','experiment-warning'));
  if(j.status==='blocked')detail.append(node('p','原实验存在未核对的执行或清理状态，需要查看原始证据后处理。页面不会重试。','experiment-warning'));
  const steps=node('div',undefined,'experiment-steps');
  for(const [key,label] of Object.entries(phases)){const step=node('span',label);if(j.phase===key)step.className='current';steps.append(step);}detail.append(steps);
  const elapsed=typeof j.startedAt==='number'&&typeof (j.endedAt??j.updatedAt)==='number'?(j.endedAt??j.updatedAt)-j.startedAt:null;
  const stats=node('div',undefined,'experiment-stats');stats.append(stat('模型调用',`${number(j.modelCalls)} / ${number(j.budget?.modelCalls)}`),
    stat('实际试跑',`${number(j.trials)} / ${number(j.budget?.trials)}`),stat('已执行时间',duration(elapsed),`时限 ${duration(j.budget?.wallMs)}`));detail.append(stats);
  const outcome=node('div',undefined,'experiment-outcome');outcome.append(node('strong',j.result?.eligible===true?'通过独立练习门槛':j.result?.eligible===false?'保留原始基线':'尚无完整验证结论'));
  outcome.append(node('p','未在线采用 · 练习通过不代表真实服务器上的因果改善。'));detail.append(outcome);
  const comparisons=node('div',undefined,'experiment-comparisons');comparisons.append(node('h3','基线与候选'));
  if(j.result){comparisons.append(comparison('训练场景',j.result.train?.baseline,j.result.train?.candidate));
    for(const h of j.result.holdout??[])comparisons.append(comparison(`留出 · ${h.caseId}`,h.baseline,h.candidate));}
  else comparisons.append(node('p','等待试跑和留出验证。已返回的单次观测在下方列出，未完成项保持未知。'));detail.append(comparisons);
  const usage=j.usage??{},meta=node('div',undefined,'experiment-meta');
  meta.append(node('p',`输入 ${number(usage.inputTokens)} · 缓存输入 ${number(usage.cachedTokens)} · 输出 ${number(usage.outputTokens)} token`),
    node('p',`用量帧 ${number(usage.usageSamples)} / ${number(usage.returnedCalls)} 个已返回调用；缺失值为 —。`),
    node('p',`游戏记忆：${{stored:'已写入',pending:'待写入或待确认',disabled:'未配置',unknown:'未知'}[j.memory]??'未知'} · 证据 ${number(j.result?.evidenceCount)} 条`));detail.append(meta);
  const timeline=node('ol',undefined,'experiment-timeline');timeline.setAttribute('aria-label','实验执行记录');
  for(const t of j.timeline??[]){const item=node('li');item.append(node('span',t.kind==='model'?'模型调用':`${t.group==='holdout'?'留出':'训练'}试跑 · ${t.role==='baseline'?'基线':t.role==='candidate'?'候选':'来源未知'}`),
    node('b',t.phase==='pending'?(j.status==='running'?'进行中':'结果未知'):t.kind==='trial'?verdict(t.assessment):'已返回'),
    node('small',`${t.id?.slice(0,12)??'—'} · ${t.caseId??'—'} · ${typeof t.startedAt==='number'&&typeof t.endedAt==='number'?duration(t.endedAt-t.startedAt):'—'}`));timeline.append(item);}
  detail.append(node('h3','执行记录'),timeline);
  if(!timeline.children.length)timeline.append(node('li','尚无执行记录'));
}
export function selectExperiment(id){selectedId=id;if(snapshot)renderExperiments(snapshot);}
document.addEventListener('click',event=>{const b=event.target.closest?.('[data-experiment-id]');if(b)selectExperiment(b.dataset.experimentId);});
