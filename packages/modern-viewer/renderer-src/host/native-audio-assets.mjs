import {readFile,realpath} from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {validateViewerSoundRegistry} from './viewer-sound-registry.mjs'

// Official 1.21.1 version/index/object chain, checked against the locked client.
export const NATIVE_AUDIO_PROVENANCE=Object.freeze({minecraftVersion:'1.21.1',assetIndexId:'17',
  assetIndexSha1:'e5cb391af96038a8af638bf7cc7f2be44bc4b843',soundsJsonSha1:'09eab141cce7550f9a74c65db0e9abbb342cf50f'})
const hash=(algorithm,bytes)=>createHash(algorithm).update(bytes).digest('hex')
const fileName=value=>typeof value==='string'&&/^[a-z0-9_/-]+\.ogg$/.test(value)&&!value.split('/').some(p=>['','.','..'].includes(p))
export const VANILLA_AUDIO_NATIVE_REGISTRIES=Object.freeze({blocks:'55893d269459e1e05387903c77b2db877d7cece875ed31a5a6a2f965822ea546',entities:'64a3020b859531bafd5901869448fc3e0d6e23e79812d136418e9482733788cf'})
export async function loadNativeAudioPack(assetRoot,{nativeRegistrySha256=null,entityRegistrySha256=null}={}) {
  try {
    const root=await realpath(path.join(assetRoot,'public/sounds'))
    const [bytes,indexBytes,soundBytes,registryBytes]=await Promise.all(['manifest.json','source-index.json','source-sounds.json','registry.json'].map(name=>readFile(path.join(root,name))))
    if(bytes.length>4*1024*1024||indexBytes.length>2*1024*1024||soundBytes.length>2*1024*1024||registryBytes.length>1024*1024)throw Error('NATIVE_AUDIO_METADATA_BUDGET_EXCEEDED')
    const manifest=JSON.parse(bytes),index=JSON.parse(indexBytes).objects,definitions=JSON.parse(soundBytes)
    if(manifest.schemaVersion!==3||Object.entries(NATIVE_AUDIO_PROVENANCE).some(([k,v])=>manifest[k]!==v)||
      hash('sha1',indexBytes)!==manifest.assetIndexSha1||hash('sha1',soundBytes)!==manifest.soundsJsonSha1||
      index['minecraft/sounds.json']?.hash!==manifest.soundsJsonSha1)throw Error('NATIVE_AUDIO_ORIGINAL_SOURCE_MISMATCH')
    const registry=validateViewerSoundRegistry(JSON.parse(registryBytes),'1.21.1'),files=Object.create(null)
    if(!manifest.files||!manifest.fileMetadata||Object.keys(manifest.files).length>8192)throw Error('NATIVE_AUDIO_FILE_TABLE_INVALID')
    const originalFiles=new Set()
    for(const event of Object.values(definitions))for(const sound of event.sounds??[]){
      const entry=typeof sound==='string'?{name:sound}:sound
      if(entry.type==='event')continue
      originalFiles.add(entry.name.replace(/^minecraft:/,'')+'.ogg')
    }
    if(originalFiles.size!==Object.keys(manifest.files).length||[...originalFiles].some(file=>!Object.hasOwn(manifest.files,file)))throw Error('NATIVE_AUDIO_FILE_TABLE_INCOMPLETE')
    for(const [name,sha1]of Object.entries(manifest.files)){
      const row=manifest.fileMetadata[name]
      if(!fileName(name)||index[`minecraft/sounds/${name}`]?.hash!==sha1||row?.sha1!==sha1||
        !/^[a-f0-9]{64}$/.test(row.sha256)||!Number.isSafeInteger(row.bytes)||row.bytes!==index[`minecraft/sounds/${name}`]?.size||row.bytes<=0||row.bytes>32*1024*1024)throw Error('NATIVE_AUDIO_FILE_SOURCE_MISMATCH')
      files[name]={...row}
    }
    const numericRegistryAvailable=nativeRegistrySha256===VANILLA_AUDIO_NATIVE_REGISTRIES.blocks&&entityRegistrySha256===VANILLA_AUDIO_NATIVE_REGISTRIES.entities
    // The matching client's exported SoundTypes supply local hit/step/break
    // events. Unknown or modded registries must not borrow vanilla sound types.
    let blocks=null,blockSoundsReason=null
    if(numericRegistryAvailable)try{
      const raw=await readFile(path.join(root,'block-sounds.json'))
      if(hash('sha256',raw)!=='d43dc9e7862aac8acdf4d0723379dbb387b1e457a9ce4ca954a9100d7e0a2b80')throw Error('NATIVE_AUDIO_BLOCK_TYPES_INTEGRITY_MISMATCH')
      blocks=JSON.parse(raw).blocks
    }catch(e){blockSoundsReason=e.code==='ENOENT'?'NATIVE_AUDIO_BLOCK_TYPES_MISSING':e.message}
    const metadata={available:true,...NATIVE_AUDIO_PROVENANCE,definitions,files,numericRegistryAvailable,blocks,blockSoundsReason,
      source:'verified_original_launcher_assets',randomSource:'Minecraft_1.21.1_LegacyRandomSource',completeAudioParityVerified:false}
    return {available:true,registry:numericRegistryAvailable?registry:{sounds:{}},metadata,async read(name){
      if(!Object.hasOwn(files,name))throw Error('NATIVE_AUDIO_FILE_NOT_EXPORTED')
      const file=await realpath(path.join(root,name))
      if(!file.startsWith(root+path.sep))throw Error('NATIVE_AUDIO_FILE_PATH_ESCAPE')
      const bytes=await readFile(file),expected=files[name]
      if(bytes.length!==expected.bytes||hash('sha1',bytes)!==expected.sha1||hash('sha256',bytes)!==expected.sha256)throw Error('NATIVE_AUDIO_FILE_INTEGRITY_MISMATCH')
      return bytes
    }}
  }catch(error){return {available:false,registry:{sounds:{}},metadata:{available:false,
    reason:error.code==='ENOENT'?'NATIVE_AUDIO_ORIGINAL_PACK_MISSING':error.message.startsWith('NATIVE_AUDIO_')?error.message:'NATIVE_AUDIO_ORIGINAL_PACK_INVALID'}}}
}
