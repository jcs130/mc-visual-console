/** Versioned, original compiled Java block definitions for model-input renderers. */
import {multipartMatches,weightedModel,defaultBlockSeedEvidence} from '../native-viewer/model-selection.js';
export function selectProxyModels(definitions,state,position,{allowUnverifiedTextureVariation=false}={}){
 const key=state.name.startsWith('minecraft:')?state.name.slice(10):state.name;
 const definition=definitions[key];if(!definition)throw Error('VOXEL_MODEL_MISSING:'+state.name);
 const props=Object.fromEntries(Object.entries(state.properties).map(([k,v])=>[k,String(v)]));
 let candidates=[];
 if(definition.multipart){candidates=definition.multipart.filter(p=>multipartMatches(p.when,props)).map(p=>p.apply);}
 else{
  const matches=Object.entries(definition.variants??{}).filter(([key])=>key===''||key.split(',').every(pair=>{const [k,v]=pair.split('=');return v.split('|').includes(props[k]);}));
  if(matches.length!==1)throw Error('VOXEL_STATE_UNRESOLVED:'+state.name+JSON.stringify(props));
  candidates=[matches[0][1]];
 }
 let exactSeed=true;
 const models=candidates.map(candidate=>{
  if(!Array.isArray(candidate))return candidate;
  if(candidate.length===1)return candidate[0];
  if(defaultBlockSeedEvidence({name:state.name,properties:props}))return weightedModel(candidate,position);
  if(!allowUnverifiedTextureVariation)throw Error('VOXEL_TEXTURE_VARIATION_SEED_UNVERIFIED:'+state.name);
  exactSeed=false;return candidate[0];
 });
 // A registered multipart state may intentionally have no active parts (e.g. an isolated wall with up=false).
 if(models.some(p=>!p.model||!Array.isArray(p.model.elements)))throw Error('VOXEL_MODEL_GEOMETRY_MISSING:'+state.name);
 return {models,exactSeed};
}

export function blockCatalogCoverage(registry,definitions){
 if(registry.minecraftVersion!=='1.21.1'||registry.schema!=='agent-mc-block-registry/v1')throw Error('Exact 1.21.1 block registry required');
 const missing=registry.blocks.filter(block=>!Object.hasOwn(definitions,block.name.slice(10))).map(b=>b.name);
 return {minecraftVersion:registry.minecraftVersion,registeredTypes:registry.blocks.length,
  registeredStates:registry.blocks.reduce((n,b)=>n+b.maxStateId-b.minStateId+1,0),
  compiledDefinitions:Object.keys(definitions).length,mappedTypes:registry.blocks.length-missing.length,missing,
  registryIsNotAnExactSceneParityCertificate:true};
}

/** Compiled atlas rectangles already include the source face's UV crop. */
export function atlasFaceUV(face){
 const r=face.texture;
 if(!r||![r.u,r.v,r.su,r.sv].every(Number.isFinite))throw Error('VOXEL_ATLAS_RECT_INVALID');
 const us=face.uv.filter((_,i)=>i%2===0),vs=face.uv.filter((_,i)=>i%2===1);
 const minU=Math.min(...us),maxU=Math.max(...us),minV=Math.min(...vs),maxV=Math.max(...vs);
 if(minU===maxU||minV===maxV)throw Error('VOXEL_FACE_UV_DEGENERATE');
 return face.uv.map((v,i)=>i%2===0?r.u+(v-minU)/(maxU-minU)*r.su:1-r.v-r.sv+(v-minV)/(maxV-minV)*r.sv);
}
