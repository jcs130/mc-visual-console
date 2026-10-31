import { BundledAppearanceReader } from '../native-viewer/native-bundled-appearance.js';
import { BUNDLED_LIMITS } from '../native-viewer/native-bundled-contract.js';
import {BrowserSkinStore,readWebSkin,paperSkinBundle,validateWebSkinImage} from './web-skin.js';
import {supportedYsmBundleVersion} from './ysm-profile.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const PAPER_BUNDLED_SCHEMA='mc-paper-appearances/v1';
// Large original uploaded rigs can exceed the native built-in profile's 2 MiB
// per-file bound. Keep this opt-in profile separate from native/server limits.
export const PAPER_BUNDLED_LIMITS=Object.freeze({...BUNDLED_LIMITS,file:4*1024*1024,total:12*1024*1024});
const base64=bytes=>{let text='';for(const byte of bytes)text+=String.fromCharCode(byte);return btoa(text);};
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');

/** Optional original resources from this viewer's deployment, not server YSM attachments. */
export async function loadPaperBundledAppearances(endpoint,{fetcher=globalThis.fetch,storage=null}={}) {
  const response=await fetcher(endpoint,{cache:'no-store'});
  if(response.status===404)return null;
  if(!response.ok)throw Error('PAPER_BUNDLED_CONFIG_UNAVAILABLE');
  const text=await response.text();
  if(new TextEncoder().encode(text).length>BUNDLED_LIMITS.catalog)throw Error('PAPER_BUNDLED_CONFIG_TOO_LARGE');
  const config=JSON.parse(text);
  if(config.schema!==PAPER_BUNDLED_SCHEMA || !/^[a-f0-9]{24,64}$/.test(config.selectionScope??'') ||
      !config.defaults || typeof config.defaults!=='object' || Array.isArray(config.defaults) ||
      Object.entries(config.defaults).length>16 || Object.entries(config.defaults).some(([uuid,id])=>!UUID.test(uuid)||typeof id!=='string'))throw Error('PAPER_BUNDLED_CONFIG_INVALID');
  const base=new URL('./assets/',endpoint);
  const reader=new BundledAppearanceReader(config.catalog,async path=>{
    const response=await fetcher(new URL(path,base));
    if(!response.ok)throw Error('BUNDLED_ASSET_UNAVAILABLE');
    if(Number(response.headers?.get('content-length'))>PAPER_BUNDLED_LIMITS.file)throw Error('BUNDLED_ASSET_TOO_LARGE');
    return response.arrayBuffer();
  },{limits:PAPER_BUNDLED_LIMITS});
  const bundles=[];
  for(const row of reader.catalog.appearances) {
    if(row.kind!=='ysm')continue;
    if(!supportedYsmBundleVersion(row.ysmVersion))throw Error('PAPER_BUNDLED_YSM_VERSION_UNSUPPORTED');
    const files={};
    for(const path of new Set(Object.values(row.files))) {
      const bytes=await reader.bytes(path);files[path]={...reader.catalog.assets[path],base64:base64(bytes)};
    }
    // Aliases only; the original definition, geometry, UVs and PNG bytes are untouched.
    files['ysm.json']=files[row.files.definition];
    const definition=await reader.json(row.files.definition);
    if(definition.spec!==2 || definition.properties?.free!==true)throw Error('YSM_DEFINITION_UNSUPPORTED');
    const digest=await sha(new TextEncoder().encode(JSON.stringify(Object.entries(files).map(([p,f])=>[p,f.sha256]).sort())));
    bundles.push({id:`bundled:${row.id}`,bundle:{schemaVersion:1,format:'ysm-bedrock-original',source:'plugin_bundled',
      assetSha256:digest,sourceSha256:digest,modelId:row.modelId,displayLabel:row.label,
      ysmVersion:row.ysmVersion,model:row.files.model,animation:row.files.animation,
      animations:{arm:row.files.armAnimation,extra:row.files.extraAnimation},textures:{[row.texture]:row.files.texture},files},texture:row.texture});
  }
  const ids=new Set(bundles.map(row=>row.id));
  if(Object.values(config.defaults).some(id=>id!=='server'&&!ids.has(id)))throw Error('PAPER_BUNDLED_DEFAULT_UNAVAILABLE');
  return new PaperBundledAppearanceSelection({bundles,defaults:config.defaults,storage,scope:config.selectionScope});
}

/** Preferences survive reconnect; actual identities, poses and actors never do. */
export class PaperBundledAppearanceSelection {
  constructor({bundles,defaults={},storage=null,scope,decodeSkin=validateWebSkinImage}) {
    this.bundles=bundles;this.defaults=defaults;this.storage=storage;this.scope=scope;this.selections=new Map();this.revision=0;this.subject=null;
    this.skinStore=new BrowserSkinStore(storage,scope);this.uploads=new Map();this.skinLoads=new Set();this.skinError=null;this.uploadSequence=0;
    this.decodeSkin=decodeSkin;
  }
  key(uuid){return `paper-appearance/v1:${this.scope}:${uuid}`;}
  choiceId(id){const row=this.bundles.find(row=>row.id===id);return row?`ysm:${row.bundle.assetSha256}:${encodeURIComponent(row.texture)}`:id;}
  attach(players,entity) {
    const uuid=entity?.uuid?.toLowerCase();
    if(entity?.isSelf!==true || !UUID.test(uuid??'') || !Number.isSafeInteger(entity.id) || entity.id<0)return false;
    for(const row of this.bundles)players.asset(row.bundle,{maxBytes:16*1024*1024});
    const upload=this.uploads.get(uuid);if(upload)players.asset(upload);
    players.localEntity(entity,`web-entity-${this.revision}`);
    if(!this.skinLoads.has(uuid)){
      this.skinLoads.add(uuid);const revision=this.revision;
      void this.skinStore.load(uuid).then(skin=>{if(!skin)return;this.uploads.set(uuid,paperSkinBundle(skin));this.subject=null;
        if(revision!==this.revision)return;
        const current=players.entity(entity.id);if(current?.isSelf&&current.uuid?.toLowerCase()===uuid&&players.states.has(uuid))this.attach(players,current);
      }).catch(error=>{this.skinError=String(error.message);});
    }
    const row=players.states.get(uuid);if(!row || row.entityId!==entity.id)return false;
    if(this.subject?.uuid===uuid&&this.subject.entityId===entity.id&&this.subject.epoch===row.epoch&&(players.overrides.has(uuid)||this.subject.selected==='server'))return true;
    if(this.subject && (this.subject.uuid!==uuid || this.subject.entityId!==entity.id))players.resetSelection(this.subject.uuid);
    this.subject={uuid,entityId:entity.id,epoch:row.epoch};
    let id=this.selections.get(uuid);
    try{id??=this.storage?.getItem(this.key(uuid));}catch{}
    id??=this.choiceId(this.defaults[uuid]??'server');
    if(!players.choices().some(row=>row.id===id))id='server';
    if(players.selection(uuid).selected!==id)players.select(uuid,id);
    this.subject.selected=id;
    return true;
  }
  select(players,uuid,id) {
    if(!players.select(uuid,id))return false;
    this.uploadSequence++;
    this.selections.set(uuid,id);try{this.storage?.setItem(this.key(uuid),id);}catch{}
    if(this.subject?.uuid===uuid)this.subject.selected=id;
    return true;
  }
  async upload(players,entity,file,model){
    const uuid=entity?.uuid?.toLowerCase(),id=entity?.id,sequence=++this.uploadSequence;
    if(!file||!this.attach(players,entity))throw Error('请先连接并确认当前观战玩家');
    if(file.size>4*1024*1024)throw Error('请选择不超过 4 MB 的 PNG 皮肤');
    const skin=await readWebSkin(new Uint8Array(await file.arrayBuffer()),{model,label:file.name});
    await this.decodeSkin(skin);
    const current=players.entity(id);
    if(sequence!==this.uploadSequence||!current?.isSelf||current.uuid?.toLowerCase()!==uuid||!players.states.has(uuid))throw Error('观战玩家已变化，请重新上传');
    const saved=this.skinStore.save(uuid,skin),bundle=paperSkinBundle(skin);this.uploads.set(uuid,bundle);players.asset(bundle);
    this.select(players,uuid,`ysm:${bundle.assetSha256}:${model}`);
    this.skinError=saved?null:'浏览器存储不可用，皮肤仅保留到本页关闭';
    return {saved,sha256:skin.sha256};
  }
  clear(){this.revision++;this.uploadSequence++;this.subject=null;}
}
