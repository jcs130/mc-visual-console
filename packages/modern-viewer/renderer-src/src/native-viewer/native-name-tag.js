import * as THREE from 'three'
import {NativeLanguage} from './native-language.js'
import {nativeLivingMeta} from './native-living-state.js'
const language=new NativeLanguage(),colors={aqua:'#55ffff',red:'#ff5555',white:'#ffffff',yellow:'#ffff55',green:'#55ff55',gray:'#aaaaaa'}

/** Only the server's actual visible custom name. Ignore interactive component fields. */
export function nativeVisibleName(entity){
 if(nativeLivingMeta(entity,3,'boolean',false)!==true)return null
 let value=nativeLivingMeta(entity,2,'optional_component',null),nodes=0
 const unwrap=(part,depth=0)=>{
  if(++nodes>128||depth>16)throw Error('NATIVE_NAME_COMPONENT_LIMIT')
  if(part===null||typeof part!=='object')return part
  if(Array.isArray(part))return part.map(p=>unwrap(p,depth+1))
  if(typeof part.type==='string'&&Object.hasOwn(part,'value')){
   if(part.type==='compound')return Object.fromEntries(Object.entries(part.value).map(([k,v])=>[k,unwrap(v,depth+1)]))
   if(part.type==='list')return part.value.value.map(p=>unwrap(p,depth+1))
   if(part.type==='string')return part.value
   throw Error('NATIVE_NAME_COMPONENT_TYPE_UNSUPPORTED')
  }
  return Object.fromEntries(Object.entries(part).map(([k,v])=>[k,unwrap(v,depth+1)]))
 }
 try{
  value=unwrap(value);const text=language.component(value)?.replace(/[\u0000-\u001f\u007f]/g,' ').trim()
  if(!text)return null
  const color=colors[value?.color]??(/^#[0-9a-f]{6}$/i.test(value?.color??'')?value.color:'#ffffff')
  return {text:Array.from(text).slice(0,96).join(''),color,source:'received_visible_custom_name',fontSource:'browser_system_font'}
 }catch{return null}
}
export function createNativeNameTag(height,{canvasFactory=()=>globalThis.document?.createElement('canvas')}={}){
 const root=new THREE.Group();root.name='native-visible-name';let signature=null,canvas=null,texture=null,material=null,sprite=null,disposed=false
 return {root,update(entity){
  if(disposed)return
  const value=nativeVisibleName(entity),next=JSON.stringify(value)
  if(next===signature)return;signature=next;root.visible=!!value
  if(!value)return
  canvas??=canvasFactory();if(!canvas){root.visible=false;return;}
  const ctx=canvas.getContext('2d');if(!ctx){root.visible=false;return;}
  ctx.font='20px "Microsoft YaHei",system-ui,sans-serif';canvas.width=Math.min(2048,Math.ceil(ctx.measureText(value.text).width)+16);canvas.height=34
  ctx.font='20px "Microsoft YaHei",system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='rgba(0,0,0,.4)';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle=value.color;ctx.fillText(value.text,canvas.width/2,17)
  if(!texture){texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false
   material=new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,depthTest:true});sprite=new THREE.Sprite(material);sprite.position.y=height+.4;root.add(sprite)}
  texture.needsUpdate=true;sprite.scale.set(canvas.width*.01,canvas.height*.01,1);root.userData.visibleName=value
 },dispose(){if(disposed)return;disposed=true;root.removeFromParent();root.clear();material?.dispose();texture?.dispose();canvas=null;}}
}
