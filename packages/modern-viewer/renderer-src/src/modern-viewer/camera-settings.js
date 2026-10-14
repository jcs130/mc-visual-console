import { normalizeCameraSettings, CAMERA_SETTINGS_KEY } from './camera-preferences.js';

const modes=[['manual','手动环绕','拖拽旋转，滚轮调整距离'],['shoulder','越肩跟随','人物偏左，留出前方观察空间'],
  ['follow','居中跟随','跟随行进方向，站立转头不甩镜头'],['front','正面跟随','看清表情与手持动作'],
  ['orbit','自动环绕','缓慢绕着人物观察四周'],['overhead','高位俯视','从上方观察周围地形']];
export function installCameraSettings({document,window,settings,onChange,onShot,hidden=false}) {
  if(hidden)return {status(){},manual(){},dispose(){}};
  let current=normalizeCameraSettings(settings),disposed=false;
  const make=(tag,parent,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;parent.append(el);return el;};
  const root=document.createElement('details');root.className='viewer-scene-settings viewer-camera-settings';
  const summary=make('summary',root,'镜头与运镜'),panel=make('div',root);panel.className='viewer-scene-panel camera-panel';
  make('strong',panel,'镜头构图');const grid=make('div',panel);grid.className='camera-mode-grid';grid.setAttribute('aria-label','镜头方式');
  const listeners=[],listen=(el,event,fn)=>{el.addEventListener(event,fn);listeners.push([el,event,fn]);};
  const inputs=new Map(),buttons=new Map();
  function publish(){current=normalizeCameraSettings(current);refresh();try{window.localStorage?.setItem(CAMERA_SETTINGS_KEY,JSON.stringify(current));}catch{}onChange?.(current);}
  for(const [value,title]of modes){const button=make('button',grid,title);button.type='button';button.dataset.cameraMode=value;buttons.set(value,button);
    listen(button,'click',()=>{current={...current,mode:value};onShot?.('stop');publish();});}
  const hint=make('small',panel);hint.className='camera-mode-hint';
  const framing=make('section',panel);framing.className='camera-framing';
  const advanced=make('details',panel);advanced.className='camera-advanced';make('summary',advanced,'平滑与避障');
  function slider(host,key,title,min,max,step,unit='',only){
    const label=make('label',host);label.className='camera-range';const caption=make('span',label,title),value=make('output',caption);
    const input=make('input',label);input.type='range';input.min=String(min);input.max=String(max);input.step=String(step);input.setAttribute('aria-label',title);
    inputs.set(key,{input,value,label,unit,only});listen(input,'input',()=>{current={...current,[key]:Number(input.value)};publish();});
  }
  slider(framing,'distance','镜头距离',2,12,.25,'格');slider(framing,'height','镜头抬高',.2,6,.1,'格');
  slider(framing,'framing','人物偏左',0,.45,.01,'%', 'shoulder');slider(framing,'fov','视野宽度',30,110,1,'°');
  slider(framing,'orbitSpeed','环绕速度',2,35,1,'°/秒','orbit');
  slider(advanced,'smoothTime','移动柔和度',.08,1.5,.02,'秒');slider(advanced,'turnSpeed','转向速度',.3,5,.1,'');
  const collisionLabel=make('label',advanced,'自动避开墙面'),collision=make('input',collisionLabel);collision.type='checkbox';collision.setAttribute('aria-label','自动避障');
  listen(collision,'change',()=>{current={...current,collision:collision.checked};publish();});
  make('strong',panel,'短镜头');const shots=make('div',panel);shots.className='camera-shot-grid';
  for(const [kind,title]of [['orbit','环绕一周'],['pullback','拉远展示'],['stop','结束运镜']]){
    const button=make('button',shots,title);button.type='button';listen(button,'click',()=>onShot?.(kind));
  }
  const reset=make('button',panel,'恢复默认镜头');reset.type='button';reset.className='camera-reset';
  listen(reset,'click',()=>{current=normalizeCameraSettings(null);onShot?.('stop');publish();});
  const output=make('output',panel);output.setAttribute('aria-live','polite');output.className='camera-status';
  function refresh(){
    for(const [key,button]of buttons)button.setAttribute('aria-pressed',String(key===current.mode));
    hint.textContent=modes.find(row=>row[0]===current.mode)[2]+' · 设置自动保存';
    framing.hidden=current.mode==='manual';advanced.hidden=current.mode==='manual';collision.checked=current.collision;
    for(const [key,row]of inputs){row.input.value=String(current[key]);row.label.hidden=!!row.only&&current.mode!==row.only;
      row.value.textContent=key==='framing'?`${Math.round(current[key]*50)}%`:`${Number(current[key].toFixed(2))}${row.unit}`;}
  }
  const place=()=>{if(!root.open||typeof summary.getBoundingClientRect!=='function')return;
    const button=summary.getBoundingClientRect(),width=Math.min(360,window.innerWidth-24);
    panel.style.setProperty('--camera-panel-left',`${Math.max(12,Math.min(button.left,window.innerWidth-width-12))}px`);
    panel.style.setProperty('--camera-panel-top',`${Math.max(12,Math.min(button.bottom+8,window.innerHeight-180))}px`);};
  listen(root,'toggle',place);listen(window,'resize',place);listen(window,'keydown',e=>{if(e.code==='Escape')root.open=false;});
  function dispose(){if(disposed)return;disposed=true;for(const[el,name,fn]of listeners)el.removeEventListener(name,fn);window.removeEventListener('pagehide',dispose);root.remove();}
  document.body.append(root);window.addEventListener('pagehide',dispose,{once:true});refresh();
  return {status(text){if(output.textContent!==text)output.textContent=text;},select(mode){current=normalizeCameraSettings({...current,mode});publish();},manual(){current={...current,mode:'manual'};publish();},dispose};
}
