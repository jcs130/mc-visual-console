/** Offline state-resolution audit, using explicit locally installed original resources. */
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {blockCatalogCoverage,selectProxyModels} from '../src/modern-viewer/voxel-proxy-catalog.mjs';
const [registryPath,catalogPath,output]=process.argv.slice(2);
if(!registryPath||!catalogPath||!output)throw Error('Usage: audit-voxel-proxy-catalog registry.json compiled-states.json new-report.json');
const registry=JSON.parse(await readFile(registryPath,'utf8')),definitions=JSON.parse(await readFile(catalogPath,'utf8'));
const coverage=blockCatalogCoverage(registry,definitions),Block=createRequire(import.meta.url)('prismarine-block')(registry.minecraftVersion);
const unresolved=[],special=new Set(),unverified=new Set();let checked=0;
for(const type of registry.blocks)for(let id=type.minStateId;id<=type.maxStateId;id++){
 const b=Block.fromStateId(id,0),state={name:'minecraft:'+b.name,properties:b.getProperties()};
 try{
  if(state.name!==type.name)throw Error('Registry and state decoder disagree');
  const selected=selectProxyModels(definitions,state,{x:1,y:64,z:-5},{allowUnverifiedTextureVariation:true});
  if(selected.models.length&&!selected.models.some(m=>m.model.elements.length))special.add(state.name);
  if(!selected.exactSeed)unverified.add(state.name);
 }catch(error){unresolved.push({stateId:id,name:state.name,error:String(error)});}checked++;
}
const report={...coverage,checkedStates:checked,unresolved,emptyOrSpecialRenderTypes:[...special],unverifiedTextureSeeds:[...unverified]};
await writeFile(output,JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({checkedStates:checked,unresolved:unresolved.length,emptyOrSpecialRenderTypes:special.size,unverifiedTextureTypes:unverified.size}));
if(unresolved.length||coverage.missing.length)process.exitCode=1;
