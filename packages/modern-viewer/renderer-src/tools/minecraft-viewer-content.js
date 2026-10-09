import { ServerParticles, loadViewerContentAssets } from './server-particles.js';
import { MapPhotos, heldMapId } from './map-photos.js';

const cortiNativeParticles = new ServerParticles();
const cortiMapPhotos = new MapPhotos();
let cortiContentEpoch = null;
let cortiContentDisposed = false;
let cortiContentError = null;
const cortiContentStatus = document.createElement('div');
cortiContentStatus.id = 'corti-content-status';
cortiContentStatus.style.cssText = 'position:fixed;left:12px;bottom:36px;max-width:360px;padding:5px 8px;background:#17222cdd;color:#ffe2a3;font:12px sans-serif;pointer-events:none;z-index:8;display:none';
document.body.append(cortiContentStatus);
const cortiHeldMap = document.createElement('aside');
cortiHeldMap.id='corti-held-map';
cortiHeldMap.style.cssText='position:fixed;left:12px;bottom:116px;max-width:calc(100vw - 24px);background:#17222cee;color:#fff;padding:8px;border-radius:6px;font:12px sans-serif;z-index:8;pointer-events:none;display:none';
const cortiHeldMapLabel=document.createElement('div'),cortiHeldMapCanvas=document.createElement('canvas');
cortiHeldMapCanvas.width=cortiHeldMapCanvas.height=128;
cortiHeldMapCanvas.style.cssText='position:static;inset:auto;display:block;width:min(192px,36vw,32vh);height:auto;image-rendering:pixelated;margin-top:6px';
cortiHeldMap.append(cortiHeldMapLabel,cortiHeldMapCanvas);document.body.append(cortiHeldMap);
let cortiHeldMapKey=null;
function cortiUpdateHeldMap() {
  const state=pendingAvatarState;
  const selected=state ? selectedHotbarItem(state) : null;
  const id=heldMapId(selected)??heldMapId(state?.offhand);
  if(id===null){cortiHeldMap.style.display='none';cortiHeldMapKey=null;return;}
  const map=cortiMapPhotos.maps.get(id);
  cortiHeldMap.dataset.mapId=String(id);cortiHeldMap.dataset.receivedPixels=String(map?.received??0);
  cortiHeldMap.style.display='block';
  cortiHeldMapLabel.textContent=!map?.received?'手持地图 · 等待服务器像素':map.icons.length?'手持地图 · 标记图层暂未适配':'手持地图／照片';
  cortiHeldMapCanvas.style.display=map?.received?'block':'none';
  const key=`${cortiContentEpoch}:${id}:${cortiMapPhotos.diagnostics.patches}`;
  if(map?.received&&key!==cortiHeldMapKey){
    cortiHeldMapCanvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(map.rgba),128,128),0,0);
    cortiHeldMapKey=key;
  }
}
function cortiContentClear(epoch=null) {
  cortiContentEpoch=epoch;cortiNativeParticles.clear();cortiMapPhotos.reset(epoch);
}
socket.on('contentReset', event => {
  if(event?.schemaVersion!==1||!Number.isSafeInteger(event.epoch)||event.epoch<0)return;
  cortiContentClear(event.epoch);
});
socket.on('particleBatch', event => {
  if(event?.epoch!==cortiContentEpoch)return;
  cortiNativeParticles.handleBatch(event);
});
socket.on('mapPixels', event => cortiMapPhotos.handlePixels(event));
socket.on('mapFrame', event => cortiMapPhotos.handleFrame(event));
socket.on('disconnect', () => cortiContentClear());
socket.on('viewerReset', () => cortiContentClear());
loadViewerContentAssets().then(({assets,texture})=>{
  if(cortiContentDisposed){texture.dispose();return;}
  cortiNativeParticles.setAssets(assets,texture);cortiMapPhotos.setAssets(assets);
}).catch(error=>{cortiContentError=String(error.message);});
function cortiAnimateNativeContent(now) {
  if(cortiContentDisposed)return;
  if(!document.hidden){cortiNativeParticles.tick(now);cortiMapPhotos.tick();cortiUpdateHeldMap();}
  const photos=cortiMapPhotos.stats();
  const message=cortiContentError?'粒子／照片资源暂不可用，请更新匹配版本的网页资源包':photos.waiting?'尚未收到可用照片像素，请靠近展示框或重新手持地图':'';
  cortiContentStatus.dataset.frames=String(photos.visible);cortiContentStatus.dataset.cachedMaps=String(photos.maps);
  const particles=cortiNativeParticles.stats();
  cortiContentStatus.dataset.renderedParticles=String(particles.rendered);
  cortiContentStatus.dataset.activeParticles=String(particles.active);cortiContentStatus.dataset.drawnParticles=String(particles.drawn);cortiContentStatus.dataset.mountedParticles=String(particles.mounted);
  cortiContentStatus.dataset.particlePosition=JSON.stringify(particles.firstScenePosition);
  cortiContentStatus.dataset.epoch=String(cortiContentEpoch);
  cortiContentStatus.textContent=message;cortiContentStatus.style.display=message?'block':'none';
  requestAnimationFrame(cortiAnimateNativeContent);
}
requestAnimationFrame(cortiAnimateNativeContent);
window.cortiViewerContent={stats:()=>({particles:cortiNativeParticles.stats(),photos:cortiMapPhotos.stats(),error:cortiContentError,epoch:cortiContentEpoch})};
window.addEventListener('pagehide',()=>{cortiContentDisposed=true;cortiNativeParticles.dispose();cortiMapPhotos.dispose();cortiContentStatus.remove();cortiHeldMap.remove();},{once:true});
