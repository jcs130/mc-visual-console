const modes={first:'第一人称',third:'第三人称',dungeon:'地下城视角',overview:'俯视图'};
const deliveries={captured:'拍摄完成', 'tool-result':'已生成工具结果', 'host-event':'已交给宿主', failed:'交给宿主失败',discarded:'连接变化，已弃用'};
export function normalizeAgentViews(payload){
  if(payload?.schema!=='mc-agent-views/v1'||!Array.isArray(payload.images))return [];
  return payload.images.filter(row=>row&&/^[a-f0-9-]{36}$/.test(row.id)
    &&row.url===`/agent-views/${row.id}.png`&&Number.isFinite(Date.parse(row.capturedAt))
    &&row.position&&['x','y','z'].every(key=>Number.isFinite(row.position[key])))
    .slice(0,8).map(row=>({...row,focus:String(row.focus??'').slice(0,160)}));
}
export function agentViewCaption(row){
  return `${modes[row.mode]??'场景照片'} · ${deliveries[row.delivery]??'投递状态未知'} · 模型接收未核验`;
}

/** Display only frames actually captured by the Agent; no second camera or model call. */
export function installAgentViewGallery({document,window,hidden=false}){
  if(hidden)return {dispose(){}};
  const root=document.createElement('details');root.className='viewer-scene-settings viewer-agent-views';
  const make=(tag,parent,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;parent.append(el);return el;};
  const summary=make('summary',root,'观察照片'),panel=make('section',root);panel.className='agent-views-panel';panel.setAttribute('aria-label','Agent 实际拍摄的照片');
  const title=make('header',panel),heading=make('strong',title,'她拍到了什么'),close=make('button',title,'关闭');close.type='button';
  const note=make('p',panel,'仅展示实际拍摄的原图；拍完不代表模型已收到。最近 8 张随本次连接保留。');
  note.className='agent-views-note';
  const status=make('output',panel,'正在读取照片…');status.setAttribute('aria-live','polite');
  const figure=make('figure',panel),image=make('img',figure),caption=make('figcaption',figure);figure.hidden=true;
  const meta=make('div',caption),delivery=make('div',caption),focus=make('p',caption);
  const strip=make('div',panel);strip.className='agent-views-strip';strip.setAttribute('aria-label','历史照片');
  const listeners=[],listen=(target,event,fn)=>{target.addEventListener(event,fn);listeners.push([target,event,fn]);};
  let disposed=false,controller=null,timer=null,rows=[],selected=null,signature='';
  const place=()=>{if(!root.open)return;const rect=summary.getBoundingClientRect(),width=Math.min(760,window.innerWidth-24);
    panel.style.left=`${Math.max(12,Math.min(rect.left,window.innerWidth-width-12))}px`;
    panel.style.top=`${Math.max(12,Math.min(rect.bottom+8,window.innerHeight-180))}px`;};
  function show(row){selected=row.id;figure.hidden=false;image.src=row.url;image.alt=`Agent ${modes[row.mode]??''}照片，拍摄于 ${row.capturedAt}`;
    meta.textContent=`${new Date(row.capturedAt).toLocaleString('zh-CN',{hour12:false})} · ${row.dimension==='overworld'?'主世界':row.dimension} · 拍摄后位置 ${['x','y','z'].map(k=>row.position[k].toFixed(1)).join('，')}`;
    delivery.textContent=agentViewCaption(row);focus.textContent=row.focus?`关注：${row.focus}`:'';
    for(const button of strip.children)button.setAttribute('aria-pressed',String(button.dataset.viewId===selected));
  }
  async function refresh(){
    if(disposed||!root.open||controller)return;
    controller=new AbortController();
    try{const response=await window.fetch('/agent-views',{signal:controller.signal,cache:'no-store'});
      if(!response.ok)throw Error(response.status===404?'当前运行版本尚未提供照片记录':'照片记录暂时不可用');
      rows=normalizeAgentViews(await response.json());
      status.textContent=rows.length?'':'这次连接还没有拍摄记录。';
      const next=JSON.stringify(rows);if(next!==signature){signature=next;strip.replaceChildren();
        for(const row of rows){const button=make('button',strip);button.type='button';button.dataset.viewId=row.id;
          button.setAttribute('aria-label',`查看 ${new Date(row.capturedAt).toLocaleTimeString('zh-CN')} 的照片`);
          const thumb=make('img',button);thumb.src=row.url;thumb.alt='';thumb.loading='lazy';
          make('span',button,new Date(row.capturedAt).toLocaleTimeString('zh-CN',{hour12:false}));
          button.addEventListener('click',()=>show(row));}
        if(rows.length)show(rows.find(row=>row.id===selected)??rows[0]);else figure.hidden=true;
      }
    }catch(error){if(error.name!=='AbortError')status.textContent=`${error.message}；历史照片不代表当前现场。`;}
    finally{controller=null;}
  }
  listen(root,'toggle',()=>{clearInterval(timer);timer=null;if(root.open){place();void refresh();timer=setInterval(refresh,5000);}else{controller?.abort();}});
  listen(close,'click',()=>{root.open=false;summary.focus();});listen(window,'resize',place);
  listen(window,'keydown',event=>{if(event.code==='Escape'&&root.open){root.open=false;summary.focus();}});
  function dispose(){if(disposed)return;disposed=true;clearInterval(timer);controller?.abort();for(const[t,e,f]of listeners)t.removeEventListener(e,f);root.remove();}
  document.body.append(root);listen(window,'pagehide',dispose);
  return {dispose};
}
