import * as THREE from 'three'
import { visualPoint, sameVisualSubject } from '../modern-viewer/agent-visual-protocol.js'

// A second camera over the SAME original scene and WebGL context. This does
// not invent map tiles, query a second account or substitute block textures.
export function createNativeMiniMap({document,renderer,scene,size=192,span=32}={}) {
  const root=document.createElement('details');root.id='native-terrain-map';root.setAttribute('open','')
  const title=document.createElement('summary');title.textContent='N ↑ · 本人局部地形';root.append(title)
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;canvas.setAttribute('aria-label','原场景俯视地形与真实移动路线');root.append(canvas)
  const note=document.createElement('small');note.textContent='等待本人世界数据';root.append(note);document.body.append(root)
  const style=document.createElement('style');style.textContent=`
    #native-terrain-map{position:fixed;left:18px;top:62px;z-index:5;background:#11242ce8;border:1px solid #aec3b45c;border-radius:8px;color:#d4e7df;padding:8px;font:11px/1.5 system-ui;width:192px}
    #native-terrain-map summary{cursor:pointer;font-weight:600;margin-bottom:6px}#native-terrain-map canvas{position:static;inset:auto;display:block;width:100%;height:auto;aspect-ratio:1/1;image-rendering:pixelated;border-radius:4px}#native-terrain-map small{display:block;margin-top:5px;color:#adc6bc}
    body:has(#native-terrain-map) #agent-intent{top:312px}
    @media(max-height:800px),(max-width:720px){#native-terrain-map{width:140px;top:62px;left:8px;padding:6px;font-size:10px}body:has(#native-terrain-map) #agent-intent{top:250px;max-height:25vh;overflow:auto}}
  `;document.head.append(style)
  const ctx=canvas.getContext?.('2d'),target=new THREE.WebGLRenderTarget(size,size,{depthBuffer:true})
  target.texture.colorSpace=THREE.SRGBColorSpace
  const bytes=new Uint8Array(size*size*4),image=ctx?.createImageData(size,size)
  const camera=new THREE.OrthographicCamera(-span/2,span/2,span/2,-span/2,.1,1024)
  camera.up.set(0,0,-1)
  let binding=null,last=-Infinity,disposed=false
  const reset=()=>{binding=null;last=-Infinity;ctx?.clearRect(0,0,size,size);root.dataset.state='unavailable';note.textContent='等待本人世界数据'}
  reset()
  function drawLine(points,color,position) {
    if(!points?.length)return
    ctx.beginPath();let started=false
    // Clip lines at the canvas boundary; only actual bounded telemetry points.
    for(const point of points.slice(-128)) {
      const p=visualPoint(point);if(!p){started=false;continue}
      const x=size/2+(p.x-position.x)*size/span,y=size/2+(p.z-position.z)*size/span
      if(started)ctx.lineTo(x,y);else{ctx.moveTo(x,y);started=true}
    }
    ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke()
  }
  return {root,reset,
    render({position,playerUuid,entityId,epoch,bounds,visual,now=performance.now()}={}) {
      if(disposed || document.hidden || !ctx || !image || !visualPoint(position) || typeof playerUuid!=='string' || !Number.isSafeInteger(entityId)) {if(!disposed)reset();return false}
      const key=`${playerUuid.toLowerCase()}:${entityId}:${epoch}`
      if(key!==binding){reset();binding=key}
      if(root.open===false || now-last<250)return false
      last=now
      const previousTarget=renderer.getRenderTarget(),viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4())
      const scissorTest=renderer.getScissorTest(),autoClear=renderer.autoClear
      try {
        const maxY=Number.isFinite(bounds?.maxY)?bounds.maxY:position.y+48
        camera.position.set(position.x,Math.max(position.y+48,maxY+16),position.z);camera.lookAt(position.x,position.y,position.z);camera.updateMatrixWorld(true)
        renderer.setRenderTarget(target);renderer.setViewport(0,0,size,size);renderer.setScissorTest(false);renderer.autoClear=true
        renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,size,size,bytes)
        for(let y=0;y<size;y++)image.data.set(bytes.subarray((size-1-y)*size*4,(size-y)*size*4),y*size*4)
        ctx.putImageData(image,0,0)
        if(sameVisualSubject({playerUuid,entityId},visual?.subject)) {drawLine(visual.trail,'#63b8ff',position);drawLine(visual.route?.points,'#4ee6b1',position)}
        ctx.beginPath();ctx.arc(size/2,size/2,3,0,Math.PI*2);ctx.fillStyle='#ffffff';ctx.fill()
        note.textContent=`${Math.round(position.x)}, ${Math.round(position.y)}, ${Math.round(position.z)} · ${span}×${span} 格 · 已接收区域`
        root.dataset.state='available';delete root.dataset.reason;return true
      } catch(error) {ctx.clearRect(0,0,size,size);root.dataset.state='unavailable';root.dataset.reason=String(error.message).slice(0,160);note.textContent='局部地形暂不可用';return false}
      finally {renderer.setRenderTarget(previousTarget);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);renderer.autoClear=autoClear}
    },
    dispose() {if(disposed)return;disposed=true;target.dispose();root.remove();style.remove()}
  }
}
