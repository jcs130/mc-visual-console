const roles={system1:'快决策',system2:'主模型',background:'后台整理'};
const $=s=>document.querySelector(s);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const number=v=>typeof v==='number'?v.toLocaleString('zh-CN'):'—';
const total=v=>typeof v==='number'?v:v?.value??v?.total;
function stat(parent,label,value){const d=el('dl');d.append(el('dt',label),el('dd',number(value)));parent.append(d);}
export function renderMetrics(data){
  const models=$('#models');models.replaceChildren();
  for(const m of data.models??[]){const box=el('section',undefined,'panel');box.dataset.decisionSource=['system1','system2'].includes(m.role)?m.role:'unknown';box.append(el('h2',roles[m.role]??m.role));const stats=el('div',undefined,'stats');
    stat(stats,'请求数',m.calls);stat(stats,'运行中',m.active);stat(stats,'输入 Token',total(m.inputTokens));stat(stats,'输出 Token',total(m.outputTokens));stat(stats,'命中缓存 Token',total(m.cachedTokens));stat(stats,'首字延迟 P50 / ms',m.ttftMs?.p50);
    box.append(stats,el('p',m.calls?'数据由宿主按请求上报；缺少计数的请求不会按零消耗处理。':'当前窗口没有请求记录。','muted'));models.append(box);}
  const tools=$('#tools');tools.replaceChildren();stat(tools,'调用数',data.tools?.calls);stat(tools,'返回数',data.tools?.returned);stat(tools,'失败数',data.tools?.errors);stat(tools,'返回耗时 P95 / ms',data.tools?.elapsedMs?.p95);
  $('#coverage').textContent=`最近 ${data.window?.seconds??600} 秒 · 已覆盖 ${Math.floor(data.window?.coveredSeconds??0)} 秒 · ${data.window?.complete?'完整窗口':'窗口仍在积累'} · 金额未配置，不估算费用。`;
  $('#updated').textContent=`更新于 ${new Date(data.time*1000).toLocaleTimeString()}`;
}
let pending=false;
async function refresh(){if(pending)return;pending=true;try{const r=await fetch('/api/harness/metrics',{cache:'no-store'});if(!r.ok)throw Error();renderMetrics(await r.json());$('#notice').textContent='';}catch{$('#notice').textContent='指标暂不可用，之前的读数可能已过期。';}finally{pending=false;}}
if (!globalThis.__MC_CONSOLE_TEST__ && document.querySelector('#metrics-panel') === null) { void refresh();setInterval(refresh,2000); }

