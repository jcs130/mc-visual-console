import { ServerParticles, loadViewerContentAssets } from './server-particles.js';
import { MapPhotos, heldMapId } from './map-photos.js';
import {TextDisplays} from './text-displays.js';
import {loadTextDisplayFont} from './text-display-font.js';
import {PaperYsmPlayers,paperYsmAvailabilityText} from './paper-ysm.js';
import {installAppearanceSettings} from './appearance-settings.js';
import {loadPaperBundledAppearances,PaperBundledAppearanceSelection} from './paper-bundled-appearance.js';
import paperYsmItemModels from 'mc-assets/dist/blockStatesModels.json';
const cortiContentMinecraftVersion = '1.20.6';

const cortiNativeParticles = new ServerParticles();
const cortiMapPhotos = new MapPhotos();
const cortiTextDisplays = new TextDisplays();
let cortiTextDisplayError = null;
if (typeof isObsOverlay === 'undefined' || !isObsOverlay) loadTextDisplayFont({minecraftVersion:cortiContentMinecraftVersion}).then(font=>{if(cortiContentDisposed){font.dispose();return;}cortiTextDisplays.setFont(font);})
  .catch(error=>{cortiTextDisplayError=String(error.message);});
let cortiContentEpoch = null;
let cortiContentDisposed = false;
let cortiContentError = null;
const cortiAppearances=new Map();
const cortiYsmPlayers=new PaperYsmPlayers({itemModels:paperYsmItemModels.models.latest,entity:id=>entityCache.get(String(id))??(pendingAvatarState?.entity?.id===id?pendingAvatarState.entity:null),rendered:id=>globalThis.world?.entities?.entities?.[String(id)],presentation:()=>activeScenePolicy});
let appearanceSubject=null,appearanceUiAt=-Infinity,cortiLocalAppearance=null,cortiLocalAppearanceError=null,cortiOwnAppearanceEntity=null;
const appearanceUi=installAppearanceSettings({document,window,hidden:isPhotoView||isObsOverlay,
  onChange:id=>{if(appearanceSubject){if(cortiLocalAppearance)cortiLocalAppearance.select(cortiYsmPlayers,appearanceSubject,id);else cortiYsmPlayers.select(appearanceSubject,id);}updateAppearanceUi();},
  onUpload:async(file,model)=>{if(!cortiLocalAppearance)throw Error('人物模型设置尚未就绪');await cortiLocalAppearance.upload(cortiYsmPlayers,resolveOwnAvatarEntity(),file,model);updateAppearanceUi();}});
if(!isObsOverlay){
  let storage=null;try{storage=window.localStorage;}catch{}
  loadPaperBundledAppearances(new URL('player-appearances/config.json',import.meta.url),{storage}).then(local=>{
    if(cortiContentDisposed)return;cortiLocalAppearance=local??new PaperBundledAppearanceSelection({bundles:[],storage,scope:new URL('./',import.meta.url).href.replace(/\/(third|3dview)\/$/,'/')});
    if(cortiOwnAppearanceEntity)cortiLocalAppearance.attach(cortiYsmPlayers,cortiOwnAppearanceEntity);
    updateAppearanceUi();
  }).catch(error=>{cortiLocalAppearanceError=String(error.message);cortiLocalAppearance=new PaperBundledAppearanceSelection({bundles:[],storage,scope:new URL('./',import.meta.url).href.replace(/\/(third|3dview)\/$/,'/')});
    if(cortiOwnAppearanceEntity)cortiLocalAppearance.attach(cortiYsmPlayers,cortiOwnAppearanceEntity);updateAppearanceUi();});
}
function updateAppearanceUi(){
  const entity=resolveOwnAvatarEntity(),uuid=entity?.uuid?.toLowerCase()??null;
  if(appearanceSubject && appearanceSubject!==uuid)cortiYsmPlayers.resetSelection(appearanceSubject);
  appearanceSubject=uuid;
  const selection=cortiYsmPlayers.selection(uuid);
  if(cortiLocalAppearanceError)selection.status+=' · 网页原模型未加载：'+cortiLocalAppearanceError;
  if(cortiLocalAppearance?.skinError)selection.status+=' · '+cortiLocalAppearance.skinError;
  appearanceUi.update({...selection,subject:entity?.username??pendingAvatarState?.username??'当前观战人物'});
}
socket.on('appearanceAsset',bundle=>cortiYsmPlayers.asset(bundle));
socket.on('appearanceMotion',event=>cortiYsmPlayers.motion(event));
socket.on('avatarState',event=>{cortiOwnAppearanceEntity=event?.entity??null;if(cortiLocalAppearance&&cortiOwnAppearanceEntity)cortiLocalAppearance.attach(cortiYsmPlayers,cortiOwnAppearanceEntity);cortiYsmPlayers.bodyMotion(event);});
socket.on('entityAnimation',event=>cortiYsmPlayers.action(event));
socket.on('appearanceReset',()=>{cortiOwnAppearanceEntity=null;cortiAppearances.clear();cortiYsmPlayers.clear();cortiLocalAppearance?.clear();});
socket.on('appearanceRemove',event=>{cortiAppearances.delete(event?.playerUuid);cortiYsmPlayers.remove(event?.playerUuid);});
socket.on('appearanceState',event=>{
  if(event?.schemaVersion!==1||event.source!=='freesia_worker'||typeof event.playerUuid!=='string'||typeof event.renderAvailable!=='boolean')return;
  if(cortiAppearances.size<40||cortiAppearances.has(event.playerUuid)){cortiAppearances.set(event.playerUuid,event);cortiYsmPlayers.state(event);if(cortiOwnAppearanceEntity)cortiLocalAppearance?.attach(cortiYsmPlayers,cortiOwnAppearanceEntity);}
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
  const state=typeof isObsOverlay !== 'undefined' && isObsOverlay ? currentObsHandState() : pendingAvatarState;
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
  cortiHeldMap.style.display='none';cortiHeldMapKey=null;
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
// The OBS page deliberately has no native-world animation loop. Its 2D held
// map/photo preview still follows real inventory/pixel events and clears with
// the attested subject, without mounting item frames or rendering a world.
if (typeof isObsOverlay !== 'undefined' && isObsOverlay) {
  for (const name of ['avatarState', 'mapPixels', 'viewerSession']) socket.on(name, () => cortiUpdateHeldMap());
}
socket.on('mapFrame', event => cortiMapPhotos.handleFrame(event));
socket.on('textDisplay', event => cortiTextDisplays.handle(event));
const cortiAppearanceClear=()=>{cortiOwnAppearanceEntity=null;cortiLocalAppearance?.clear();cortiAppearances.clear();cortiYsmPlayers.clear();};
socket.on('disconnect', () => {cortiContentClear();cortiAppearanceClear();});
socket.on('viewerReset', () => {cortiContentClear();cortiAppearanceClear();});
loadViewerContentAssets(fetch,{minecraftVersion:cortiContentMinecraftVersion}).then(({assets,texture})=>{
  if(cortiContentDisposed){texture.dispose();return;}
  cortiNativeParticles.setAssets(assets,texture);cortiMapPhotos.setAssets(assets);
}).catch(error=>{cortiContentError=String(error.message);});
let cortiContentStatsAt = -Infinity;
function cortiAnimateNativeContent(now) {
  if(cortiContentDisposed)return;
  if(!document.hidden){cortiNativeParticles.tick(now);cortiMapPhotos.tick();cortiTextDisplays.tick();cortiYsmPlayers.tick(now);cortiUpdateHeldMap();}
  if(!document.hidden && now-appearanceUiAt>=500){appearanceUiAt=now;updateAppearanceUi();}
  // Keep nested diagnostics and DOM writes off the animation's frame budget.
  if(now-cortiContentStatsAt<250){requestAnimationFrame(cortiAnimateNativeContent);return;}
  cortiContentStatsAt=now;
  const photos=cortiMapPhotos.stats();
  const texts=cortiTextDisplays.stats();
  const ysm=cortiYsmPlayers.stats();
  // Per-action limitations remain in the stable model panel, not a flashing
  // overlay. Current frame errors are still available through stats().
  let unavailableAppearance;
  for(const row of cortiAppearances.values())if(row.available===false||!row.renderAvailable){unavailableAppearance=row;break;}
  const ysmMessage=ysm.actors.some(actor=>actor.animation?.base==='downed')?'倒地待救援':ysm.failed?'YSM 模型渲染失败：'+ysm.errors[0]:ysm.unavailable?paperYsmAvailabilityText(unavailableAppearance):ysm.pending?'正在加载原 YSM 模型':ysm.heldUnavailable.length?'部分 YSM 手持物外观暂未适配：'+ysm.heldUnavailable[0].name:'';
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
  if(cortiContentStatus.textContent!==message){cortiContentStatus.textContent=message;cortiContentStatus.style.display=message?'block':'none';}
  requestAnimationFrame(cortiAnimateNativeContent);
}
if (typeof isObsOverlay === 'undefined' || !isObsOverlay) requestAnimationFrame(cortiAnimateNativeContent);
window.cortiViewerContent={stats:()=>({ysm:cortiYsmPlayers.stats(),particles:cortiNativeParticles.stats(),photos:cortiMapPhotos.stats(),textDisplays:cortiTextDisplays.stats(),textDisplayError:cortiTextDisplayError,error:cortiContentError,epoch:cortiContentEpoch})};
window.addEventListener('pagehide',()=>{cortiContentDisposed=true;appearanceUi.dispose();cortiYsmPlayers.clear();cortiNativeParticles.dispose();cortiMapPhotos.dispose();cortiTextDisplays.dispose();cortiContentStatus.remove();cortiHeldMap.remove();},{once:true});
