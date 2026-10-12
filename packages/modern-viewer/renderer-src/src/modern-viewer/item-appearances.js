import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {bakeFaces} from '../native-viewer/model-loader.js';
import {nativeHeldItemTransform, nativeHeldArmMountMatrix} from '../native-viewer/native-held-items.js';

// Read the original component, not displayName or an invented registry ID.
// Native 1.20.6 is an integer; newer Via clients can expose a floats list.
export function itemCustomModelData(item) {
  if (!item || item.visualDataUnavailable) return null;
  const components=item.components;
  let value=Array.isArray(components) ? components.find(c=>['custom_model_data','minecraft:custom_model_data'].includes(c?.type??c?.name))?.data
    : components?.['minecraft:custom_model_data']??components?.custom_model_data;
  if(value && typeof value==='object')value=value.floats?.[0];
  return Number.isSafeInteger(value)&&value>=0&&value<16777216?value:null;
}
export const itemAppearanceKey=item=>`${String(item?.name??'').replace(/^minecraft:/,'')}:${itemCustomModelData(item)??''}`;
const pathFor=(id,kind)=>`${kind}/${id}.${kind==='models'?'json':'png'}`;
const safeId=id=>typeof id==='string'&&/^[a-z][a-z0-9_]{1,47}$/.test(id);

export function validateItemAppearanceManifest(manifest) {
  if(manifest?.schemaVersion!==1||manifest.minecraftVersion!=='1.20.6'||!Array.isArray(manifest.items)||manifest.items.length<1||manifest.items.length>64
    ||!/^[a-f0-9]{64}$/.test(manifest.catalogSha256??''))throw Error('ITEM_APPEARANCE_MANIFEST_INVALID');
  const ids=new Set(),keys=new Set(),paths=new Set();
  for(const item of manifest.items) {
    const key=`${item.baseId}:${item.modelData}`;
    if(!safeId(item.id)||ids.has(item.id)||keys.has(key)||!/^minecraft:[a-z0-9_]{1,64}$/.test(item.baseId??'')
      ||!Number.isInteger(item.modelData)||item.modelData<700000||item.modelData>=800000)throw Error('ITEM_APPEARANCE_DEFINITION_INVALID');
    ids.add(item.id);keys.add(key);
    for(const kind of ['models','textures','icons']) {
      const name=pathFor(item.id,kind),field={models:'model',textures:'texture',icons:'icon'}[kind],asset=manifest.assets?.[name];
      if(item[field]!==name||!asset||!/^[a-f0-9]{64}$/.test(asset.sha256??'')||!Number.isInteger(asset.bytes)||asset.bytes<1||asset.bytes>262144)throw Error('ITEM_APPEARANCE_ASSET_INVALID');
      paths.add(name);
    }
  }
  if(Object.keys(manifest.assets??{}).some(name=>!paths.has(name)))throw Error('ITEM_APPEARANCE_ASSET_INVALID');
  return manifest;
}

// Web Crypto is unavailable on plain LAN HTTP. The deterministic fallback is
// also tested against Node's SHA-256 so LAN viewers still verify their assets.
export function sha256Bytes(bytes) {
  const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const data=new Uint8Array(Math.ceil((bytes.length+9)/64)*64);data.set(bytes);data[bytes.length]=128;
  const view=new DataView(data.buffer);view.setUint32(data.length-8,Math.floor(bytes.length/0x20000000));view.setUint32(data.length-4,bytes.length*8);
  const rotate=(n,b)=>(n>>>b)|(n<<(32-b)),w=new Uint32Array(64);
  for(let offset=0;offset<data.length;offset+=64) {
    for(let n=0;n<16;n++)w[n]=view.getUint32(offset+n*4);
    for(let n=16;n<64;n++){const a=w[n-15],b=w[n-2];w[n]=w[n-16]+(rotate(a,7)^rotate(a,18)^(a>>>3))+w[n-7]+(rotate(b,17)^rotate(b,19)^(b>>>10));}
    let[a,b,c,d,e,f,g,i]=h;
    for(let n=0;n<64;n++){const t1=(i+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+k[n]+w[n])|0,t2=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))|0;i=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}
    [a,b,c,d,e,f,g,i].forEach((v,n)=>{h[n]=(h[n]+v)>>>0;});
  }
  return h.map(n=>n.toString(16).padStart(8,'0')).join('');
}

export async function loadItemAppearancePack(registry,{enabled=true,fetcher=fetch,textureLoader=async bytes=>{
  const url=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
  try{return await new THREE.TextureLoader().loadAsync(url);}finally{URL.revokeObjectURL(url);}
}}={}) {
  if(!enabled)return false;
  const response=await fetcher('/item-appearances/manifest.json');
  if(response.status===404)return false;
  if(!response.ok)throw Error('ITEM_APPEARANCE_MANIFEST_UNAVAILABLE');
  const raw=await response.text();if(raw.length>65536)throw Error('ITEM_APPEARANCE_MANIFEST_BUDGET');
  const manifest=validateItemAppearanceManifest(JSON.parse(raw)),textures=[];
  const bytes=async path=>{
    const response=await fetcher('/item-appearances/'+path);if(!response.ok)throw Error('ITEM_APPEARANCE_ASSET_UNAVAILABLE:'+path);
    const value=new Uint8Array(await response.arrayBuffer()),expected=manifest.assets[path];
    if(value.length!==expected.bytes||sha256Bytes(value)!==expected.sha256)throw Error('ITEM_APPEARANCE_HASH_MISMATCH:'+path);
    return value;
  };
  try {
    const results=await Promise.allSettled(manifest.items.map(async item=>{
      const model=JSON.parse(new TextDecoder().decode(await bytes(item.model)));
      if(model.parent||model.loader||!Array.isArray(model.elements)||model.elements.length<1||model.elements.length>96
        ||JSON.stringify(model.textures)!==JSON.stringify({palette:'qiandengji:item/'+item.id}))throw Error('ITEM_APPEARANCE_MODEL_UNSUPPORTED');
      for(const element of model.elements) {
        if(element.rotation||element.from?.length!==3||element.to?.length!==3
          ||![...element.from,...element.to].every(n=>Number.isFinite(n)&&n>=-16&&n<=32)
          ||!element.from.every((n,index)=>n<element.to[index]))throw Error('ITEM_APPEARANCE_GEOMETRY_INVALID');
      }
      // Validate geometry/UV before allocating GPU resources.
      const faces=bakeFaces(model);if(faces.length>576)throw Error('ITEM_APPEARANCE_GEOMETRY_BUDGET');
      const texture=await textureLoader(await bytes(item.texture));textures.push(texture);
      if(texture.image?.width!==32||texture.image?.height!==32)throw Error('ITEM_APPEARANCE_TEXTURE_INVALID');
      texture.flipY=true;texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
      await bytes(item.icon);
      return {item,model,faces,texture};
    }));
    const failure=results.find(result=>result.status==='rejected');if(failure)throw failure.reason;
    registry.install(manifest,results.map(result=>result.value));return true;
  } catch(error){for(const texture of textures)texture.dispose();throw error;}
}

const displayMatrix=(display,arm,context)=>{
  const transform=nativeHeldItemTransform(display,arm,context);
  return new THREE.Matrix4().compose(new THREE.Vector3(...transform.translation),new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.radians,'XYZ')),new THREE.Vector3(...transform.scale));
};
export class ItemAppearanceRegistry {
  constructor(){this.records=new Map();this.revision=0;this.manifest=null;this.error=null;}
  install(manifest,prepared) {
    this.clear();this.manifest=manifest;this.error=null;
    for(const row of prepared)this.records.set(`${row.item.baseId}:${row.item.modelData}`,row);
    this.revision++;
  }
  reserved(item){const n=itemCustomModelData(item);return n!==null&&n>=700000&&n<800000;}
  resolve(item){if(!item?.name)return null;return this.records.get(`minecraft:${item.name.replace(/^minecraft:/,'')}:${itemCustomModelData(item)}`)??null;}
  icon(item){const record=this.resolve(item);return record?'/item-appearances/'+record.item.icon:null;}
  modelName(item){const record=this.resolve(item);return record?'qiandengji:item/'+record.item.id:`qiandengji:unavailable/${itemAppearanceKey(item)}`;}
  createRaw(item) {
    const record=this.resolve(item);if(!record)throw Error('ITEM_APPEARANCE_UNAVAILABLE');
    const parts=record.faces.map(face=>{
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(face.position,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(face.uv,2));geometry.setIndex(face.indices);geometry.computeVertexNormals();return geometry;
    });
    const geometry=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());
    if(!geometry)throw Error('ITEM_APPEARANCE_GEOMETRY_MERGE_FAILED');
    const texture=record.texture.clone();texture.needsUpdate=true;
    const material=new THREE.MeshLambertMaterial({map:texture,side:THREE.DoubleSide,alphaTest:.1});
    // HoldingBlock disposes geometry/material but intentionally retains shared
    // maps. This map is an instance clone, so release it with its geometry.
    geometry.addEventListener('dispose',()=>texture.dispose());
    const root=new THREE.Group();root.add(new THREE.Mesh(geometry,material));root.name='qiandengji-item-'+record.item.id;
    root.userData={appearanceId:'qiandengji:'+record.item.id,modelData:record.item.modelData,source:'qiandengji_original_item_pack',catalogSha256:this.manifest.catalogSha256};
    let disposed=false;
    return {root,model:record.model,dispose(){if(disposed)return;disposed=true;root.removeFromParent();geometry.dispose();material.dispose();texture.dispose();root.clear();}};
  }
  create(item,context='firstperson',arm='right') {
    const result=this.createRaw(item),display=result.model.display?.[`${context}_${arm}hand`]??result.model.display?.[context]??{};
    if(['firstperson','thirdperson'].includes(context))result.root.applyMatrix4(displayMatrix(display,arm,context));
    else {const transform=displayMatrix(display,'right','thirdperson');result.root.applyMatrix4(transform);}
    return result;
  }
  clear(){for(const row of this.records.values())row.texture.dispose();this.records.clear();this.manifest=null;}
  stats(){return {items:this.records.size,catalogSha256:this.manifest?.catalogSha256??null,error:this.error};}
}
export const paperItemAppearances=new ItemAppearanceRegistry();
const rendererInstalls=new WeakMap();

/** Replace only our numeric namespace. Native equip/swap/swing/use groups and
 * OBS transparency remain responsible for timing and the final render pass.
 */
export function installItemAppearanceRenderer(world,registry=paperItemAppearances) {
  rendererInstalls.get(world)?.();
  const restores=[];
  const wrap=(target,key,fn)=>{const original=target[key];target[key]=fn(original);restores.push(()=>{target[key]=original;});};
  wrap(world,'getItemRenderData',original=>function(item,...args){
    const base=original.call(this,item,...args);
    return registry.reserved(item)?{...base,modelName:registry.modelName(item),customAppearance:!!registry.resolve(item)}:base;
  });
  for(const [arm,holding]of [['right',world.holdingBlock],['left',world.holdingBlockLeft]]) {
    if(!holding?.createItemModel)continue;
    wrap(holding,'createItemModel',original=>async function(handItem) {
      const item=handItem?.fullItem;if(!registry.reserved(item))return original.call(this,handItem);
      this.lastUpdate=performance.now();
      if(this.lastItemModelName===registry.modelName(item))return undefined;
      if(!registry.resolve(item)){registry.error='ITEM_APPEARANCE_UNAVAILABLE';return {model:new THREE.Group(),type:'item'};}
      const instance=registry.create(item,'firstperson',arm);
      // HoldingBlock owns and disposes the cloned per-instance GPU resources.
      this.lastItemModelName=registry.modelName(item);return {model:instance.root,type:'item'};
    });
  }
  wrap(world.entities,'getItemMesh',original=>function(item,props,faceCamera,previousModel) {
    if(!registry.reserved(item))return original.call(this,item,props,faceCamera,previousModel);
    if(previousModel===registry.modelName(item))return undefined;
    if(!registry.resolve(item)){registry.error='ITEM_APPEARANCE_UNAVAILABLE';return undefined;}
    const instance=registry.create(item,props?.['minecraft:display_context']??'ground');
    return {mesh:instance.root,isBlock:false,modelName:registry.modelName(item),cleanup:instance.dispose};
  });
  // Vanilla player arms use native pixel units. Attach the original custom
  // display transform at the wrist instead of the renderer's sprite heuristics.
  wrap(world.entities,'addItemModel',original=>function(entity,arm,item,isPlayer) {
    if(!isPlayer||!registry.reserved(item))return original.call(this,entity,arm,item,isPlayer);
    const name='custom_item_'+arm;
    entity.traverse(part=>{if(part.name===name){part.removeFromParent();part.additionalCleanup?.();}});
    if(!registry.resolve(item)){registry.error='ITEM_APPEARANCE_UNAVAILABLE';return;}
    const record=registry.resolve(item),transform=nativeHeldItemTransform(record.model.display?.[`thirdperson_${arm}hand`]??{},arm);
    entity.traverse(part=>{
      if(part.name!==arm+'Arm')return;
      const instance=registry.createRaw(item),mount=new THREE.Group();mount.name=name;
      mount.applyMatrix4(nativeHeldArmMountMatrix({arm,transform}));mount.add(instance.root);mount.additionalCleanup=instance.dispose;part.add(mount);
    });
  });
  let restored=false;
  const restore=()=>{if(restored)return;restored=true;for(const undo of restores.reverse())undo();rendererInstalls.delete(world);};
  rendererInstalls.set(world,restore);return restore;
}
