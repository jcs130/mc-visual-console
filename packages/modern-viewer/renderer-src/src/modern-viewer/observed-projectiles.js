import * as THREE from 'three';
import data from './observed-projectile-data.json' with {type:'json'};
import {NATIVE_THROWN_ITEM_DEFINITIONS} from '../native-viewer/native-thrown-item-state.js';
import {nativePotionColor} from '../native-viewer/native-potion-items.js';
import {createOriginalModelLayer} from '../native-viewer/native-original-model-layers.js';
import {nativeTridentModel} from '../native-viewer/native-projectiles.js';
import {createNativeModelPart} from '../native-viewer/native-entity-model.js';
import {createPaperHeldItem} from './paper-ysm-items.js';
import {observedArrowDirection} from './observed-arrows.js';

const leaf=n=>String(n??'').replace(/^minecraft:/,'');
const special={llama_spit:['llama_spit','entity/llama/spit'],shulker_bullet:['shulker_bullet','entity/shulker/spark'],
 wind_charge:['wind_charge','entity/projectiles/wind_charge'],breeze_wind_charge:['wind_charge','entity/projectiles/wind_charge'],
 wither_skull:['wither_skull','entity/wither/wither']};
export const OBSERVED_PROJECTILE_TYPES=Object.freeze([...Object.keys(NATIVE_THROWN_ITEM_DEFINITIONS).map(leaf),
 'arrow','spectral_arrow','tipped_arrow','trident','firework_rocket','dragon_fireball',...Object.keys(special)]);
export const isObservedProjectile=name=>OBSERVED_PROJECTILE_TYPES.includes(leaf(name));
const definitions={...NATIVE_THROWN_ITEM_DEFINITIONS,'minecraft:firework_rocket':{item:'minecraft:firework_rocket',scale:1,fullBright:false}};
export function observedProjectileItem(entity,version='1.21.1',registry) {
 const name=leaf(entity?.name),def=definitions['minecraft:'+name];if(!def)return null;
 const slot=entity.metadata?.[8];
 if(slot===undefined)return {name:leaf(def.item),count:1,color:name==='potion'?(data.emptyPotionColor&0xffffff):null,source:'original_constructor'};
 if(!slot||typeof slot!=='object')throw Error('PROJECTILE_ITEM_SLOT_INVALID');
 if(slot.itemCount===0||slot.count===0)return null;
 const id=slot.itemId??slot.type;
 const item=slot.name?leaf(slot.name):registry?.items?.[id]?.name?leaf(registry.items[id].name):version==='1.21.1'?leaf(data.items.find(r=>r.id===id)?.name):'';
 if(!item)throw Error('PROJECTILE_ITEM_REGISTRY_UNAVAILABLE');
 let color=null;
 const components=slot.components??[];
 if(!Array.isArray(components))throw Error('PROJECTILE_ITEM_COMPONENTS_UNAVAILABLE');
 if(components.some(c=>['custom_model_data','profile','dyed_color'].includes(leaf(c.type))))throw Error('PROJECTILE_CUSTOM_APPEARANCE_UNSUPPORTED');
 if(['potion','splash_potion','lingering_potion'].includes(item)) {
   const potion=components.find(c=>leaf(c.type)==='potion_contents')?.data;
   if(potion && version!=='1.21.1' && potion.customColor==null)throw Error('PROJECTILE_POTION_REGISTRY_UNAVAILABLE');
   let decoded;
   if(potion) {
     decoded={};
     if(potion.potionId!=null && potion.customColor==null){const base=data.potions.find(p=>p.id===potion.potionId);if(!base)throw Error('PROJECTILE_POTION_REGISTRY_UNAVAILABLE');decoded.potion=base.name;}
     if(potion.customColor!=null)decoded.custom_color=potion.customColor;
     if(potion.customEffects!=null && potion.customColor==null)decoded.custom_effects=potion.customEffects.map(e=>{
       const effect=data.effects.find(row=>row.id===e.id);if(!effect)throw Error('PROJECTILE_EFFECT_REGISTRY_UNAVAILABLE');
       return {id:effect.name,amplifier:e.details?.amplifier??0,show_particles:e.details?.showParticles??true};
     });
   }
   color=nativePotionColor(decoded,data)&0xffffff;
 }
 return {name:item,count:slot.itemCount??slot.count??1,color,source:'received_item_stack'};
}
const textureCache=new Map();
function texture(version,path) {
 const key=version+'/'+path;
 if(!textureCache.has(key))textureCache.set(key,new THREE.TextureLoader().loadAsync('/textures/'+key+'.png').then(t=>{
   t.colorSpace=THREE.SRGBColorSpace;t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;t.generateMipmaps=false;return t;
 }).catch(e=>{textureCache.delete(key);throw e;}));
 // Item actors own/dispose their textures; keep a shared decoded source only.
 return textureCache.get(key).then(t=>{const copy=t.clone();copy.needsUpdate=true;return copy;});
}
export function preloadObservedProjectileTextures(version) {
 const paths=['item/egg','item/ender_pearl','item/experience_bottle','item/splash_potion','item/lingering_potion','item/potion_overlay','item/snowball','item/ender_eye','item/fire_charge','item/firework_rocket',
  'entity/enderdragon/dragon_fireball','entity/trident','entity/wither/wither_invulnerable',...Object.values(special).map(v=>v[1])];
 return Promise.allSettled([...new Set(paths)].map(p=>texture(version,p).then(t=>t.dispose())));
}
export async function createObservedProjectileVisual(entity,{models,version='1.21.1',registry,textureLoader=id=>texture(version,id.replace(/^minecraft:/,'')),readPixels}={}) {
 const name=leaf(entity.name),root=new THREE.Group();root.name='corti-observed-'+name;
 let owned=null,material=null,tex=null;
 try {
  const def=definitions['minecraft:'+name];
  if(def) {
   const item=observedProjectileItem(entity,version,registry);
   root.userData.billboard=name!=='firework_rocket';
   root.userData.projectileItem=item;
   if(item){owned=await createPaperHeldItem(models,{name:item.name,count:item.count},'right',{textureLoader,readPixels,context:'ground',
     fullBright:def.fullBright,tint:layer=>layer===0&&item.color!=null?item.color:0xffffff});root.add(owned.root);root.scale.setScalar(def.scale);}
   else root.visible=false;
  } else if(name==='dragon_fireball') {
   tex=await textureLoader('minecraft:entity/enderdragon/dragon_fireball');
   material=new THREE.MeshBasicMaterial({map:tex,alphaTest:.1,side:THREE.DoubleSide});
   const g=new THREE.PlaneGeometry(2,2);g.translate(0,.5,0);root.add(new THREE.Mesh(g,material));root.userData.billboard=true;
  } else if(name==='trident') {
   tex=await textureLoader('minecraft:entity/trident');material=new THREE.MeshLambertMaterial({map:tex,alphaTest:.1,side:THREE.DoubleSide});
   owned=createNativeModelPart(nativeTridentModel(),material,[32,32]);root.add(owned.root);root.userData.directionAxis=[0,-1,0];
  } else if(special[name]) {
   const [layer,path]=special[name];tex=await textureLoader('minecraft:'+(name==='wither_skull'&&entity.metadata?.[8]===true?'entity/wither/wither_invulnerable':path));
   material=new THREE.MeshLambertMaterial({map:tex,alphaTest:.1,side:THREE.DoubleSide});
   owned=createOriginalModelLayer(data,'minecraft:'+layer+'#main',material);root.add(owned.root);owned.root.scale.y*=-1;
   root.userData.issues=['Special renderer animation/light passes not yet pixel-parity verified'];
  } else throw Error('PROJECTILE_TYPE_UNSUPPORTED');
  root.userData.geometrySource='Minecraft_original_item_models_or_baked_layers';
  let disposed=false;
  return {root,dispose(){if(disposed)return;disposed=true;root.removeFromParent();owned?.dispose();if(!owned)root.traverse(p=>p.geometry?.dispose());material?.dispose();tex?.dispose();root.clear();}};
 }catch(e){owned?.dispose();material?.dispose();tex?.dispose();throw e;}
}

/** Removed/replaced entities cannot be resurrected by a late texture load. */
export class ObservedProjectileLayer {
 constructor({scene,origin=()=>({x:0,y:0,z:0}),models,version,registry,create=createObservedProjectileVisual}={}){Object.assign(this,{scene,origin,models,version,registry,create});this.records=new Map();}
 update(entity) {
  const id=String(entity.id);
  if(entity.delete){this.remove(id);return;}
  if(!isObservedProjectile(entity.name)||['arrow','spectral_arrow','tipped_arrow'].includes(leaf(entity.name))){this.remove(id);return;}
  const key=JSON.stringify([entity.name,entity.metadata?.[8]??null]),old=this.records.get(id);
  if(old?.key===key){old.entity=entity;return;}
  this.remove(id);
  const row={key,entity,actor:null,error:null};this.records.set(id,row);
  void this.create(entity,{models:this.models,version:this.version,registry:this.registry?.()}).then(actor=>{
   if(this.records.get(id)!==row){actor.dispose();return;}
   row.actor=actor;this.scene().add(actor.root);this.tick();
  }).catch(e=>{if(this.records.get(id)===row)row.error=String(e.message);});
 }
 tick(camera) {
  for(const row of this.records.values()){
   if(!row.actor)continue;const {entity,actor}=row,p=entity.pos??entity.position;
   if(!p||![p.x,p.y,p.z].every(Number.isFinite)){actor.root.visible=false;continue;}
   const o=this.origin();actor.root.position.set(p.x-o.x,p.y-o.y,p.z-o.z);actor.root.visible=actor.root.userData.projectileItem!==null&&!(Number(entity.metadata?.[0])&32);
   if(actor.root.userData.directionAxis){const d=observedArrowDirection(entity,row.lastPos,row.lastDir);if(d){actor.root.quaternion.setFromUnitVectors(new THREE.Vector3(...actor.root.userData.directionAxis),d);row.lastDir=d;}row.lastPos={x:p.x,y:p.y,z:p.z};}
   else if(actor.root.userData.billboard&&camera)camera.getWorldQuaternion(actor.root.quaternion);
   else if(Number.isFinite(entity.yaw)&&Number.isFinite(entity.pitch))actor.root.rotation.set(entity.pitch,entity.yaw,0);
  }
 }
 remove(id){const r=this.records.get(String(id));r?.actor?.dispose();this.records.delete(String(id));}
 clear(){for(const id of this.records.keys())this.remove(id);}
}
