// Mojang SNBT is not JSON: Brigadier escapes only quote and backslash.
// Keep literal line/control characters inside the quoted tag string.
export const snbtString=value=>'"'+value.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
/** Preserve the actual protocol-767 typed NBT; never stringify a simplified tag. */
export function componentSnbt(input) {
  let nodes=0;
  const tag=(value,depth=0)=>{
    if(++nodes>4096||depth>16)throw Error('VANILLA_NBT_LIMIT');
    if(!value||typeof value!=='object'||!Object.hasOwn(value,'type')||!Object.hasOwn(value,'value'))throw Error('VANILLA_NBT_INVALID');
    const v=value.value,type=value.type;
    if(type==='string'){if(typeof v!=='string'||Buffer.byteLength(v)>65536)throw Error('VANILLA_NBT_LIMIT');return snbtString(v);}
    if(type==='compound'){
      if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length>512)throw Error('VANILLA_NBT_LIMIT');
      return '{'+Object.entries(v).map(([key,part])=>{if(key.length>1024)throw Error('VANILLA_NBT_LIMIT');return snbtString(key)+':'+tag(part,depth+1);}).join(',')+'}';
    }
    if(type==='list'){
      if(!v||!Array.isArray(v.value)||v.value.length>4096||typeof v.type!=='string')throw Error('VANILLA_NBT_LIMIT');
      return '['+v.value.map(part=>tag({type:v.type,value:part},depth+1)).join(',')+']';
    }
    if(type==='long'){
      let number;if(typeof v==='bigint')number=v;
      else if(Number.isSafeInteger(v))number=BigInt(v);
      else if(Array.isArray(v)&&v.length===2&&v.every(Number.isInteger))number=(BigInt(v[0])<<32n)|BigInt(v[1]>>>0);
      else throw Error('VANILLA_NBT_LONG_INVALID');
      if(number<-(1n<<63n)||number>=(1n<<63n))throw Error('VANILLA_NBT_LONG_INVALID');return number+'L';
    }
    if(['byteArray','intArray','longArray'].includes(type)){
      if(!(Array.isArray(v)||ArrayBuffer.isView(v))||v.length>4096)throw Error('VANILLA_NBT_LIMIT');
      const element=type==='byteArray'?'byte':type==='intArray'?'int':'long',prefix={byte:'B',int:'I',long:'L'}[element];
      return '['+prefix+';'+Array.from(v,part=>tag({type:element,value:part},depth+1)).join(',')+']';
    }
    const range={byte:[-128,127,'b'],short:[-32768,32767,'s'],int:[-2147483648,2147483647,'']};
    if(range[type]){const [lo,hi,suffix]=range[type];if(!Number.isInteger(v)||v<lo||v>hi)throw Error('VANILLA_NBT_NUMBER_INVALID');return v+suffix;}
    if(['float','double'].includes(type)&&Number.isFinite(v))return String(Object.is(v,-0)?'-0':v)+(type==='float'?'f':'d');
    throw Error('VANILLA_NBT_TYPE_UNSUPPORTED');
  };
  const result=tag(input);if(Buffer.byteLength(result)>65536)throw Error('VANILLA_NBT_LIMIT');return result;
}
export function enchantmentSnbt(data,registry) {
  if(!data||!Array.isArray(data.enchantments)||data.enchantments.length>256||typeof data.showTooltip!=='boolean')throw Error('VANILLA_ENCHANTMENTS_INVALID');
  const seen=new Set(),levels=[];
  for(const row of data.enchantments){
    const name=registry?.enchantments?.[row?.id]?.name;
    if(typeof name!=='string'||!/^[a-z0-9_]+$/.test(name)||seen.has(name))throw Error('VANILLA_ENCHANTMENT_REGISTRY_UNAVAILABLE');
    if(!Number.isInteger(row.level)||row.level<0||row.level>255)throw Error('VANILLA_ENCHANTMENTS_INVALID');
    seen.add(name);levels.push(JSON.stringify('minecraft:'+name)+':'+row.level);
  }
  return '{levels:{'+levels.join(',')+'},show_in_tooltip:'+(data.showTooltip?'1b':'0b')+'}';
}
