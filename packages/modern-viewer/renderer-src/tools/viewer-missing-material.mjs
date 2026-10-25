/** A visibly missing material, not a replacement Minecraft block identity. */
export function withViewerMissingMaterial(source) {
  const model='block/__viewer_missing_material';
  const faces=Object.fromEntries(['up','down','north','south','east','west'].map(name=>[name,{texture:'#all',cullface:name}]));
  return {...source,
    blockstates:{...source.blockstates,latest:{...source.blockstates.latest,
      unknown:source.blockstates.latest.unknown??{variants:{'':{model}}},
      errored:source.blockstates.latest.errored??{variants:{'':{model}}}}},
    models:{...source.models,latest:{...source.models.latest,
      [model]:{textures:{all:'block/missing_texture'},elements:[{from:[0,0,0],to:[16,16,16],faces}]}}},
  };
}
