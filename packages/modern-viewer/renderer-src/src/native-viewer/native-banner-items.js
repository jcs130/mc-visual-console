import {nativeCubeFaces} from './native-entity-model.js';
import {nativeGuiItemTransform} from './native-block-item-icons.js';
import {verifyNativeStaticItemEvidence} from './native-static-item-providers.js';
import {NATIVE_BANNER_COLORS,nativeBannerLayers} from './native-banner-data.js';
export {NATIVE_BANNER_COLORS} from './native-banner-data.js';

// Original 1.21.1 DyeColor textureDiffuseColor order (cti), not map colors.
// BannerRenderer.createBodyLayer (ggu). GUI dispatch uses the detached block
// entity: no world-time animation is inferred from another player's world.
export const NATIVE_BANNER_PARTS=Object.freeze([
 {name:'pole',origin:[-1,-30,-1],size:[2,42,2],uv:[44,0]},
 {name:'bar',origin:[-10,-32,-1],size:[20,2,2],uv:[0,42]},
 {name:'flag',origin:[-10,0,-2],size:[20,40,1],uv:[0,0]}
]);
export async function prepareNativeBannerItem(reader,name,stack){
 const evidence=verifyNativeStaticItemEvidence(reader,name),color=name.slice(10,-7);
 if(evidence.kind!=='banner'||!Object.hasOwn(NATIVE_BANNER_COLORS,color))throw Error('NATIVE_BANNER_ITEM_UNSUPPORTED');
 const path=`assets/minecraft/models/item/${color}_banner.json`,templatePath='assets/minecraft/models/item/template_banner.json';
 const own=await reader.json(path),model=await reader.json(templatePath);
 if(!['item/template_banner','minecraft:item/template_banner'].includes(own.parent)||Object.keys(own).length!==1||
  !['builtin/entity','minecraft:builtin/entity'].includes(model.parent)||model.gui_light!=='front')throw Error('NATIVE_BANNER_MODEL_UNSUPPORTED');
 const texturePaths=['assets/minecraft/textures/entity/banner_base.png','assets/minecraft/textures/entity/banner/base.png'];
 const layers=nativeBannerLayers(stack).slice(0,16);
 for(const row of layers){const path=`assets/${row.asset.replace(':','/textures/entity/banner/')}.png`;if(!texturePaths.includes(path))texturePaths.push(path);}
 for(const texture of texturePaths){
  if(reader.manifest.assets[texture+'.mcmeta'])throw Error('NATIVE_BANNER_ANIMATION_UNSUPPORTED');
  const bytes=await reader.bytes(texture),data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(bytes.length<33||data.getUint32(16)!==64||data.getUint32(20)!==64)throw Error('NATIVE_BANNER_TEXTURE_INVALID');
 }
 const angle=Math.fround(Math.fround(Math.fround(-.0125)+Math.fround(.01))*Math.fround(Math.PI)),scale=Math.fround(2/3);
 const faces=[];
 for(const part of NATIVE_BANNER_PARTS){
  const transform=position=>position.map((value,index)=>{
   if(part.name==='flag'){
    const offset=index%3;if(offset===1)value=position[index]*Math.cos(angle)-position[index+1]*Math.sin(angle)-32;
    if(offset===2)value=position[index-1]*Math.sin(angle)+position[index]*Math.cos(angle);
   }
   return value/16*scale*(index%3===0?1:-1);
  });
  for(const face of nativeCubeFaces(part,[64,64])){
   const transformed={...face,part:part.name,position:transform(face.position),texture:'minecraft:entity/banner_base'};
   faces.push(transformed);
   if(part.name==='flag'){
    faces.push({...transformed,texture:'minecraft:entity/banner/base',tintColor:NATIVE_BANNER_COLORS[color],renderOrder:1,nativeBannerPattern:true});
    for(const [index,row] of layers.entries())faces.push({...transformed,texture:row.asset.replace(':',':entity/banner/'),tintColor:row.tintColor,renderOrder:index+2,nativeBannerPattern:true});
   }
  }
 }
 return {name,kind:'native-builtin-banner-gui',model:{...model,sourcePaths:[path,templatePath]},faces,
  transform:nativeGuiItemTransform(model.display?.gui),texturePaths,textureDimensions:[64,64],
  sourcePaths:[path,templatePath,...texturePaths],evidence,pixelParityVerified:false};
}
