import {resourcePath,textureId} from './model-loader.js'
import {resolveNativeBlockItemModel,nativeGuiItemTransform} from './native-block-item-icons.js'
import {prepareNativePotionItem} from './native-potion-items.js'

async function pixels(bytes){
  const image=await createImageBitmap(new Blob([bytes],{type:'image/png'}))
  try{
    if(![image.width,image.height].every(n=>Number.isInteger(n)&&n>0&&n<=512))throw Error('NATIVE_POTION_GUI_PIXELS_INVALID')
    const canvas=new OffscreenCanvas(image.width,image.height),context=canvas.getContext('2d',{willReadFrequently:true})
    if(!context)throw Error('NATIVE_POTION_GUI_PIXELS_UNAVAILABLE')
    context.drawImage(image,0,0)
    return {width:image.width,height:image.height,pixels:context.getImageData(0,0,image.width,image.height).data}
  }finally{image.close()}
}
async function encode({width,height,pixels}){
  const canvas=new OffscreenCanvas(width,height),context=canvas.getContext('2d')
  if(!context)throw Error('NATIVE_POTION_GUI_PIXELS_UNAVAILABLE')
  context.putImageData(new ImageData(new Uint8ClampedArray(pixels),width,height),0,0)
  return canvas.convertToBlob({type:'image/png'})
}

// Original generated models in the identity GUI/front-light branch. All four
// original potion sprites use binary alpha: later layers replace their opaque
// pixels, with ItemColors' tint only on layer zero. Unsupported transforms,
// animation or nonbinary alpha remain explicit, never an approximate flat icon.
export async function renderNativePotionIcon(reader,stack,{readPixels=pixels,encodePixels=encode,appearance}={}){
  const checked=appearance?.prepared??await prepareNativePotionItem(reader,stack),model=appearance?.model??await resolveNativeBlockItemModel(reader,stack.id.replace(':',':item/'))
  if(!model.nativeGenerated||model.elements.length||(model.gui_light??'front')!=='front')throw Error('NATIVE_POTION_GUI_MODEL_UNSUPPORTED')
  const transform=nativeGuiItemTransform(model.display?.gui)
  if(transform.rotation.some(n=>n!==0)||transform.translation.some(n=>n!==0)||transform.scale.some(n=>n!==1))throw Error('NATIVE_POTION_GUI_TRANSFORM_UNSUPPORTED')
  if(!model.textures.layer0||Object.keys(model.textures).some(k=>/^layer/.test(k)&&!/^layer[0-4]$/.test(k)))throw Error('NATIVE_POTION_GUI_LAYERS_UNSUPPORTED')
  let output=null,totalPixels=0;const paths=[]
  for(let layer=0;layer<5&&model.textures['layer'+layer];layer++){
    const path=resourcePath(textureId(model,model.textures['layer'+layer]),'textures','.png')
    if(reader.manifest.assets[path+'.mcmeta'])throw Error('NATIVE_POTION_GUI_ANIMATION_UNSUPPORTED')
    const decoded=await readPixels(await reader.bytes(path)),{width,height,pixels}=decoded??{}
    if(![width,height].every(n=>Number.isInteger(n)&&n>0&&n<=512)||!(pixels instanceof Uint8Array||pixels instanceof Uint8ClampedArray)||pixels.length!==width*height*4||
      (totalPixels+=width*height)>1048576)throw Error('NATIVE_POTION_GUI_PIXELS_INVALID')
    if(!output)output={width,height,pixels:new Uint8Array(width*height*4)}
    if(output.width!==width||output.height!==height)throw Error('NATIVE_POTION_GUI_LAYER_DIMENSIONS_UNSUPPORTED')
    const color=layer===0?checked.color:0xffffffff,tint=[(color>>>16)&255,(color>>>8)&255,color&255]
    for(let n=0;n<pixels.length;n+=4){
      if(![0,255].includes(pixels[n+3]))throw Error('NATIVE_POTION_GUI_ALPHA_UNSUPPORTED')
      if(pixels[n+3]===0)continue
      for(let channel=0;channel<3;channel++)output.pixels[n+channel]=Math.round(pixels[n+channel]*tint[channel]/255)
      output.pixels[n+3]=255
    }
    paths.push(path)
  }
  return {blob:await encodePixels(output),width:output.width,height:output.height,tintColor:checked.color,
    sourcePaths:[...new Set([...checked.sourcePaths,...model.sourcePaths,...paths])],
    renderFidelity:'original_potion_generated_layers',pixelParityVerified:false,animated:false}
}
