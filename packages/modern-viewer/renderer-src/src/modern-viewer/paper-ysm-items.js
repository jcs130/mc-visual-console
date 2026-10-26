import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {bakeFaces} from '../native-viewer/model-loader.js';
import {nativeGeneratedItemElements,nativeHeldItemTransform} from '../native-viewer/native-held-items.js';
import {createNativeModelPart} from '../native-viewer/native-entity-model.js';
import {paperItemAppearances} from './item-appearances.js';
import {paperItemHeads} from './item-heads.js';
import {nativeYsmItemMount} from '../native-viewer/native-ysm-item-mount.js';

export function resolvePaperHeldModel(models,name,ancestry=[]) {
  name=name.replace(/^minecraft:/,'');
  if(!/^(?:item|block)\/[a-z0-9_/-]{1,128}$/.test(name) || name.includes('..') || ancestry.includes(name) || ancestry.length>=24)throw Error('YSM_ITEM_MODEL_INVALID');
  const own=models[name];if(!own)throw Error('YSM_ITEM_MODEL_UNAVAILABLE:'+name);
  if(own.loader)throw Error('YSM_ITEM_LOADER_UNSUPPORTED');
  let parent={};
  if(own.parent==='builtin/generated')parent={generated:true};
  else if(own.parent==='builtin/entity' && name==='item/shield')parent={builtinShield:true};
  else if(own.parent?.startsWith('builtin/'))throw Error('YSM_ITEM_BUILTIN_UNSUPPORTED:'+name);
  else if(own.parent)parent=resolvePaperHeldModel(models,own.parent,[...ancestry,name]);
  return {...parent,...own,textures:{...parent.textures,...own.textures},display:{...parent.display,...own.display},elements:own.elements??parent.elements??[],sourceModels:[...(parent.sourceModels??[]),name]};
}
export function paperYsmItemMount(display,arm) {
  return nativeYsmItemMount(nativeHeldItemTransform(display,arm));
}
async function loadTexture(id) {
  if(!/^minecraft:(?:item|block)\/[a-z0-9_/-]{1,128}$/.test(id) && id!=='minecraft:entity/shield_base_nopattern')throw Error('YSM_ITEM_TEXTURE_UNSUPPORTED');
  if(id.includes('..'))throw Error('YSM_ITEM_TEXTURE_UNSUPPORTED');
  const texture=await new THREE.TextureLoader().loadAsync('/textures/1.20.6/'+id.slice(10)+'.png');
  texture.flipY=true;texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
  return texture;
}
function pixels(texture) {
  const image=texture.image,w=image.width,h=image.height;
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>512||h>512)throw Error('YSM_ITEM_SPRITE_BUDGET');
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
  return {width:w,height:h,pixels:ctx.getImageData(0,0,w,h).data};
}
const textureId=(textures,value)=>{
  const visited=new Set();while(value?.startsWith('#')){if(visited.has(value))throw Error('YSM_ITEM_TEXTURE_CYCLE');visited.add(value);value=textures[value.slice(1)];}
  if(!value)throw Error('YSM_ITEM_TEXTURE_UNAVAILABLE');return value.includes(':')?value:'minecraft:'+value;
};
// Minecraft 1.20.6 ShieldModel#createLayer, verified against official client
// 02dfd345ac1ad55692d5dbc8486ac7e4fea72cd54ac494a79cd48963048e56b2.
// Original ModelPart pixels and UVs, not a box-shaped icon or substitute mesh.
export const PAPER_SHIELD_PARTS={parts:[
  {name:'plate',pivot:[0,0,0],cubes:[{origin:[-6,-11,-2],size:[12,22,1],uv:[0,0]}]},
  {name:'handle',pivot:[0,0,0],cubes:[{origin:[-1,-3,-1],size:[2,6,6],uv:[26,0]}]},
]};
async function createPaperShield(model,item,arm,textureLoader,componentNames){
  if(componentNames.some(c=>['base_color','banner_patterns'].includes(String(c).replace(/^minecraft:/,''))) || item.nbt?.value?.BlockEntityTag || item.nbt?.BlockEntityTag)
    throw Error('YSM_SHIELD_PATTERN_UNSUPPORTED');
  const texture=await textureLoader('minecraft:entity/shield_base_nopattern');
  const material=new THREE.MeshLambertMaterial({map:texture,side:THREE.DoubleSide,alphaTest:.1});
  let geometry;
  try {
    geometry=createNativeModelPart(PAPER_SHIELD_PARTS,material,[64,64]);
    const root=new THREE.Group();root.add(geometry.root);
    // ItemRenderer centres BEFORE BlockEntityWithoutLevelRenderer flips Y/Z.
    // Unlike baked item faces, native ModelPart vertices have NOT been centred.
    const display=model.display['thirdperson_'+arm+'hand']??model.display.thirdperson_righthand??{};
    root.applyMatrix4(paperYsmItemMount(display,arm)
      .multiply(new THREE.Matrix4().makeTranslation(-.5,-.5,-.5))
      .multiply(new THREE.Matrix4().makeScale(1,-1,-1)));
    root.name='paper-ysm-held-'+arm;
    root.userData={item:'shield',sourceModels:model.sourceModels,source:'minecraft_1.20.6_ShieldModel',
      effectReason:item.enchantments?.length?'原版附魔光效尚未适配':null,completeEntityParityVerified:false};
    let disposed=false;
    return {root,dispose(){if(disposed)return;disposed=true;root.removeFromParent();geometry.dispose();material.dispose();texture.dispose();root.clear();}};
  }catch(error){geometry?.dispose();material.dispose();texture.dispose();throw error;}
}
export async function createPaperHeldItem(models,item,arm,{textureLoader=loadTexture,readPixels=pixels,itemAppearances=paperItemAppearances,context='thirdperson',tint=null,fullBright=false}={}) {
  const name=String(item?.name??'').replace(/^minecraft:/,'');if(!/^[a-z0-9_]{1,96}$/.test(name))throw Error('YSM_ITEM_NAMESPACE_UNSUPPORTED');
  if(item.visualDataUnavailable)throw Error('YSM_ITEM_COMPONENTS_UNAVAILABLE');
  if (paperItemHeads.reserved(item)) {
    const result = paperItemHeads.create(item);
    try { await result.ready; } catch (error) { result.dispose(); throw error; }
    result.root.applyMatrix4(paperYsmItemMount(result.model.display.thirdperson_righthand, arm));
    return result;
  }
  if(itemAppearances.reserved(item)) {
    const result=itemAppearances.createRaw(item),display=result.model.display?.['thirdperson_'+arm+'hand']??{};
    // Both custom and ordinary bakeFaces vertices are already centred. Use
    // the same native locator transform; do not introduce a second offset.
    result.root.applyMatrix4(paperYsmItemMount(display,arm));
    return result;
  }
  // These components select a different visual. Never show an ordinary item
  // while claiming its custom head/model/potion/leather appearance is correct.
  const components=item.components??[];
  const componentNames=Array.isArray(components)?components.map(c=>c.type??c.name??''):Object.keys(components);
  if(componentNames.some(c=>['custom_model_data','profile','dyed_color','potion_contents'].includes(String(c).replace(/^minecraft:/,''))))throw Error('YSM_ITEM_DYNAMIC_VISUAL_UNSUPPORTED');
  const model=resolvePaperHeldModel(models,'item/'+name),textures=new Map(),materials=new Map(),group=new THREE.Group(),unmerged=new Set();
  if(model.builtinShield)return createPaperShield(model,item,arm,textureLoader,componentNames);
  const getTexture=async id=>{if(!textures.has(id))textures.set(id,await textureLoader(id));return textures.get(id);};
  try {
    const modelsToBake=[];
    if(model.generated) {
      for(let n=0;n<5;n++) {
        const ref=model.textures['layer'+n];if(!ref)break;
        const id=textureId(model.textures,ref),texture=await getTexture(id);
        const elements=nativeGeneratedItemElements(await readPixels(texture)).map(e=>({...e,faces:Object.fromEntries(Object.entries(e.faces).map(([side,f])=>[side,{...f,texture:'#layer'+n,tintindex:n}]))}));
        modelsToBake.push({...model,elements});
      }
      if(!modelsToBake.length)throw Error('YSM_ITEM_TEXTURE_UNAVAILABLE');
    } else {
      if(!model.elements.length || model.elements.length>256)throw Error('YSM_ITEM_GEOMETRY_UNSUPPORTED');modelsToBake.push(model);
    }
    const batches=new Map();
    for(const part of modelsToBake)for(const face of bakeFaces(part,{}, {allowTint:true})) {
      if(face.tintIndex>=0 && !model.generated)throw Error('YSM_ITEM_TINT_UNSUPPORTED');
      if(!materials.has(face.texture)) {
        const Material=fullBright?THREE.MeshBasicMaterial:THREE.MeshLambertMaterial;
        materials.set(face.texture,new Material({map:await getTexture(face.texture),side:THREE.DoubleSide,alphaTest:.1,
          ...(typeof tint==='function'&&face.tintIndex>=0?{color:tint(face.tintIndex)}:{})}));
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(face.position,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(face.uv,2));geometry.setIndex(face.indices);geometry.computeVertexNormals();
      unmerged.add(geometry);
      if(!batches.has(face.texture))batches.set(face.texture,[]);
      batches.get(face.texture).push(geometry);
    }
    // An extruded sprite can have hundreds of edge faces. Preserve each source
    // face/UV while drawing one mesh per texture, rather than one per pixel edge.
    for(const [id,geometries]of batches) {
      const merged=mergeGeometries(geometries,false);for(const geometry of geometries){geometry.dispose();unmerged.delete(geometry);}
      if(!merged)throw Error('YSM_ITEM_GEOMETRY_MERGE_FAILED');
      group.add(new THREE.Mesh(merged,materials.get(id)));
    }
    const display=context==='ground'?(model.display.ground??{}):(model.display['thirdperson_'+arm+'hand']??model.display.thirdperson_righthand??{});
    const ground=context==='ground'?nativeHeldItemTransform(display,arm,'ground'):null;
    const mount=ground?new THREE.Matrix4().compose(new THREE.Vector3(...ground.translation),new THREE.Quaternion().setFromEuler(new THREE.Euler(...ground.radians,'XYZ')),new THREE.Vector3(...ground.scale)):paperYsmItemMount(display,arm);
    // All items use the same corrected locator basis. A crossbow-only sprite
    // roll used to mask the missing conversion and must not be applied twice.
    group.applyMatrix4(mount);group.name='paper-ysm-held-'+arm;
    group.userData={item:name,sourceModels:model.sourceModels,source:'minecraft_1.20.6_original_models',completeEntityParityVerified:false};
    let disposed=false;
    return {root:group,dispose(){if(disposed)return;disposed=true;group.removeFromParent();group.traverse(p=>p.geometry?.dispose());for(const m of materials.values())m.dispose();for(const t of textures.values())t.dispose();group.clear();}};
  }catch(error){for(const g of unmerged)g.dispose();group.traverse(p=>p.geometry?.dispose());for(const m of materials.values())m.dispose();for(const t of textures.values())t.dispose();throw error;}
}
export class PaperYsmHeldItems {
  constructor(model,models,options={}){this.model=model;this.models=models;this.options=options;this.hands=new Map();this.disposed=false;}
  apply(equipment,mainArm='right') {
    for(const[index,arm]of [mainArm,mainArm==='right'?'left':'right'].entries()) {
      const item=equipment?.[index],key=JSON.stringify([item??null,(this.options.itemAppearances??paperItemAppearances).revision]);if(this.hands.get(arm)?.key===key)continue;
      this.hands.get(arm)?.item?.dispose();const record={key,name:item?.name??null,status:item?'pending':'empty',item:null};this.hands.set(arm,record);
      if(!item)continue;
      const anchors=[...this.model.bones].filter(([name])=>new RegExp('^'+(arm==='right'?'Right':'Left')+'HandLocator(?:[2-8])?$').test(name)).map(([,bone])=>bone);
      if(!anchors.length){record.status='unavailable';record.reason='YSM_HAND_LOCATOR_UNAVAILABLE';continue;}
      // Most models have one locator. Extra native locators duplicate the item.
      record.copies=[];
      void Promise.allSettled(anchors.map(()=>createPaperHeldItem(this.models,item,arm,this.options))).then(results=>{
        const items=results.filter(r=>r.status==='fulfilled').map(r=>r.value),failure=results.find(r=>r.status==='rejected');
        if(failure){for(const i of items)i.dispose();throw failure.reason;}
        if(this.disposed || this.hands.get(arm)!==record){for(const i of items)i.dispose();return;}
        items.forEach((i,n)=>anchors[n].add(i.root));record.copies=items;record.item={dispose:()=>items.forEach(i=>i.dispose())};record.status='ready';
      }).catch(error=>{if(this.hands.get(arm)===record){record.status='unavailable';record.reason=error.message;}});
    }
  }
  stats(){return Object.fromEntries([...this.hands].map(([hand,r])=>[hand,{name:r.name,status:r.status,reason:r.reason??null,copies:r.copies?.length??0}]));}
  dispose(){this.disposed=true;for(const r of this.hands.values())r.item?.dispose();this.hands.clear();}
}
