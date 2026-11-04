import {normalizeAgentActivity,activityText} from '../src/modern-viewer/agent-activity.js';
const states={started:'开始',accepted:'已受理',running:'执行中',completed:'完成回执',failed:'失败',cancelled:'已取消',unknown:'结果未确认'};
const tone=s=>s==='failed'?'error':s==='completed'?'success':s==='unknown'?'warning':['accepted','running','started'].includes(s)?'active':'muted';
/** Public records only. No reasoning transcripts, prompts, inferred success or added model calls. */
export function agentActivityPanels({name,records=[],phase=null,now=Date.now()}={}){
 const rows=[],safe=records.slice(-80).map(normalizeAgentActivity).filter(r=>r&&r.kind!=='reasoning'&&Date.parse(r.at)<=now+1000
  && (now-Date.parse(r.at)<120000 || r.id==='current-body'&&r.result?.schema==='body-status/v1'&&Date.parse(r.result.expiresAt)>now)).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 const age=r=>Math.max(0,Math.floor((now-Date.parse(r.at))/1000))+'秒前';
 if(phase&&typeof phase.text==='string')rows.push({label:'调度',text:activityText(phase.text,100),tone:phase.paused?'muted':'info'});
 const body=safe.findLast(r=>r.id==='current-body'&&r.kind==='phase'&&r.result?.schema==='body-status/v1'&&Date.parse(r.result.expiresAt)>now);
 if(body)rows.push({label:'身体',text:activityText(body.title.replace(/^身体：/,'')+' · 已持续'+Math.max(0,Math.floor((now-Date.parse(body.at))/1000))+'秒'+(body.text?' · '+body.text:''),180),tone:body.status==='running'?'active':'muted'});
 const progress=safe.findLast(r=>r.kind==='phase'&&r.session==='audience-progress'&&r.result?.schema==='audience-progress/v1'&&Date.parse(r.result.expiresAt)>now);
 if(progress)rows.push({label:'当前',text:activityText(progress.text||progress.title,150),tone:'info'});
 const decision=safe.findLast(r=>r.kind==='decision');
 if(decision)rows.push({label:(decision.source==='system1'?'系统一':'决策')+(Number.isFinite(decision.result?.probability)?' '+Math.round(decision.result.probability*100)+'%':''),text:activityText(age(decision)+' · '+decision.title+' · '+(decision.result?.displayStatus||states[decision.status]),150),tone:tone(decision.status),
  ...(Number.isFinite(decision.result?.probability)&&decision.result.probability>=0&&decision.result.probability<=1?{progress:decision.result.probability}:{})});
 const actions=safe.filter(r=>['tool','execution'].includes(r.kind));
 for(const r of actions.slice(-2))rows.push({label:r.kind==='execution'?'最近回执':'最近操作',text:activityText(age(r)+' · '+states[r.status]+' · '+r.title,150),tone:tone(r.status)});
 if(rows.length===0)rows.push({label:'数据',text:'等待宿主公开行为记录',tone:'muted'});
 return[{id:'agent-behavior',title:activityText((name||'Agent')+' · 决策与行动',72),anchor:'bottom_right',width:220,bottomInset:58,rows:rows.slice(0,5)}];
}
