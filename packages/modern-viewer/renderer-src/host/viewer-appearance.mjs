import {createYsmAssetReceiver} from './viewer-ysm-assets.mjs';
/** Observe authoritative Freesia metadata on the existing action connection. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const APPEARANCE_CHANNEL='mcagent:appearance';
export const PAPER_YSM_JAR_SHA256='ec51cfae84d219a45fac5098a31bfe980bcb7c2d8b413e8fffbd05a411a85680';
export function parseAppearancePacket(packet) {
  if(packet?.channel!==APPEARANCE_CHANNEL || !(packet.data instanceof Uint8Array) || packet.data.length>2048)return null;
  let value;try {value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(packet.data));}catch{return null;}
  if(!value || value.schemaVersion!==1 || value.source!=='freesia_worker' || !UUID.test(value.epoch??'') || !UUID.test(value.playerUuid??''))return null;
  const base={schemaVersion:1,source:value.source,epoch:value.epoch,playerUuid:value.playerUuid.toLowerCase(),type:value.type};
  if(value.type==='remove')return base;
  if(value.type!=='state' || typeof value.available!=='boolean' || value.ysmVersion!=='2.4.1' || value.protocolVersion!=='2.4.0' || value.jarSha256!==PAPER_YSM_JAR_SHA256)return null;
  Object.assign(base,{available:value.available,ysmVersion:value.ysmVersion,protocolVersion:value.protocolVersion,jarSha256:value.jarSha256});
  if(!value.available)return {...base,reason:value.reason==='YSM_WORKER_STATE_UNSUPPORTED'?'YSM_WORKER_STATE_UNSUPPORTED':'YSM_WORKER_STATE_UNAVAILABLE'};
  if(!Number.isSafeInteger(value.entityId) || value.entityId<0 || value.entityId>2147483647 || typeof value.mandatory!=='boolean'
    || !/^[\p{L}\p{N}_./-]{1,96}$/u.test(value.modelId??'') || value.modelId.includes('..') || value.modelId.startsWith('/') || !/^[\p{L}\p{N}_.-]{1,96}$/u.test(value.texture??'')
    || typeof value.animation!=='string' || value.animation.length>96)return null;
  const web=value.webAvailable===true && /^[a-f0-9]{64}$/.test(value.assetSha256??'') && Number.isInteger(value.assetBytes) && value.assetBytes>0 && value.assetBytes<=2*1024*1024;
  return {...base,entityId:value.entityId,modelId:value.modelId,texture:value.texture,mandatory:value.mandatory,animation:value.animation,
    webAvailable:web,...(web?{assetSha256:value.assetSha256,assetBytes:value.assetBytes}:{webReason:typeof value.webReason==='string'?value.webReason.slice(0,96):'YSM_SOURCE_NOT_REGISTERED'})};
}
export function createViewerAppearanceBridge(bot, {now=Date.now}={}) {
  const records=new Map(),listeners=new Set();let epoch=null,disposed=false;
  const errors=new Map();
  const assets=createYsmAssetReceiver(bot,{onAsset:bundle=>{emit('appearanceAsset',bundle);for(const row of records.values())if(row.assetSha256===bundle.assetSha256){const bound=binding(row);if(bound)emit('appearanceState',bound);}},onError:(row,reason)=>{errors.set(row.assetSha256,reason);const bound=binding(row);if(bound)emit('appearanceState',bound);}});
  const emit=(name,row)=>{for(const fn of listeners)try{fn(name,row);}catch{listeners.delete(fn);}};
  const reset=()=>{records.clear();errors.clear();assets.reset();epoch=null;emit('appearanceReset',{schemaVersion:1});};
  function binding(row) {
    const ownUuid=bot._client.uuid??bot.player?.uuid;
    const own=ownUuid?.toLowerCase()===row.playerUuid;
    const entity=own?bot.entity:bot.entities?.[row.entityId];
    const actualUuid=own?ownUuid:entity?.uuid;
    if(!entity || typeof actualUuid!=='string' || actualUuid.toLowerCase()!==row.playerUuid || row.available && entity.id!==row.entityId)return null;
    const {receivedAt,...publicRow}=row;
    const asset=assets.get(row.assetSha256), renderAvailable=row.available===true && asset?.modelId===row.modelId && Object.hasOwn(asset.textures,row.texture);
    return {...publicRow,entityId:entity.id,renderAvailable,renderReason:renderAvailable?null:errors.get(row.assetSha256)??row.webReason??'YSM_ASSET_PENDING',completeEntityParityVerified:false};
  }
  function payload(packet) {
    const row=parseAppearancePacket(packet);if(!row)return;
    if(epoch!==row.epoch){reset();epoch=row.epoch;}
    if(row.type==='remove'){records.delete(row.playerUuid);emit('appearanceRemove',{schemaVersion:1,playerUuid:row.playerUuid});return;}
    if(records.size>=40 && !records.has(row.playerUuid))return;
    // Reuse an ID only from this epoch's preceding state; binding still checks
    // the current connection's native entity UUID before emitting unavailable.
    if(!row.available)row.entityId=records.get(row.playerUuid)?.entityId;
    records.set(row.playerUuid,{...row,receivedAt:now()});const bound=binding(row);if(bound){const bundle=assets.get(row.assetSha256);if(bundle)emit('appearanceAsset',bundle);emit('appearanceState',bound);if(listeners.size)assets.request(row);}
  }
  const tracked=entity=>{
    const uuid=entity?.uuid?.toLowerCase();const row=uuid&&records.get(uuid);const bound=row&&binding(row);if(bound)emit('appearanceState',bound);
  };
  const gone=entity=>{if(entity?.uuid)emit('appearanceRemove',{schemaVersion:1,playerUuid:entity.uuid.toLowerCase()});};
  bot._client.on('custom_payload',payload);bot.on('entitySpawn',tracked);bot.on('entityGone',gone);
  bot.on('login',reset);bot.on('respawn',reset);bot.on('end',reset);
  const expire=()=>{for(const [uuid,row] of records)if(now()-row.receivedAt>15000){records.delete(uuid);emit('appearanceRemove',{schemaVersion:1,playerUuid:uuid});}};
  const timer=setInterval(expire,1000);timer.unref?.();
  const snapshot=()=>{expire();return Array.from(records.values()).map(binding).filter(Boolean);};
  return {snapshot,subscribeSocket(socket){
    if(disposed)throw Error('viewer_appearance_disposed');
    const fn=(name,row)=>socket.emit(name,row);listeners.add(fn);
    socket.emit('appearanceReset',{schemaVersion:1});for(const row of snapshot()){const bundle=assets.get(row.assetSha256);if(bundle)socket.emit('appearanceAsset',bundle);socket.emit('appearanceState',row);assets.request(row);}
    return()=>listeners.delete(fn);
  },dispose(){if(disposed)return;disposed=true;assets.dispose();clearInterval(timer);bot._client.off('custom_payload',payload);bot.off('entitySpawn',tracked);bot.off('entityGone',gone);bot.off('login',reset);bot.off('respawn',reset);bot.off('end',reset);records.clear();listeners.clear();}};
}
