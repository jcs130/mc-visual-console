import { readFile, writeFile, stat } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { resolve, relative, isAbsolute, sep, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { NativeAssetReader, textureId, resourcePath } from '../src/native-viewer/model-loader.js'
import { NATIVE_STATIC_ITEM_NAMES, STATIC_ITEM_SOURCES, nativeStaticItemState,
  verifyNativeStaticItemEvidence } from '../src/native-viewer/native-static-item-providers.js'
import { resolveNativeFlatItemTexture } from '../src/native-viewer/native-item-icons.js'
import { resolveNativeBlockItemModel, prepareNativeBlockItemIcon } from '../src/native-viewer/native-block-item-icons.js'

// Offline audit only. No game/server/model connection, GPU, asset export or
// source modification. PNG inspection independently checks the production
// opaque-block texture guard; it does not certify browser/Java pixel parity.
const MAX_PNG=16777216, MAX_PIXELS=4194304
const crcTable=Uint32Array.from({length:256},(_,n)=>{
  for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1
  return n>>>0
})
const crc=bytes=>{
  let n=0xffffffff
  for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8)
  return (n^0xffffffff)>>>0
}
const paeth=(a,b,c)=>{
  const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c)
  return pa<=pb&&pa<=pc?a:pb<=pc?b:c
}

export function inspectNativeItemPng(input) {
  const bytes=Buffer.from(input.buffer??input,input.byteOffset??0,input.byteLength??input.length)
  const fail=()=>{throw Error('NATIVE_ITEM_AUDIT_PNG_INVALID')}
  if(bytes.length<45||bytes.length>MAX_PNG||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))fail()
  let width,height,depth,type,channels,palette,transparency,ended=false,offset=8,chunks=0
  const data=[]
  while(offset<bytes.length) {
    if(++chunks>4096||offset+12>bytes.length)fail()
    const length=bytes.readUInt32BE(offset),start=offset+8,end=start+length,name=bytes.toString('ascii',offset+4,start)
    if(length>MAX_PNG||end+4>bytes.length||crc(bytes.subarray(offset+4,end))!==bytes.readUInt32BE(end))fail()
    const body=bytes.subarray(start,end)
    if(name==='IHDR') {
      if(chunks!==1||length!==13)fail()
      width=body.readUInt32BE(0);height=body.readUInt32BE(4);depth=body[8];type=body[9]
      channels=({0:1,2:3,3:1,4:2,6:4})[type]
      if(!channels||![1,2,4,8,16].includes(depth)||(type!==0&&type!==3&&depth<8)||type===3&&depth===16||
        body[10]!==0||body[11]!==0||body[12]!==0)throw Error('NATIVE_ITEM_AUDIT_PNG_FORMAT_UNSUPPORTED')
      if(width<1||height<1||width>2048||height>2048||width*height>MAX_PIXELS)throw Error('NATIVE_ITEM_AUDIT_PNG_DIMENSIONS_UNSUPPORTED')
    } else if(name==='PLTE') {
      if(!width||palette||!length||length>768||length%3)fail();palette=body
    } else if(name==='tRNS') {
      if(!width||transparency||!length||type===4||type===6)fail();transparency=body
    } else if(name==='IDAT') { if(!width)fail();data.push(body) }
    else if(name==='IEND') {if(length||!data.length)fail();ended=true;offset=end+4;break}
    else if(['acTL','fcTL','fdAT'].includes(name))throw Error('NATIVE_ITEM_AUDIT_APNG_UNSUPPORTED')
    else if((name.charCodeAt(0)&32)===0)throw Error('NATIVE_ITEM_AUDIT_PNG_CHUNK_UNSUPPORTED')
    offset=end+4
  }
  if(!ended||offset!==bytes.length||type===3&&!palette||
    transparency&&(type===0&&transparency.length!==2||type===2&&transparency.length!==6||type===3&&transparency.length>palette.length/3))fail()
  const rowBytes=Math.ceil(width*channels*depth/8),bpp=Math.max(1,Math.ceil(channels*depth/8)),expected=height*(rowBytes+1)
  let raw
  try { raw=inflateSync(Buffer.concat(data),{maxOutputLength:expected}) } catch {fail()}
  if(raw.length!==expected)fail()
  const max=depth===16?65535:255
  let minAlpha=max,maxAlpha=0,binaryAlpha=true,previous=new Uint8Array(rowBytes)
  const sample=(row,index)=>depth===16?(row[index*2]<<8)|row[index*2+1]:depth===8?row[index]:
    (row[Math.floor(index*depth/8)]>>>(8-depth-(index*depth)%8))&((1<<depth)-1)
  for(let y=0;y<height;y++) {
    const filter=raw[y*(rowBytes+1)],row=new Uint8Array(rowBytes)
    if(filter>4)fail()
    for(let x=0;x<rowBytes;x++) {
      const a=x>=bpp?row[x-bpp]:0,b=previous[x],c=x>=bpp?previous[x-bpp]:0
      row[x]=(raw[y*(rowBytes+1)+1+x]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255
    }
    for(let x=0;x<width;x++) {
      let alpha=max
      if(type===3) {
        const index=sample(row,x);if(index>=palette.length/3)fail()
        alpha=index<(transparency?.length??0)?transparency[index]:255
      } else if(type===4||type===6)alpha=sample(row,x*channels+channels-1)
      else if(transparency) {
        const equal=Array.from({length:channels},(_,c)=>sample(row,x*channels+c)===transparency.readUInt16BE(c*2)).every(Boolean)
        if(equal)alpha=0
      }
      minAlpha=Math.min(minAlpha,alpha);maxAlpha=Math.max(maxAlpha,alpha)
      if(alpha!==0&&alpha!==max)binaryAlpha=false
    }
    previous=row
  }
  return {width,height,opaque:minAlpha===max,binaryAlpha,minAlpha:minAlpha/max,maxAlpha:maxAlpha/max}
}

export async function auditNativeItemGuiReader(reader,{names=NATIVE_STATIC_ITEM_NAMES,inspectPng=inspectNativeItemPng}={}) {
  if(!Array.isArray(names)||names.length>4096||new Set(names).size!==names.length)throw Error('NATIVE_ITEM_AUDIT_CANDIDATE_LIMIT')
  const rows=[],textures=new Map()
  for(const name of names) {
    try {
      const {evidence}=nativeStaticItemState({name,count:1,snbt:`{id:"${name}",count:1}`})
      verifyNativeStaticItemEvidence(reader,name)
      const modelId=name.replace(':',':item/'),model=await resolveNativeBlockItemModel(reader,modelId)
      let texturePaths,kind,sourcePaths,geometry=null
      if(model.nativeGenerated) {
        const flat=await resolveNativeFlatItemTexture(reader,modelId)
        if(Object.keys(flat.textures).some(k=>k.startsWith('layer')&&k!=='layer0')||!flat.textures.layer0)throw Error('NATIVE_ITEM_LAYERS_UNSUPPORTED')
        texturePaths=[resourcePath(textureId(flat,flat.textures.layer0),'textures','.png')];kind='flat';sourcePaths=[...flat.sourcePaths,...texturePaths]
      } else {
        const plan=await prepareNativeBlockItemIcon(reader,name)
        texturePaths=plan.texturePaths;kind='block';sourcePaths=plan.sourcePaths
        geometry={originalFaces:plan.faces.length,renderFaces:plan.renderFaces.length,guiCulling:{...plan.culling,visible:undefined}}
      }
      let pixels=0;const images=[]
      for(const path of texturePaths) {
        if(reader.manifest.assets[path+'.mcmeta'])throw Error('NATIVE_ITEM_ANIMATION_UNSUPPORTED')
        const size=reader.manifest.assets[path]?.bytes
        if(!Number.isSafeInteger(size)||size<=0||size>MAX_PNG)throw Error('NATIVE_ITEM_TEXTURE_LIMIT')
        if(!textures.has(path))textures.set(path,inspectPng(await reader.bytes(path)))
        const image=textures.get(path);images.push(image);pixels+=image.width*image.height
        if(kind==='block'&&pixels>MAX_PIXELS)throw Error('NATIVE_BLOCK_ITEM_TEXTURE_PIXEL_LIMIT')
      }
      const guardScope=kind==='flat'||images.every(image=>image.opaque)
      rows.push({name,kind,candidate:true,assetIntegrityReady:true,guardScope,
        reason:guardScope?null:'NATIVE_BLOCK_ITEM_TRANSLUCENT_TEXTURE_UNSUPPORTED',providerEvidence:evidence,
        texturePaths,sourcePaths,geometry,browserVerified:false,pixelParityVerified:false})
    } catch(error) {
      rows.push({name,candidate:true,assetIntegrityReady:false,guardScope:false,reason:error.message,
        browserVerified:false,pixelParityVerified:false})
    }
  }
  const frequency=rows.filter(row=>!row.guardScope).reduce((counts,row)=>{
    const reason=row.reason.split(':')[0];counts[reason]=(counts[reason]??0)+1;return counts
  },{})
  return {schemaVersion:1,manifestClientSha256:reader.manifest.clientJarSha256,
    registryItemsSha256:reader.manifest.registryHashes?.['items.tsv']??null,
    candidates:rows.length,assetIntegrityReady:rows.filter(row=>row.assetIntegrityReady).length,
    guardScope:rows.filter(row=>row.guardScope).length,guardScopeByKind:rows.filter(row=>row.guardScope).reduce((o,r)=>(o[r.kind]=(o[r.kind]??0)+1,o),{}),
    unavailable:frequency,browserVerified:false,pixelParityVerified:false,rows}
}

export function verifyNativeItemGuiRegistry(manifest,input,names=NATIVE_STATIC_ITEM_NAMES) {
  const bytes=Buffer.from(input.buffer??input,input.byteOffset??0,input.byteLength??input.length)
  if(bytes.length>4194304)throw Error('NATIVE_ITEM_AUDIT_REGISTRY_LIMIT')
  const expected=manifest.registryHashes?.['items.tsv']
  if(typeof expected!=='string'||createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('NATIVE_ITEM_AUDIT_REGISTRY_HASH_MISMATCH')
  const lines=new TextDecoder('utf-8',{fatal:true}).decode(bytes).split(/\r?\n/)
  if(lines.at(-1)==='')lines.pop()
  if(!lines.length||lines.length>65536)throw Error('NATIVE_ITEM_AUDIT_REGISTRY_LIMIT')
  const ids=new Set(),networkIds=new Set()
  for(const line of lines) {
    const match=/^([a-z0-9_.-]+:[a-z0-9_./-]+)\t(0|[1-9][0-9]*)$/.exec(line)
    const networkId=match?Number(match[2]):NaN
    if(!match||networkId>2147483647||ids.has(match[1])||networkIds.has(networkId))throw Error('NATIVE_ITEM_AUDIT_REGISTRY_INVALID')
    ids.add(match[1]);networkIds.add(networkId)
  }
  if(!Array.isArray(names)||names.length>4096||new Set(names).size!==names.length)throw Error('NATIVE_ITEM_AUDIT_CANDIDATE_LIMIT')
  for(const name of names)if(!ids.has(name))throw Error(`NATIVE_ITEM_AUDIT_REGISTRATION_MISSING:${name}`)
  return {registryEntries:ids.size,candidatesRegistered:names.length}
}

async function main() {
  const args=process.argv.slice(2),options={}
  for(let i=0;i<args.length;i+=2) {
    if(!['--assets','--output','--client','--mods'].includes(args[i])||!args[i+1])throw Error('Usage: --assets DIR [--output EXTERNAL.json] [--client CLIENT.jar --mods MODS_DIR]')
    options[args[i].slice(2)]=args[i+1]
  }
  if(!options.assets)throw Error('--assets is required')
  const root=resolve(options.assets),manifestPath=resolve(root,'native-assets.json')
  if((await stat(manifestPath)).size>67108864)throw Error('NATIVE_ITEM_AUDIT_MANIFEST_LIMIT')
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'))
  const registryPath=resolve(root,'registry/items.tsv')
  if((await stat(registryPath)).size>4194304)throw Error('NATIVE_ITEM_AUDIT_REGISTRY_LIMIT')
  const registration=verifyNativeItemGuiRegistry(manifest,await readFile(registryPath))
  if(options.client||options.mods) {
    if(!options.client||!options.mods)throw Error('--client and --mods must be provided together')
    for(const [namespace,source] of Object.entries(STATIC_ITEM_SOURCES)) {
      const path=namespace==='minecraft'?resolve(options.client):resolve(options.mods,source.name)
      if((await stat(path)).size>268435456)throw Error('NATIVE_ITEM_AUDIT_JAR_LIMIT')
      if(createHash('sha256').update(await readFile(path)).digest('hex')!==source.sha256)throw Error('NATIVE_ITEM_AUDIT_JAR_SOURCE_MISMATCH')
    }
  }
  const reader=new NativeAssetReader(manifest,path=>readFile(resolve(root,path)))
  const report=await auditNativeItemGuiReader(reader)
  report.registration=registration
  if(options.output) {
    const output=resolve(options.output),repoRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..'),inside=relative(repoRoot,output)
    if(!inside||(!inside.startsWith('..'+sep)&&!isAbsolute(inside)))throw Error('NATIVE_ITEM_AUDIT_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY')
    await writeFile(output,JSON.stringify(report,null,2)+'\n')
  }
  const {rows,...summary}=report
  console.log(JSON.stringify(summary,null,2))
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error=>{console.error(error.message);process.exitCode=1})
}
