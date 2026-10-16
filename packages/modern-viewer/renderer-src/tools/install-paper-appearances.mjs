import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { loadBundledAppearances } from '../host/native-bundled-appearances.mjs';
import { PAPER_BUNDLED_SCHEMA, PAPER_BUNDLED_LIMITS } from '../src/modern-viewer/paper-bundled-appearance.js';

const [catalogFile,output,...args]=process.argv.slice(2);
if(!catalogFile||!output)throw Error('Usage: install-paper-appearances.mjs <verified-original-catalog> <new-player-appearances-directory> [--player-uuid=UUID --default=bundled:ID --scope=24-64-hex]');
const options=Object.fromEntries(args.map(arg=>{const match=/^--(player-uuid|default|scope)=(.+)$/.exec(arg);if(!match)throw Error('Unknown option');return [match[1],match[2]];}));
const uuid=options['player-uuid'],choice=options.default??'server',scope=options.scope;
if(!/^[a-f0-9]{24,64}$/.test(scope??'')||uuid&&!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(uuid))throw Error('Invalid explicit player scope');
const original=await loadBundledAppearances(catalogFile,{limits:PAPER_BUNDLED_LIMITS});
if(!original.metadata.available)throw Error(original.metadata.reason);
if(original.metadata.appearances.some(row=>row.kind!=='ysm'||row.ysmVersion!=='2.4.1'))throw Error('PAPER_BUNDLED_YSM_VERSION_UNSUPPORTED');
if(choice!=='server'&&!original.metadata.appearances.some(row=>`bundled:${row.id}`===choice))throw Error('Unknown default appearance');
const root=path.resolve(output);
if(await access(root).then(()=>true,()=>false))throw Error('Use a new output directory; existing live resources are never overwritten');
await mkdir(root,{recursive:true});
for(const name of Object.keys(original.metadata.assets)) {
  const file=path.join(root,'assets',name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,original.read(name));
}
await writeFile(path.join(root,'config.json'),JSON.stringify({schema:PAPER_BUNDLED_SCHEMA,selectionScope:scope,
  defaults:uuid?{[uuid]:choice}:{},catalog:original.metadata},null,2)+'\n');
console.log(JSON.stringify({output:root,originalCatalogSha256:original.sha256,files:Object.keys(original.metadata.assets).length,defaultConfigured:!!uuid,source:'explicit_web_viewer_configuration',serverAppearanceModified:false}));
