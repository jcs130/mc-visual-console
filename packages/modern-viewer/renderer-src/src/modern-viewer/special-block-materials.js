export const UNSUPPORTED_POT_PATTERN = '__viewer_decorated_pot_patterns_unavailable';
const observed = new WeakMap();
const unwrap = value => value && typeof value === 'object' && 'type' in value && 'value' in value ? value.value : value;

export function decoratedPotPatternUnsupported(nbt) {
  const data=unwrap(nbt);
  if (!data || !Object.hasOwn(data,'sherds')) return false;
  let sherds=unwrap(data.sherds);
  if (sherds && !Array.isArray(sherds) && sherds.type==='string') sherds=sherds.value;
  if (!Array.isArray(sherds) || sherds.length!==4) return true;
  return sherds.some(entry=>!['minecraft:brick','brick'].includes(unwrap(entry)));
}

// Static default-pot geometry must never erase observed decorated sides. Until
// that dynamic renderer is supported, keep the existing missing-material marker
// only at those positions and expose a bounded, explicit reason. No world writes.
export function syncSpecialBlockMaterials(world, blockEntities) {
  if (world?.resourcesManager?.currentResources?.version!=='1.21.1' || typeof world.updateCustomBlock!=='function') return;
  const previous=observed.get(world)??new Map(),next=new Map();
  for(const [key,value] of Object.entries(blockEntities??{})) {
    if(!/^-?\d+,-?\d+,-?\d+$/.test(key)||!decoratedPotPatternUnsupported(value))continue;
    const [x,,z]=key.split(',').map(Number),chunk=`${Math.floor(x/16)*16},${Math.floor(z/16)*16}`;
    const active=world.protocolCustomBlocks.get(chunk)?.[key];
    if(active && active!==UNSUPPORTED_POT_PATTERN)continue;
    next.set(key,chunk);
    if(active!==UNSUPPORTED_POT_PATTERN)world.updateCustomBlock(chunk,key,UNSUPPORTED_POT_PATTERN);
  }
  for(const [key,chunk] of previous)if(!next.has(key) && world.protocolCustomBlocks.get(chunk)?.[key]===UNSUPPORTED_POT_PATTERN)world.updateCustomBlock(chunk,key,undefined);
  observed.set(world,next);
  world.specialBlockMaterialDiagnostics={unsupportedPotPatterns:next.size,positions:[...next.keys()].slice(0,32),reason:next.size?'DECORATED_POT_SHERD_RENDERER_UNAVAILABLE':null};
}

export function clearRemovedSpecialBlockMaterial(world, pos, blockName) {
  if(!blockName || blockName==='decorated_pot')return;
  const key=[pos.x,pos.y,pos.z].map(Math.floor).join(','),previous=observed.get(world),chunk=previous?.get(key);
  if(chunk===undefined)return;
  previous.delete(key);
  if(world.protocolCustomBlocks.get(chunk)?.[key]===UNSUPPORTED_POT_PATTERN)world.updateCustomBlock(chunk,key,undefined);
  world.specialBlockMaterialDiagnostics={unsupportedPotPatterns:previous.size,positions:[...previous.keys()].slice(0,32),reason:previous.size?'DECORATED_POT_SHERD_RENDERER_UNAVAILABLE':null};
}
