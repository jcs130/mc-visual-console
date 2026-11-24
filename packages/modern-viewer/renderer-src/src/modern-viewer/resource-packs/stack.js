function decodeJson(v){return typeof v==='string'?JSON.parse(v):v instanceof Uint8Array?JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(v)):structuredClone(v);}
function safePattern(v){
 if(typeof v!=='string'||v.length>128)throw Error('PACK_FILTER_REGEX_UNSUPPORTED');
 // Bounded supported regex subset: literals and at most one .* wildcard.
 // No nested/grouped or repeated quantifiers from an untrusted pack.
 const parts=v.replace(/\\([.-])/g,'$1').split('.*');
 if(parts.length>2||parts.some(p=>!/^[a-zA-Z0-9_./:-]*$/.test(p)))throw Error('PACK_FILTER_REGEX_UNSUPPORTED');
 return new RegExp('^'+parts.map(p=>p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$');
}
const ID=/^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
export function resourceId(value){if(typeof value!=='string')throw Error('PACK_ID_INVALID');const id=value.includes(':')?value:'minecraft:'+value;if(!ID.test(id)||id.split(':')[1].split('/').some(p=>!p||p==='.'||p==='..'))throw Error('PACK_ID_INVALID');return id;}
export function resourcePath(id,kind,suffix='.json'){const[ns,name]=resourceId(id).split(':');return `assets/${ns}/${kind}/${name}${suffix}`;}
export class ResourceStack{
 constructor(packs=[]){if(packs.length>16)throw Error('PACK_STACK_BUDGET');this.packs=packs;this.cache=new Map();}
 path(path){if(path.length>1024||!/^assets\/[a-z0-9_.-]+\//.test(path)||path.includes('\\')||path.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('PACK_PATH_INVALID');return path;}
 entries(path){this.path(path);const out=[];for(let i=this.packs.length-1;i>=0;i--){const p=this.packs[i];if(p.assets.has(path))out.push({pack:p.id,value:p.assets.get(path)});if((p.filters??[]).some(f=>{const ns=path.split('/')[1],rel=path.split('/').slice(2).join('/');return safePattern(f.namespace??'.*').test(ns)&&safePattern(f.path??'.*').test(rel)}))break;}return out;}
 bytes(path){const e=this.entries(path)[0];if(!e)throw Error('PACK_ASSET_MISSING:'+path);return e.value;}
 json(path){const v=this.bytes(path);return typeof v==='string'?JSON.parse(v):v instanceof Uint8Array?JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(v)):structuredClone(v);}
 fontProviders(id){return this.entries(resourcePath(id,'font')).flatMap(e=>{const x=decodeJson(e.value);if(!Array.isArray(x.providers))throw Error('PACK_FONT_INVALID');return x.providers.map(p=>({...p,sourcePack:e.pack}));});}
 modelTree(id,seen=[]){id=resourceId(id);if(seen.includes(id)||seen.length>=32)throw Error('PACK_MODEL_CYCLE');const own=this.json(resourcePath(id,'models'));let base={};if(own.parent){if(own.parent.includes('builtin/'))throw Error('PACK_BUILTIN_GEOMETRY_NOT_IMPLEMENTED:'+own.parent);base=this.modelTree(own.parent,[...seen,id]);}const out={...base,...own,textures:{...base.textures,...own.textures}};delete out.parent;return out;}
 model(id){const out=this.modelTree(id);
 const resolve=(value,chain=[])=>{const opt=typeof value==='object'?value:{sprite:value};if(typeof opt.sprite!=='string')throw Error('PACK_TEXTURE_INVALID');if(opt.sprite.startsWith('#')){const key=opt.sprite.slice(1);if(chain.includes(key)||chain.length>=32)throw Error('PACK_TEXTURE_CYCLE');const next=resolve(out.textures[key],[...chain,key]);return{...next,...('force_translucent'in opt?{force_translucent:!!opt.force_translucent}:{})};}return{sprite:resourceId(opt.sprite),force_translucent:opt.force_translucent===true};};
 out.elements=(out.elements??[]).map(e=>({...e,faces:Object.fromEntries(Object.entries(e.faces??{}).map(([dir,f])=>[dir,{...f,texture:resolve(f.texture)}]))}));return out;}
}
