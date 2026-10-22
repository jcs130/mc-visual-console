import {resourcePath,textureId} from './model-loader.js'

// ItemModelGenerator's GUI/front-light branch draws layers 0..4 in order.
// Keep each original PNG as a separate image, including fractional alpha.
// An inert self-contained SVG gives the existing <img> path that same ordered
// composition, without inventing a replacement sprite or losing glass alpha.
const base64=bytes=>{
  let text=''
  for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384))
  return btoa(text)
}
function pngSize(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length<33||bytes.length>16777216||
    ![137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x)||String.fromCharCode(...bytes.subarray(12,16))!=='IHDR')throw Error('NATIVE_GENERATED_LAYER_PNG_INVALID')
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),width=view.getUint32(16),height=view.getUint32(20)
  if(!width||!height||width>512||height>512)throw Error('NATIVE_GENERATED_LAYER_DIMENSIONS_INVALID')
  return {width,height}
}
export async function renderNativeGeneratedLayers(reader,model){
  if(!model?.nativeGenerated||model.elements?.length||(model.gui_light??'front')!=='front')throw Error('NATIVE_GENERATED_LAYER_MODEL_UNSUPPORTED')
  const layers=Object.keys(model.textures??{}).filter(k=>/^layer/.test(k)).sort((a,b)=>Number(a.slice(5))-Number(b.slice(5)))
  const scales=model.twilightTravellerLayerScales
  if(scales&&(!Array.isArray(scales)||scales.length!==layers.length||scales.some((n,i)=>n!==Math.fround(1+Math.fround(i*Math.fround(.001))))))throw Error('NATIVE_GENERATED_LAYER_SCALE_INVALID')
  if(layers.length<2||layers.length>(scales?26:5)||layers.some((k,i)=>k!=='layer'+i))throw Error('NATIVE_GENERATED_LAYER_SEQUENCE_INVALID')
  let dimensions=null,total=0;const images=[],paths=[]
  for(const layer of layers){
    const path=resourcePath(textureId(model,model.textures[layer]),'textures','.png')
    if(reader.manifest.assets[path+'.mcmeta'])throw Error('NATIVE_GENERATED_LAYER_ANIMATION_UNSUPPORTED')
    const bytes=await reader.bytes(path);total+=bytes.length
    if(total>16777216)throw Error('NATIVE_GENERATED_LAYER_TEXTURE_LIMIT')
    const size=pngSize(bytes)
    if(dimensions&&(size.width!==dimensions.width||size.height!==dimensions.height))throw Error('NATIVE_GENERATED_LAYER_DIMENSIONS_UNSUPPORTED')
    dimensions??=size;paths.push(path)
    const scale=scales?.[images.length],transform=scale&&scale!==1?` transform="translate(${size.width/2} ${size.height/2}) scale(${scale}) translate(${-size.width/2} ${-size.height/2})"`:''
    images.push(`<image width="${size.width}" height="${size.height}"${transform} href="data:image/png;base64,${base64(bytes)}"/>`)
  }
  const {width,height}=dimensions,svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${images.join('')}</svg>`
  return {blob:new Blob([svg],{type:'image/svg+xml'}),width,height,layers:layers.length,kind:'native-json-generated-layers',
    sourcePaths:[...new Set([...model.sourcePaths,...paths])],renderFidelity:'original_ordered_generated_png_layers',pixelParityVerified:false}
}
