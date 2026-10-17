import {parseNativeItemStack} from './native-item-stack.js';
import {itemHeadProfile} from '../modern-viewer/item-profile.js';
import {NativeBlockItemIconRenderer,loadNativeCutoutItemTexture} from './native-block-item-icons.js';
import {prepareNativeProfileItemIcon} from './native-profile-item-icons.js';
const allowed=new Set(['minecraft:custom_model_data','minecraft:custom_data','minecraft:custom_name','minecraft:item_name','minecraft:lore','minecraft:damage','minecraft:repair_cost','minecraft:rarity','minecraft:enchantments','minecraft:unbreakable','minecraft:hide_tooltip','minecraft:hide_additional_tooltip']);
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
/** Only an attested current server pack can resolve its exact item selectors. */
export class ServerItemIcons {
  constructor({reader,profileRendererOptions={},fetchResource=url=>fetch(url),onChange=()=>{},createUrl=blob=>URL.createObjectURL(blob),revokeUrl=url=>URL.revokeObjectURL(url)}={}){
    Object.assign(this,{reader,profileRendererOptions,fetchResource,onChange,createUrl,revokeUrl});this.id=null;this.catalog=null;this.entries=new Map();this.profileTextures=new Map();this.epoch=0;this.disposed=false;
  }
  setPack(id){
    id=typeof id==='string'&&/^[a-z0-9_.-]{1,80}$/.test(id)?id:null;
    if(this.disposed||id===this.id)return;
    this.clear();this.id=id;const epoch=this.epoch;
    if(!id)return;
    void this.fetchResource('api/server-items').then(async response=>{
      if(!response.ok)throw Error('SERVER_ITEM_PACK_UNAVAILABLE');
      const catalog=await response.json();
      if(catalog.available!==true||catalog.id!==id||catalog.minecraftVersion!=='1.21.1'||!Array.isArray(catalog.items)||catalog.items.length>64)throw Error('SERVER_ITEM_PACK_IDENTITY_MISMATCH');
      if(this.disposed||epoch!==this.epoch)return;
      this.catalog=catalog;this.onChange();
    }).catch(error=>{if(!this.disposed&&epoch===this.epoch){this.packReason=error.message;this.onChange();}});
  }
  selector(item){
    if(!this.catalog||!this.id)return null;
    let stack;try{stack=parseNativeItemStack(item);}catch{return null;}
    if(stack.id==='minecraft:player_head'){
      if(Object.keys(stack.components).some(key=>key!=='minecraft:profile'&&!allowed.has(key))||Object.hasOwn(stack.components,'minecraft:custom_model_data'))return null;
      const profile=itemHeadProfile({name:stack.id,components:stack.components});
      return profile?.hash?this.catalog.items.find(row=>row.baseId===stack.id&&row.profileTextureHash===profile.hash)??null:null;
    }
    if(Object.keys(stack.components).some(key=>!allowed.has(key)))return null;
    const custom=stack.components['minecraft:custom_model_data'];
    if(!Number.isSafeInteger(custom))return null;
    return this.catalog.items.find(row=>row.baseId===stack.id&&row.customModelData===custom)??null;
  }
  resolve(item){
    const row=this.selector(item);if(!row)return null;
    const key=item.name+'#'+item.snbt;
    if(!this.entries.has(key)){
      if(this.entries.size>=64)return null;
      const entry={result:null,reason:'loading'};this.entries.set(key,entry);const epoch=this.epoch;
      void (async()=>{
        try{
          if(typeof row.icon!=='string'||!/^[a-z0-9_./-]{1,160}\.png$/.test(row.icon)||row.icon.split('/').some(v=>v==='.'||v==='..'||!v))throw Error('SERVER_ITEM_ICON_PATH_INVALID');
          const expected=this.catalog.assets?.[row.icon];
          if(!expected||expected.bytes>262144||!/^[a-f0-9]{64}$/.test(expected.sha256??''))throw Error('SERVER_ITEM_ICON_UNVERIFIED');
          const response=await this.fetchResource('api/server-items/assets/'+row.icon);if(!response.ok)throw Error('SERVER_ITEM_ICON_UNAVAILABLE');
          const bytes=await response.arrayBuffer();
          if(bytes.byteLength!==expected.bytes||await digest(bytes)!==expected.sha256)throw Error('SERVER_ITEM_ICON_HASH_MISMATCH');
          if(this.disposed||epoch!==this.epoch)return;
          let blob=new Blob([bytes],{type:'image/png'}),renderInfo={};
          if(row.profileTextureHash){
            const plan=await prepareNativeProfileItemIcon(this.reader,row.profileTextureHash);
            if(this.disposed||epoch!==this.epoch)return;
            this.profileTextures.set(plan.texturePaths[0],new Uint8Array(bytes));
            const reader={bytes:path=>this.profileTextures.has(path)?Promise.resolve(this.profileTextures.get(path)):this.reader.bytes(path)};
            this.profileRenderer??=new NativeBlockItemIconRenderer(reader,{loadTexture:loadNativeCutoutItemTexture,...this.profileRendererOptions});
            // Each render owns its selected texture; no later profile may reuse another skin.
            const rendered=await this.profileRenderer.render('minecraft:player_head',plan);
            ({blob,...renderInfo}=rendered);
          }
          if(this.disposed||epoch!==this.epoch)return;
          entry.result={verified:true,url:this.createUrl(blob),...renderInfo,sourcePath:row.icon,source:'explicit_server_pack:'+this.id,
            catalogSha256:this.catalog.catalogSha256,representation:this.catalog.representation,pixelParityVerified:false};entry.reason=null;
        }catch(error){entry.reason=error.message;}
        finally{if(!this.disposed&&epoch===this.epoch)this.onChange();}
      })();
    }
    return this.entries.get(key).result;
  }
  reason(item){const entry=this.entries.get(item.name+'#'+item.snbt);return this.selector(item)?entry?entry.reason:'loading':null;}
  clear(){this.epoch++;for(const entry of this.entries.values())if(entry.result)this.revokeUrl(entry.result.url);this.entries.clear();this.profileTextures.clear();this.catalog=null;this.packReason=undefined;}
  dispose(){this.disposed=true;this.clear();this.profileRenderer?.dispose();}
}
