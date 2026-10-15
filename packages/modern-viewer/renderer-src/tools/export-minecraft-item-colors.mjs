/** Offline original potion/effect/item registry export; no world or listener. */
import {createHash} from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
const [versionFile,libraries,mappings,output,java='java']=process.argv.slice(2)
if(!versionFile||!libraries||!mappings||!output)throw Error('version.json libraries-directory official-client-mappings.txt NEW-output-directory [java]')
const hash=(kind,b)=>createHash(kind).update(b).digest('hex'),versionBytes=await fs.readFile(versionFile),version=JSON.parse(versionBytes)
if(version.id!=='1.21.1'||hash('sha1',versionBytes)!=='499680d659b7a0ccb2fa9a809c345c5baf2ace7d')throw Error('Original 1.21.1 version-manifest hash mismatch')
const jar=path.join(path.dirname(versionFile),'1.21.1.jar'),bytes=await fs.readFile(jar),mapBytes=await fs.readFile(mappings)
if(hash('sha1',bytes)!==version.downloads.client.sha1||hash('sha256',bytes)!=='499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99'||hash('sha1',mapBytes)!==version.downloads.client_mappings.sha1)throw Error('Original client/mappings hash mismatch')
const cp=[jar],libraryHashes=[]
for(const library of version.libraries){
  const os=process.platform==='win32'?'windows':process.platform==='darwin'?'osx':'linux'
  if(library.rules&&!library.rules.reduce((allowed,rule)=>!rule.os?.name||rule.os.name===os?rule.action==='allow':allowed,false))continue
  const artifact=library.downloads?.artifact;if(!artifact)continue
  const file=path.join(libraries,artifact.path),b=await fs.readFile(file)
  if(hash('sha1',b)!==artifact.sha1)throw Error('Original client library hash mismatch')
  cp.push(file);libraryHashes.push({file:artifact.path,sha1:artifact.sha1})
}
const source=fileURLToPath(new URL('./ExportVanillaItemColors.java',import.meta.url))
const result=spawnSync(java,['-Djava.awt.headless=true','--class-path',cp.join(path.delimiter),source,mappings,output],{encoding:'utf8',maxBuffer:1024*1024})
if(result.status!==0)throw Error(result.stderr||result.stdout||'Original item-color exporter failed')
const file=path.join(output,'client-item-colors.json'),data=JSON.parse(await fs.readFile(file,'utf8'))
if(data.effects?.length!==39||data.potions?.length!==46||data.items?.length!==1333)throw Error('Incomplete original item-color registry export')
data.clientJarSha256=hash('sha256',bytes);data.mappingsSha256=hash('sha256',mapBytes);data.versionManifestSha256=hash('sha256',versionBytes)
data.exporterSha256=hash('sha256',await fs.readFile(source));data.libraries=libraryHashes
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value
await fs.writeFile(file,JSON.stringify(canonical(data))+'\n')
console.log(JSON.stringify({effects:data.effects.length,potions:data.potions.length,items:data.items.length,sha256:hash('sha256',await fs.readFile(file))}))
