/** Offline extraction; initializes original registries, never starts a game/world/socket. */
import {createHash} from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
const [versionFile,libraries,mappings,output,java='java']=process.argv.slice(2)
if(!versionFile||!libraries||!mappings||!output)throw Error('version.json libraries-directory official-client-mappings.txt NEW-output-directory [java]')
const hash=(kind,b)=>createHash(kind).update(b).digest('hex'),version=JSON.parse(await fs.readFile(versionFile,'utf8'))
if(version.id!=='1.21.1')throw Error('Original 1.21.1 version required')
const jar=path.join(path.dirname(versionFile),'1.21.1.jar'),bytes=await fs.readFile(jar),mapBytes=await fs.readFile(mappings)
if(hash('sha1',bytes)!==version.downloads.client.sha1||hash('sha256',bytes)!=='499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99'||hash('sha1',mapBytes)!==version.downloads.client_mappings.sha1)throw Error('Original client/mappings hash mismatch')
const cp=[jar]
for(const library of version.libraries){
  const os=process.platform==='win32'?'windows':process.platform==='darwin'?'osx':'linux'
  if(library.rules&&!library.rules.reduce((allowed,rule)=>!rule.os?.name||rule.os.name===os?rule.action==='allow':allowed,false))continue
  const artifact=library.downloads?.artifact;if(!artifact)continue
  const file=path.join(libraries,artifact.path),b=await fs.readFile(file)
  if(hash('sha1',b)!==artifact.sha1)throw Error('Original client library hash mismatch')
  cp.push(file)
}
const source=fileURLToPath(new URL('./ExportVanillaRegistry.java',import.meta.url))
const result=spawnSync(java,['--class-path',cp.join(path.delimiter),source,mappings,output,'--particle-collisions'],{encoding:'utf8',maxBuffer:1024*1024})
if(result.status!==0)throw Error(result.stderr||result.stdout||'Original registry exporter failed')
const file=path.join(output,'particle-collisions.json'),data=JSON.parse(await fs.readFile(file,'utf8'))
data.clientJarSha256=hash('sha256',bytes);data.mappingsSha256=hash('sha256',mapBytes);data.exporterSha256=hash('sha256',await fs.readFile(source))
data.nativeRegistrySha256=hash('sha256',await fs.readFile(path.join(output,'block-states.jsonl')))
if(data.states.length!==26684)throw Error('Incomplete original state collision export')
await fs.writeFile(file,JSON.stringify(data)+'\n')
console.log(JSON.stringify({states:data.states.length,nativeRegistrySha256:data.nativeRegistrySha256,collisionFileSha256:hash('sha256',await fs.readFile(file)),dynamicUnavailable:data.states.filter(r=>r.unavailable).length}))
