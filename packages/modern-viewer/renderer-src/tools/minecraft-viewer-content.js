import { ServerParticles, loadViewerContentAssets } from './server-particles.js';
import { MapPhotos, heldMapId } from './map-photos.js';
import {TextDisplays} from './text-displays.js';
import {loadTextDisplayFont} from './text-display-font.js';
import {PaperYsmPlayers} from './paper-ysm.js';

const cortiNativeParticles = new ServerParticles();
const cortiMapPhotos = new MapPhotos();
const cortiTextDisplays = new TextDisplays();
let cortiTextDisplayError = null;
if (typeof isObsOverlay === 'undefined' || !isObsOverlay) loadTextDisplayFont().then(font=>{if(cortiContentDisposed){font.dispose();return;}cortiTextDisplays.setFont(font);})
  .catch(error=>{cortiTextDisplayError=String(error.message);});
let cortiContentEpoch = null;
let cortiContentDisposed = false;
let cortiContentError = null;
const cortiAppearances=new Map();
const cortiYsmPlayers=new PaperYsmPlayers({entity:id=>entityCache.get(String(id))??(pendingAvatarState?.entity?.id===id?pendingAvatarState.entity:null),rendered:id=>globalThis.world?.entities?.entities?.[String(id)]});
socket.on('appearanceAsset',bundle=>cortiYsmPlayers.asset(bundle));
socket.on('appearanceReset',()=>{cortiAppearances.clear();cortiYsmPlayers.clear();});
socket.on('appearanceRemove',event=>{cortiAppearances.delete(event?.playerUuid);cortiYsmPlayers.remove(event?.playerUuid);});
socket.on('appearanceState',event=>{
  if(event?.schemaVersion!==1||event.source!=='freesia_worker'||typeof event.playerUuid!=='string'||typeof event.renderAvailable!=='boolean')return;
  if(cortiAppearances.size<40||cortiAppearances.has(event.playerUuid)){cortiAppearances.set(event.playerUuid,event);cortiYsmPlayers.state(event);}
});
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
  cortiContentEpoch=epoch;cortiNativeParticles.clear();cortiMapPhotos.reset(epoch);cortiTextDisplays.reset(epoch);
}
socket.on('contentReset', event => {
  if(event?.schemaVersion!==1||!Number.isSafeInteger(event.epoch)||event.epoch<0)return;
  if(cortiContentEpoch!==null&&event.epoch<cortiContentEpoch)return;
  cortiContentClear(event.epoch);
});
socket.on('particleBatch', event => {
  if(event?.epoch!==cortiContentEpoch)return;
  cortiNativeParticles.handleBatch(event);
});
socket.on('mapPixels', event => cortiMapPhotos.handlePixels(event));
socket.on('mapFrame', event => cortiMapPhotos.handleFrame(event));
socket.on('textDisplay', event => cortiTextDisplays.handle(event));
socket.on('disconnect', () => cortiContentClear());
socket.on('viewerReset', () => cortiContentClear());
loadViewerContentAssets().then(({assets,texture})=>{
  if(cortiContentDisposed){texture.dispose();return;}
  cortiNativeParticles.setAssets(assets,texture);cortiMapPhotos.setAssets(assets);
}).catch(error=>{cortiContentError=String(error.message);});
function cortiAnimateNativeContent(now) {
  if(cortiContentDisposed)return;
  if(!document.hidden){cortiNativeParticles.tick(now);cortiMapPhotos.tick();cortiTextDisplays.tick();cortiYsmPlayers.tick(now);cortiUpdateHeldMap();}
  const photos=cortiMapPhotos.stats();
  const texts=cortiTextDisplays.stats();
  const ysm=cortiYsmPlayers.stats();
  const ysmMessage=ysm.failed?'YSM 模型渲染失败：'+ysm.errors[0]:ysm.unavailable?'部分 YSM 模型缺少可公开原始资源，当前普通皮肤仅为回退画面':ysm.pending?'正在加载原 YSM 模型':ysm.animationUnavailable.length?'YSM 原模型已显示；部分动画尚不支持':'';
  const message=cortiTextDisplayError?'文字气泡字库不可用，请更新匹配版本的网页资源包':texts.unavailable?'部分文字显示格式暂未适配':cortiContentError?'粒子／照片资源暂不可用，请更新匹配版本的网页资源包':photos.waiting?'尚未收到可用照片像素，请靠近展示框或重新手持地图':ysmMessage;
  cortiContentStatus.dataset.ysmStates=String(cortiAppearances.size);cortiContentStatus.dataset.ysmRendererReady=String(ysm.rendered>0);cortiContentStatus.dataset.ysmRendered=String(ysm.rendered);
  cortiContentStatus.dataset.textDisplays=String(texts.visible);cortiContentStatus.dataset.textDisplayReady=String(texts.ready);
  cortiContentStatus.dataset.textDisplayUpdates=String(texts.updates);cortiContentStatus.dataset.textTextureUpdates=String(texts.textureUpdates);
  cortiContentStatus.dataset.frames=String(photos.visible);cortiContentStatus.dataset.cachedMaps=String(photos.maps);
  const particles=cortiNativeParticles.stats();
  cortiContentStatus.dataset.renderedParticles=String(particles.rendered);
  cortiContentStatus.dataset.activeParticles=String(particles.active);cortiContentStatus.dataset.drawnParticles=String(particles.drawn);cortiContentStatus.dataset.mountedParticles=String(particles.mounted);
  cortiContentStatus.dataset.particlePosition=JSON.stringify(particles.firstScenePosition);
  cortiContentStatus.dataset.epoch=String(cortiContentEpoch);
  cortiContentStatus.textContent=message;cortiContentStatus.style.display=message?'block':'none';
  requestAnimationFrame(cortiAnimateNativeContent);
}
if (typeof isObsOverlay === 'undefined' || !isObsOverlay) requestAnimationFrame(cortiAnimateNativeContent);
window.cortiViewerContent={stats:()=>({ysm:cortiYsmPlayers.stats(),particles:cortiNativeParticles.stats(),photos:cortiMapPhotos.stats(),textDisplays:cortiTextDisplays.stats(),textDisplayError:cortiTextDisplayError,error:cortiContentError,epoch:cortiContentEpoch})};
window.addEventListener('pagehide',()=>{cortiContentDisposed=true;cortiYsmPlayers.clear();cortiNativeParticles.dispose();cortiMapPhotos.dispose();cortiTextDisplays.dispose();cortiContentStatus.remove();cortiHeldMap.remove();},{once:true});
