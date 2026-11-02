import {activityText} from '../../packages/modern-viewer/renderer-src/src/modern-viewer/agent-activity.js';
const skills={attack:'攻击',engage:'接敌作战',goto:'前往目标',goto_player:'跟随玩家',find:'寻找目标',say:'发送游戏消息',craft:'合成',collect:'采集',mine:'挖掘',dig:'挖掘',eat:'进食',equip:'装备',cast:'施法',interact:'交互',look:'观察',wait:'等待'};
const taskId=msg=>/任务#(\d+)/.exec(msg??'')?.[1]??null;
function skillTitle(data){const step=data?.steps?.[0]??data?.args?.steps?.[0];return skills[step?.skill??step?.type]??'游戏操作';}
/** Adapt known public engine events; unrelated logs and model transcripts never become panels. */
export function corticoContentRecords(logs,{now=Date.now()}={}){
 const records=new Map();
 for(const e of Array.isArray(logs)?logs:[]){
  const at=Date.parse(e.ts);if(!Number.isFinite(at)||at>now+1000||now-at>120000||!/^worlds\.(?:minecraft|mymc)$/.test(e.area??''))continue;
  const d=e.data??{},id='log:'+e.run+':'+e.seq,base={id,at:e.ts,run:e.run,source:'unknown'};
  if(e.event==='host.combat.result'){
   const applied=d.application?.dispatched===true,kept=d.application?.keptCurrent===true;
   const title=skills[d.candidate?.kind]??(d.choice==='keep'?'保持当前动作':'战斗选择');
   const displayStatus=applied?'已下发，完成另验':kept?'保持当前':d.outcome==='scene-changed'?'场景已变，未采用':d.outcome==='fallback'?'使用规则回退':'未确认执行';
   records.set(id,{...base,kind:'decision',source:'system1',status:applied?'accepted':kept?'running':'unknown',title,
    result:{displayStatus,outcome:activityText(d.outcome,80),...(Number.isFinite(d.probability)?{probability:d.probability}:{})}});
  }else if(['enqueue','start'].includes(e.event)&&taskId(e.msg)){
   const task=taskId(e.msg),key='task:'+e.run+':'+task;
   records.set(key,{...base,id:key,kind:'tool',status:e.event==='enqueue'?'accepted':'running',title:'任务#'+task+' '+skillTitle(d),taskId:task});
  }else if(e.event==='mc_do'&&typeof d.receipt==='string'){
   const task=taskId(d.receipt);if(task&&!records.has('task:'+e.run+':'+task))records.set('task:'+e.run+':'+task,{...base,id:'task:'+e.run+':'+task,kind:'tool',status:'unknown',title:'任务#'+task+' '+skillTitle(d),taskId:task});
  }else if(d.meta?.serverQuery?.outcomeUnknown===true){
   records.set(id,{...base,kind:'execution',status:'unknown',title:'查询超时，服务端结果未知',taskId:d.meta.serverQuery.requestId});
  }else if(d.execution?.terminal===true){
   const x=d.execution;records.set(id,{...base,kind:'execution',status:x.phase==='completed'?'completed':x.phase==='failed'?'failed':x.phase==='cancelled'?'cancelled':'unknown',title:'动作终态回执',taskId:x.taskId??x.id});
  }
 }
 return[...records.values()].slice(-40);
}
export function corticoContentPhase(status){
 const p=status?.loop?.phase;if(!p)return null;
 const labels={idle:'观察等待',thinking:'模型选择中',model:'模型选择中',llm:'模型选择中',acting:'工具执行中',tools:'工具执行中',tool:'工具执行中',waiting:'等待事件',paused:'已暂停'};
 return{text:status.loop.paused?'已暂停':(labels[p.state]??'宿主运行中')+(Number.isInteger(p.round)?' · 第'+p.round+'轮':''),paused:status.loop.paused===true};
}
