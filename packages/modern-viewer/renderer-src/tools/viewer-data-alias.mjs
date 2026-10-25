import {VIEWER_REGISTRY_FIELDS} from '../host/viewer-runtime-registry.mjs';

/** Exact registry bootstrap also works when the browser uses a reusable, explicitly partial texture pack. */
export function viewerDataAlias(require,version) {
  const paths=require('minecraft-data/minecraft-data/data/dataPaths.json').pc[version];
  if(!paths)throw Error('VIEWER_REGISTRY_VERSION_MISMATCH');
  const resolve=file=>JSON.stringify(require.resolve(file));
  return [
    `const hydrate=require(${resolve('minecraft-data/lib/loader.js')});`,
    `const createSupportFeature=require(${resolve('minecraft-data/lib/supportsFeature.js')});`,
    ...VIEWER_REGISTRY_FIELDS.map(field=>`const ${field}=require(${resolve(`minecraft-data/minecraft-data/data/${paths[field]}/${field}.json`)});`),
    `const legacyPc=require(${resolve('minecraft-data/minecraft-data/data/pc/common/legacy.json')});`,
    `const bakedProtocols=require(${resolve('minecraft-data/minecraft-data/data/pc/common/protocolVersions.json')});`,
    `const runtime=globalThis.__MC_VIEWER_REGISTRY__;`,
    `if(runtime&&(runtime.schemaVersion!==1||runtime.data?.version?.minecraftVersion!==runtime.minecraftVersion))throw Error('VIEWER_REGISTRY_VERSION_MISMATCH');`,
    `const raw=runtime?.data??{${VIEWER_REGISTRY_FIELDS.join(',')}};`,
    `const activeVersion=runtime?.minecraftVersion??${JSON.stringify(version)};`,
    `const protocols=runtime?.protocolVersions??bakedProtocols;`,
    `const data=hydrate(raw); data.type='pc';`,
    `const protocol=protocols.find(row=>row.minecraftVersion===activeVersion);`,
    `function compareVersions(left,right){const a=String(left).split('.').map(Number),b=String(right).split('.').map(Number);for(let i=0;i<Math.max(a.length,b.length);i++){const delta=(a[i]||0)-(b[i]||0);if(delta)return delta;}return 0;}`,
    `const compareTo=other=>{const row=protocols.find(entry=>entry.minecraftVersion===String(other));return protocol?.dataVersion!==undefined&&row?.dataVersion!==undefined?protocol.dataVersion-row.dataVersion:compareVersions(activeVersion,other);};`,
    `data.version={...raw.version,dataVersion:protocol?.dataVersion,type:'pc',majorVersion:activeVersion.split('.').slice(0,2).join('.'),minecraftVersion:activeVersion,
      '>=':other=>compareTo(other)>=0,'>':other=>compareTo(other)>0,'<=':other=>compareTo(other)<=0,'<':other=>compareTo(other)<0,'==':other=>compareTo(other)===0};`,
    `data.isNewerOrEqualTo=other=>compareVersions(activeVersion,other)>=0;data.isOlderThan=other=>compareVersions(activeVersion,other)<0;`,
    `data.supportFeature=createSupportFeature(data.version,protocols);`,
    `function MinecraftData(){return data;}`,
    `MinecraftData.legacy={pc:legacyPc,bedrock:{blocks:{},items:{}}};MinecraftData.versions={pc:protocols,bedrock:[]};module.exports=MinecraftData;`,
  ].join('\n');
}
