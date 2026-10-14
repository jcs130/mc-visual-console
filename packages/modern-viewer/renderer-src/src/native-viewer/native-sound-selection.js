// java.util.Random / Minecraft LegacyRandomSource, including bounded rejection.
export class NativeSoundRandom {
  constructor(seed){this.state=(BigInt(seed)^0x5deece66dn)&((1n<<48n)-1n)}
  next(bits){this.state=(this.state*0x5deece66dn+11n)&((1n<<48n)-1n);return Number(this.state>>BigInt(48-bits))}
  nextInt(bound){
    if(!Number.isSafeInteger(bound)||bound<=0||bound>0x7fffffff)throw Error('NATIVE_SOUND_WEIGHT_INVALID')
    if((bound&(bound-1))===0)return Number((BigInt(bound)*BigInt(this.next(31)))>>31n)
    for(;;){const bits=this.next(31),value=bits%bound;if(bits-value+bound-1<0x80000000)return value}
  }
}
const leaf=value=>typeof value==='string'?value.replace(/^minecraft:/,''):null
const entry=value=>typeof value==='string'?{name:value}:value
const positive=(value,fallback)=>{if(value===undefined)return fallback;if(!Number.isFinite(value)||value<=0)throw Error('NATIVE_SOUND_VALUE_UNSUPPORTED');return value}

// gvg.getSound and gvf$a$1: an event reference's weight is the CHILD TOTAL,
// not reference.weight * total. Recursion consumes another nextInt draw.
export function selectNativeSound(definitions,name,random) {
  const weight=(name,seen=new Set())=>{
    name=leaf(name);if(seen.has(name))throw Error('NATIVE_SOUND_REFERENCE_CYCLE');seen=new Set([...seen,name])
    const sounds=definitions[name]?.sounds;if(!Array.isArray(sounds))return 0
    return sounds.reduce((sum,value)=>{const e=entry(value);return sum+(e.type==='event'?weight(e.name,seen):positive(e.weight,1))},0)
  }
  const choose=(name,depth=0)=>{
    name=leaf(name);if(depth>32)throw Error('NATIVE_SOUND_REFERENCE_DEPTH')
    const total=weight(name);if(!total)return null
    let index=random.nextInt(total)
    for(const value of definitions[name].sounds){
      const e=entry(value),w=e.type==='event'?weight(e.name):positive(e.weight,1)
      index-=w;if(index>=0)continue
      if(e.type==='event'){
        const child=choose(e.name,depth+1);return child?{...child,volume:Math.fround(child.volume*positive(e.volume,1)),pitch:Math.fround(child.pitch*positive(e.pitch,1)),stream:child.stream||e.stream===true}:null
      }
      if(e.type!==undefined&&e.type!=='file')throw Error('NATIVE_SOUND_TYPE_UNSUPPORTED')
      return {file:leaf(e.name)+'.ogg',volume:positive(e.volume,1),pitch:positive(e.pitch,1),stream:e.stream===true,
        preload:e.preload===true,attenuationDistance:positive(e.attenuation_distance,16)}
    }
    return null
  }
  return choose(name)
}
