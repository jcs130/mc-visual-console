/** Exact native palette values; custom names are never replaced by vanilla names. */
const nativeTints = new Map();
export function resetNativeBiomes() { nativeTints.clear(); }
export function installNativeBiomes(json, cache) {
  const value = (typeof json === 'string' ? JSON.parse(json) : json)?.agentMcBiomes;
  if (!value) return cache;
  if (value.protocol !== 'agent-mc-native-biomes/v1' || !Array.isArray(value.entries) || value.entries.length > 4096) throw Error('NATIVE_BIOME_PALETTE_INVALID');
  const next={...cache};
  for (const row of value.entries) {
    if (!Number.isSafeInteger(row.id) || row.id<0 || row.id>8191 || !/^[a-z0-9_.-]+:[a-z0-9_./-]{1,128}$/.test(row.name)
      || !['grass','foliage','water'].every(k=>Number.isInteger(row.colors?.[k])&&row.colors[k]>=0&&row.colors[k]<=0xffffff)) throw Error('NATIVE_BIOME_COLOR_INVALID');
    next[row.id]={id:row.id,name:row.name};
    nativeTints.set(row.name,Object.fromEntries(['grass','foliage','water'].map(k=>{const c=row.colors[k];return [k,[(c>>16&255)/255,(c>>8&255)/255,(c&255)/255]];})));
  }
  return next;
}
export function nativeBiomeTint(kind,name) { return nativeTints.get(name)?.[kind]; }
