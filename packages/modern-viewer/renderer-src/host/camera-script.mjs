export const CAMERA_SCRIPT_PROTOCOL='mcvisual.camera-script/v1';
export const CAMERA_SCRIPT_LIMITS=Object.freeze({distance:[2,10],height:[-.8,12],speed:[.5,1.5],durationMs:[4000,20000],arcDegrees:[15,90]});
const defaults={distance:7,height:3,speed:1,durationMs:8000,arcDegrees:60};
export function validateCameraScript(value,view){
 if(value===undefined)return undefined;
 if(!value||value.schema!==CAMERA_SCRIPT_PROTOCOL||!view?.startsWith('drone_')||Object.keys(value).some(k=>k!=='schema'&&!Object.hasOwn(CAMERA_SCRIPT_LIMITS,k)))throw Error('INVALID_CAMERA_SCRIPT');
 if((view.startsWith('drone_orbit_')||['drone_push_in','drone_pull_out'].includes(view))&&('distance'in value||'height'in value))throw Error('FINITE_SCRIPT_STARTS_AT_ACTUAL_CAMERA');
 if(!view.startsWith('drone_orbit_')&&!['drone_push_in','drone_pull_out'].includes(view)&&('durationMs'in value||'arcDegrees'in value))throw Error('FINITE_PARAMETERS_REQUIRE_FINITE_SCRIPT');
 const out={schema:CAMERA_SCRIPT_PROTOCOL};
 for(const[k,[lo,hi]]of Object.entries(CAMERA_SCRIPT_LIMITS))if(Object.hasOwn(value,k)){
  if(typeof value[k]!=='number'||!Number.isFinite(value[k])||value[k]<lo||value[k]>hi||k==='durationMs'&&!Number.isInteger(value[k]))throw Error('INVALID_CAMERA_SCRIPT');out[k]=value[k];}
 const duration=(out.durationMs??defaults.durationMs)/(out.speed??1),arc=out.arcDegrees??60;
 if(duration<4000||duration>20000||view.startsWith('drone_orbit_')&&1.875*arc/(duration/1000)>45)throw Error('CAMERA_SCRIPT_RATE_LIMIT');
 return out;
}
/** Interpolate only one subject/view family. No averaging unrelated camera positions or projections. */
export function blendCameraScripts(options,probabilities,winner){
 const selected=options.find(o=>o.id===winner);if(!selected?.motion)return undefined;
 const same=options.filter(o=>o.view===selected.view&&o.name===selected.name&&o.motion&&probabilities?.[o.id]>0);
 const total=same.reduce((s,o)=>s+probabilities[o.id],0);if(total<=0)return validateCameraScript(selected.motion,selected.view);
 const out={schema:CAMERA_SCRIPT_PROTOCOL};
 for(const k of Object.keys(CAMERA_SCRIPT_LIMITS)){
  // Missing dimensions mean recipe defaults, never an invented dimension to blend against.
  if(same.every(o=>typeof o.motion[k]==='number'))out[k]=same.reduce((s,o)=>s+probabilities[o.id]*o.motion[k],0)/total;
 }
 if(out.durationMs!==undefined)out.durationMs=Math.round(out.durationMs);
 return validateCameraScript(out,selected.view);
}
