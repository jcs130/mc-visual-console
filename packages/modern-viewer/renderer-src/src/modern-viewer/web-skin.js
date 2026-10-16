export const WEB_SKIN_SCHEMA='mc-web-skin/v1';
export const WEB_SKIN_MAX_BYTES=4*1024*1024;
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
const toBase64=bytes=>{let s='';for(const byte of bytes)s+=String.fromCharCode(byte);return btoa(s);};
export function skinPngDimensions(bytes) {
  if(!(bytes instanceof Uint8Array)||bytes.length<33||bytes.length>WEB_SKIN_MAX_BYTES||
    ![137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))throw Error('请选择有效的 PNG 皮肤文件（最大 4 MB）');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(view.getUint32(8)!==13||String.fromCharCode(...bytes.subarray(12,16))!=='IHDR')throw Error('PNG 文件头无效');
  const width=view.getUint32(16),height=view.getUint32(20);
  if(width<64||width>1024||width%64!==0||![width,width/2].includes(height))throw Error('皮肤须为 64×64、64×32，或相同比例的高清 PNG（最大宽度 1024）');
  return {width,height};
}
export async function readWebSkin(bytes,{model='wide',label='上传的皮肤',expectedSha256}={}) {
  const dimensions=skinPngDimensions(bytes);
  if(!['wide','slim'].includes(model))throw Error('请选择宽臂或细臂');
  const sha256=await hash(bytes);if(expectedSha256&&sha256!==expectedSha256)throw Error('已保存皮肤校验失败，请重新上传');
  const assetSha256=await hash(new TextEncoder().encode(`${sha256}:${model}`));
  return {schema:WEB_SKIN_SCHEMA,...dimensions,model,label:String(label).replace(/[\u0000-\u001f\u007f]/g,'').slice(0,100)||'上传的皮肤',sha256,assetSha256,bytes:bytes.length,base64:toBase64(bytes)};
}
export async function validateWebSkinImage(row){
  const bytes=Uint8Array.from(atob(row.base64),s=>s.charCodeAt(0));
  if(typeof createImageBitmap==='function'){
    let image;try{image=await createImageBitmap(new Blob([bytes],{type:'image/png'}));if(image.width!==row.width||image.height!==row.height)throw Error('尺寸不一致');}
    catch{throw Error('PNG 皮肤无法解码，请重新选择图片');}finally{image?.close();}
  }else{
    const image=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('PNG 皮肤无法解码，请重新选择图片'));image.src='data:image/png;base64,'+row.base64;});
    if(image.width!==row.width||image.height!==row.height)throw Error('PNG 皮肤解码尺寸不一致');
  }
}
export class BrowserSkinStore {
  constructor(storage,scope){this.storage=storage;this.scope=scope;this.cache=new Map();}
  key(uuid){if(!UUID.test(uuid??''))throw Error('尚未确认当前观战玩家');return `web-skin/v1:${encodeURIComponent(this.scope)}:${uuid}`;}
  async load(uuid){
    if(this.cache.has(uuid))return this.cache.get(uuid);
    let text;try{text=this.storage?.getItem(this.key(uuid));}catch{}
    if(!text)return null;
    if(text.length>WEB_SKIN_MAX_BYTES*1.5)throw Error('已保存的皮肤过大，请重新上传');
    const row=JSON.parse(text);if(row.schema!==WEB_SKIN_SCHEMA||typeof row.base64!=='string'||!/^[a-f0-9]{64}$/.test(row.sha256??''))throw Error('已保存皮肤格式无效');
    const bytes=Uint8Array.from(atob(row.base64),s=>s.charCodeAt(0));
    const verified=await readWebSkin(bytes,{model:row.model,label:row.label,expectedSha256:row.sha256});
    if(bytes.length!==row.bytes)throw Error('已保存皮肤校验失败，请重新上传');
    this.cache.set(uuid,verified);return verified;
  }
  save(uuid,row){this.cache.set(uuid,row);try{if(!this.storage)throw Error('disabled');this.storage.setItem(this.key(uuid),JSON.stringify(row));return true;}catch{return false;}}
}
export function paperSkinBundle(row){return {schemaVersion:1,format:'minecraft-skin-original',source:'browser_upload',modelId:'uploaded-skin',
  displayLabel:row.label,assetSha256:row.assetSha256,skin:row,textures:{[row.model]:'skin.png'},files:{'skin.png':{sha256:row.sha256,bytes:row.bytes,base64:row.base64}}};}
