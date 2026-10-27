// mc-assets drops models with elements:[] and treats an unmatched multipart as missing.
// Preserve the original zero visible faces without disguising unsupported/unknown models.
export function withIntentionalEmptyModels(source, version, {originalBanners=false}={}) {
  if(version!=='1.21.1')return source;
  const models={...source.models.latest},states={...source.blockstates.latest};
  const empty='block/viewer/intentional_empty';
  models[empty]={elements:[{from:[0,0,0],to:[0,0,0],faces:{}}]};
  // Original early upper crop models contain a particle texture but no visible elements; they are not BERs.
  for(const name of ['block/air',...Array.from({length:3},(_,i)=>`block/pitcher_crop_top_stage_${i}`)])
    if(models[name]&&!models[name].parent&&!models[name].elements?.length)
      models[name]={...models[name],elements:models[empty].elements};
  for(const [name,state]of Object.entries(states)){
    if(name.endsWith('_wall')&&Array.isArray(state.multipart)&&
      state.multipart.some(p=>p.when?.up==='true')&&['north','east','south','west'].every(dir=>state.multipart.some(p=>p.when?.[dir]==='low'))){
      states[name]={...state,multipart:[...state.multipart,{when:{up:'false',north:'none',east:'none',south:'none',west:'none'},apply:{model:empty}}]};
    }
    // These are drawn by the original BannerRenderer replacement, not by the chunk mesher.
    if(originalBanners&&/^(?:white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)(?:_wall)?_banner$/.test(name))
      states[name]={variants:{'':{model:empty}}};
  }
  return {...source,models:{...source.models,latest:models},blockstates:{...source.blockstates,latest:states}};
}
