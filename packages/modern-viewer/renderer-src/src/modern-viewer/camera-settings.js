import { normalizeCameraSettings, CAMERA_SETTINGS_KEY } from './camera-preferences.js';

export function installCameraSettings({document,window,settings,onChange,onShot,hidden=false}) {
  if(hidden)return {status(){},manual(){},dispose(){}};
  let current=normalizeCameraSettings(settings),disposed=false;
  const root=document.createElement('details');root.className='viewer-scene-settings viewer-camera-settings';
  const make=(tag,parent,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;parent.append(el);return el;};
  make('summary',root,'高级运镜');const panel=make('div',root);panel.className='viewer-scene-panel';
  const label=make('label',panel,'镜头方式'),mode=make('select',label);mode.setAttribute('aria-label','镜头方式');
  for(const [value,title]of [['manual','手动环绕'],['follow','稳定跟随'],['shoulder','过肩跟随'],['front','正面跟随'],['orbit','自动环绕'],['overhead','高位俯视']])make('option',mode,title).value=value;
  mode.value=current.mode;
  const listeners=[],listen=(el,event,fn)=>{el.addEventListener(event,fn);listeners.push([el,event,fn]);};
  function publish(){try{window.localStorage?.setItem(CAMERA_SETTINGS_KEY,JSON.stringify(current));}catch{}onChange?.(current);}
  listen(mode,'change',()=>{current={...current,mode:mode.value};publish();});
  for(const [key,title,min,max,step]of [['distance','距离',2,12,.25],['height','高度',.2,6,.1],['smoothTime','平滑时间',.08,1.5,.02],['turnSpeed','跟随转向速度',.3,5,.1],['orbitSpeed','环绕速度',2,35,1],['fov','垂直 FOV',30,110,1]]){
    const label=make('label',panel,title),input=make('input',label);input.type='number';input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(current[key]);input.setAttribute('aria-label',title);
    listen(input,'change',()=>{current=normalizeCameraSettings({...current,[key]:Number(input.value)});input.value=String(current[key]);publish();});
  }
  const collisionLabel=make('label',panel,'自动避障'),collision=make('input',collisionLabel);collision.type='checkbox';collision.checked=current.collision;collision.setAttribute('aria-label','自动避障');
  listen(collision,'change',()=>{current={...current,collision:collision.checked};publish();});
  for(const [kind,title]of [['orbit','环绕展示一周'],['pullback','拉远展示']]){
    const button=make('button',panel,title);button.type='button';listen(button,'click',()=>onShot?.(kind));
  }
  make('small',panel,'设置自动保存。拖拽画面可回到手动环绕；运镜跟随移动方向，站立转头不会甩镜头。');
  const output=make('output',panel);output.setAttribute('aria-live','polite');
  listen(window,'keydown',e=>{if(e.code==='Escape')root.open=false;});
  function dispose(){if(disposed)return;disposed=true;for(const[el,name,fn]of listeners)el.removeEventListener(name,fn);window.removeEventListener('pagehide',dispose);root.remove();}
  document.body.append(root);window.addEventListener('pagehide',dispose,{once:true});
  return {status(text){if(output.textContent!==text)output.textContent=text;},manual(){current={...current,mode:'manual'};mode.value='manual';publish();},dispose};
}
