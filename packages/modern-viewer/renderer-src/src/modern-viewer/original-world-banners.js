import * as THREE from 'three';
import {createNativeModelPart} from '../native-viewer/native-entity-model.js';
import {NATIVE_BANNER_PARTS} from '../native-viewer/native-banner-geometry.js';
import {NATIVE_BANNER_COLORS,NATIVE_BANNER_PATTERNS,nativeBannerLayers} from '../native-viewer/native-banner-data.js';

export function originalWorldBannerLayers(name,nbt){
 const color=name.replace(/_wall_banner$/,'_banner').replace(/_banner$/,'');
 if(!Object.hasOwn(NATIVE_BANNER_COLORS,color))throw Error('ORIGINAL_BANNER_COLOR_UNSUPPORTED');
 if(nbt?.Patterns?.length)throw Error('ORIGINAL_BANNER_LEGACY_PATTERNS_UNSUPPORTED');
 return [{asset:'minecraft:base',tintColor:NATIVE_BANNER_COLORS[color]},
  ...nativeBannerLayers({components:{'minecraft:banner_patterns':nbt?.patterns??[]}}).slice(0,16)];
}

// Exact 1.21.1 BannerRenderer pose: 16 standing rotations; wall facing has a separate translation and no pole.
export function originalWorldBannerMesh(position,rotation,isWall,texture,light=(m)=>{},blockLight=0,skyLight=1,skyLevel=1){
 const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.01});
 light(material,blockLight,skyLight,skyLevel);
 const parts=NATIVE_BANNER_PARTS.filter(p=>!isWall||p.name!=='pole').map(p=>({
  name:p.name,pivot:[0,p.name==='flag'?-32:0,0],cubes:[p],
  ...(p.name==='flag'?{rotation:[Math.fround(-.0125)*Math.fround(Math.PI),0,0]}:{}),
 }));
 const native=createNativeModelPart({parts},material,[64,64]),scale=Math.fround(2/3);
 native.root.scale.set(scale/16,-scale/16,-scale/16);
 const group=new THREE.Group(),anchor=new THREE.Group();
 group.position.set(position.x+.5,position.y+(isWall?-1/6:.5),position.z+.5);
 group.rotation.y=-THREE.MathUtils.degToRad(rotation*(isWall?90:22.5));
 if(isWall)anchor.position.set(0,-.3125,-.4375);
 anchor.add(native.root);group.add(anchor);
 group.bannerTexture=texture;group.bannerMaterial=material;
 group.userData.originalBanner={version:'1.21.1',parts:parts.map(p=>p.name),native,clothAnimation:'neutral-original-pose'};
 return group;
}

export async function installOriginalWorldBanners(version,{loadImage=readImage,makeCanvas=canvas}={}){
 if(version!=='1.21.1')return;
 if(globalThis.__MC_ORIGINAL_BANNERS__?.version===version)return globalThis.__MC_ORIGINAL_BANNERS__;
 const images=new Map(await Promise.all(['banner_base',...NATIVE_BANNER_PATTERNS.map(p=>'banner/'+p)].map(async path=>{
  const image=await loadImage(`/textures/${version}/entity/${path}.png`);
  if(image.width!==64||image.height!==64)throw Error('ORIGINAL_BANNER_TEXTURE_INVALID:'+path);
  return [path,image];
 })));
 const cache=new Map(),diagnostics={unsupported:0,lastError:null};
 const api={version,diagnostics,
  texture(_world,name,nbt){
   let layers;
   try{layers=originalWorldBannerLayers(name,nbt);}catch(e){diagnostics.unsupported++;diagnostics.lastError=e.message;return missing(e.message);}
   const key=JSON.stringify(layers),old=cache.get(key);
   if(old){old.refs++;return old.texture;}
   if(cache.size>=256){diagnostics.unsupported++;diagnostics.lastError='ORIGINAL_BANNER_TEXTURE_CAPACITY';return missing(diagnostics.lastError);}
   const surface=makeCanvas(64,64),ctx=surface.getContext('2d');
   if(!ctx)throw Error('ORIGINAL_BANNER_CANVAS_UNAVAILABLE');
   ctx.imageSmoothingEnabled=false;ctx.drawImage(images.get('banner_base'),0,0);
   for(const layer of layers){
    const overlay=makeCanvas(64,64),context=overlay.getContext('2d');
    context.drawImage(images.get('banner/'+layer.asset.slice(10)),0,0);
    const pixels=context.getImageData(0,0,64,64),rgb=[layer.tintColor>>16&255,layer.tintColor>>8&255,layer.tintColor&255];
    for(let i=0;i<pixels.data.length;i+=4)for(let c=0;c<3;c++)pixels.data[i+c]=Math.round(pixels.data[i+c]*rgb[c]/255);
    context.putImageData(pixels,0,0);ctx.drawImage(overlay,0,0);
   }
   const texture=new THREE.CanvasTexture(surface);texture.colorSpace=THREE.SRGBColorSpace;
   texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;
   texture.userData.originalBannerKey=key;cache.set(key,{texture,refs:1});return texture;
  },
  mesh(position,rotation,isWall,texture,blockLight,skyLight,skyLevel,light){return originalWorldBannerMesh(position,rotation,isWall,texture,light,blockLight,skyLight,skyLevel);},
  release(texture){
   if(texture?.userData?.originalBannerMissing){texture.dispose();return;}
   const key=texture?.userData?.originalBannerKey,cached=cache.get(key);
   if(!cached||cached.texture!==texture)return;
   if(--cached.refs<=0){texture.dispose();cache.delete(key);}
  },
 };
 function missing(reason){
  const texture=new THREE.DataTexture(new Uint8Array([255,0,255,255,0,0,0,255,0,0,0,255,255,0,255,255]),2,2);
  texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.needsUpdate=true;
  texture.userData.originalBannerMissing=reason;return texture;
 }
 // Reuse this per-page version instance so old chunks release through the same reference-counted cache after reset.
 globalThis.__MC_ORIGINAL_BANNERS__=api;
 return api;
}
function canvas(width,height){const c=document.createElement('canvas');c.width=width;c.height=height;return c;}
function readImage(url){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('ORIGINAL_BANNER_TEXTURE_UNAVAILABLE:'+url));image.src=url;});}
