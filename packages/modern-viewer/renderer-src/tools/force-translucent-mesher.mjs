export function patchForceTranslucentMesher(source){
 const replacements=[
 ['  const position = cursor\n','  const baseBucket = bucket\n  const position = cursor\n'],
 ['    const eFace = element.faces[face]','    const eFace = element.faces[face]\n    bucket = eFace.corticoForceTranslucent ? ((baseBucket as any).corticoBlendBucket ?? baseBucket) : baseBucket'],
 ['  const { occludingLookup } = getOccludingBlockMeta(world.config.version)','  ;(opaqueBucket as any).corticoBlendBucket = blendBucket\n  const { occludingLookup } = getOccludingBlockMeta(world.config.version)'],
 ['    if (eFace.cullface) {','    if (eFace.cullface && !eFace.corticoForceTranslucent) {'],
 ['if (occludingLookup[block.stateId]) {','if (occludingLookup[block.stateId] && !corticoForced(block.models)) {'],
 ['if (faceIsCulled(world.config.version, element, face, neighbor.stateId, block, blockProvider, worldDir, globalMatrix)) continue','if (!corticoForced(neighbor.models) && faceIsCulled(world.config.version, element, face, neighbor.stateId, block, blockProvider, worldDir, globalMatrix)) continue']];
 for(const[a,b]of replacements){if(!source.includes(a))throw Error('FORCE_TRANSLUCENT_MESHER_ANCHOR_CHANGED:'+a.slice(0,40));source=source.replace(a,b);}
 return 'const corticoForced=(models:any)=>models?.some((vs:any)=>vs.some((m:any)=>m.elements?.some((e:any)=>Object.values(e.faces??{}).some((f:any)=>f.corticoForceTranslucent))))??false;\n'+source;
}
