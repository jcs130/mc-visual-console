/** A received map is not necessarily a photograph (an ocean map can be all blue). */
export function createHeldMapPreview({document}) {
  const element=document.createElement('aside');element.id='corti-held-map';
  element.style.cssText='position:fixed;left:12px;bottom:116px;max-width:calc(100vw - 24px);background:#17222cee;color:#fff;padding:8px;border-radius:6px;font:12px sans-serif;z-index:8;pointer-events:none;display:none';
  const header=document.createElement('div'),label=document.createElement('span'),toggle=document.createElement('button');
  header.style.cssText='display:flex;align-items:center;gap:10px';
  toggle.type='button';toggle.style.cssText='pointer-events:auto;color:inherit;background:#ffffff12;border:1px solid #ffffff40;border-radius:4px;padding:3px 6px;font:inherit;cursor:pointer';
  const status=document.createElement('div'),canvas=document.createElement('canvas');
  status.style.cssText='margin-top:4px;color:#b7cbd7;font-size:11px';
  canvas.id='corti-held-map-image';canvas.width=canvas.height=128;
  canvas.style.cssText='position:static;inset:auto;display:none;width:min(192px,36vw,32vh);height:auto;image-rendering:pixelated;margin-top:6px';
  toggle.setAttribute('aria-controls',canvas.id);
  header.append(label,toggle);element.append(header,status,canvas);
  let state=null,expanded=false,key=null,context=null,viewKey=null;
  const text=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
  function render() {
    if(state?.id===null||state?.id===undefined){element.style.display='none';return;}
    const {id,map,epoch,revision}=state,received=map?.received??0,ready=received>0;
    const nextViewKey=`${epoch}:${id}:${received}:${map?.icons?.length??0}:${expanded}`;
    if(nextViewKey!==viewKey){
      element.style.display='block';element.dataset.mapId=String(id);element.dataset.receivedPixels=String(received);
      text(label,`手持地图 #${id}`);
      text(status,!ready?'等待服务器像素':received<16384?`已收到 ${received}/16384 像素`:map.icons?.length?'服务器原图 · 地图标记暂未显示':'服务器原图 · 128×128');
      text(toggle,expanded?'收起图片':'查看图片');toggle.disabled=!ready;
      toggle.setAttribute('aria-expanded',String(expanded&&ready));
      canvas.style.display=expanded&&ready?'block':'none';viewKey=nextViewKey;
    }
    const nextKey=`${epoch}:${id}:${revision}`;
    if(expanded&&ready&&key!==nextKey){
      context??=canvas.getContext('2d');
      const image=context.createImageData(128,128);image.data.set(map.rgba);
      context.putImageData(image,0,0);key=nextKey;
    }
  }
  const onToggle=()=>{if(!state?.map?.received)return;expanded=!expanded;render();};
  toggle.addEventListener('click',onToggle);
  function update(next) {
    if(state?.id!==next.id||state?.epoch!==next.epoch){
      expanded=false;key=null;viewKey=null;context?.clearRect(0,0,128,128);
    }
    state=next;render();
  }
  return {element,update,reset:()=>update({id:null}),dispose(){toggle.removeEventListener('click',onToggle);element.remove();}};
}
