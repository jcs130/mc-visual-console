// Optional artistic model-input abstraction. This never changes Minecraft or the normal viewer.
const LEAVES=new Set(['oak','spruce','birch','jungle','acacia','dark_oak','mangrove','cherry','azalea','flowering_azalea'].map(n=>`minecraft:${n}_leaves`));
export function organicProxyKind(name){return LEAVES.has(name)?'foliage':name==='minecraft:redstone_block'?'crystal':null;}
export function organicProxyTransform(x,y,z,kind){
 if(![x,y,z].every(Number.isSafeInteger)||!['foliage','crystal'].includes(kind))throw Error('Explicit original block position and supported abstraction required');
 let seed=(Math.imul(x,73856093)^Math.imul(y,19349663)^Math.imul(z,83492791))>>>0;
 const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
 const jitter=kind==='foliage'?.16:.04;
 const position=[x+.5+(random()-.5)*jitter,y+.5+(random()-.5)*jitter,z+.5+(random()-.5)*jitter];
 const scale=kind==='foliage'?[.92+random()*.3,.9+random()*.24,.92+random()*.3]:[.8,1.12,.8];
 return {position,scale};
}
