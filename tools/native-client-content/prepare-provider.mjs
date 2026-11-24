import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const args=process.argv.slice(2),option=k=>{const i=args.indexOf(k);if(i<0)throw Error('Explicit '+k+' required');return args[i+1];};
const esbuild=await import(pathToFileURL(path.resolve(option('--esbuild-module')))),out=path.resolve(option('--output-dir'));
await fs.mkdir(out,{recursive:true});const artifact=out+'/content-provider.mjs';
const result=await esbuild.build({entryPoints:[import.meta.dirname+'/provider-entry.mjs'],outfile:artifact,bundle:true,platform:'node',format:'esm',target:'node22',metafile:true});
const inputs=[];for(const file of Object.keys(result.metafile.inputs))inputs.push({file:file.replaceAll('\\','/'),sha256:createHash('sha256').update(await fs.readFile(file)).digest('hex')});
await fs.writeFile(out+'/provider-build.json',JSON.stringify({schema:'mcvisual-content-provider-build/v1',artifact,sha256:createHash('sha256').update(await fs.readFile(artifact)).digest('hex'),inputs},null,2));console.log(JSON.stringify({artifact,inputs:inputs.length}));
