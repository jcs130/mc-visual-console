import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { inspectNativeItemPng, auditNativeItemGuiReader, verifyNativeItemGuiRegistry } from '../audit-native-item-gui.mjs'
import { STATIC_ITEM_SOURCES } from '../../src/native-viewer/native-static-item-providers.js'

// Synthetic codec fixtures, never committed Minecraft/modpack image data.
function crc(bytes){let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1}return (n^0xffffffff)>>>0}
function chunk(name,body){const n=Buffer.from(name),length=Buffer.alloc(4),tail=Buffer.alloc(4);length.writeUInt32BE(body.length);tail.writeUInt32BE(crc(Buffer.concat([n,body])));return Buffer.concat([length,n,body,tail])}
function png({width=2,height=1,depth=8,type=6,raw=Buffer.from([0,255,0,0,255,0,255,0,128]),extra=[]}={}) {
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=depth;header[9]=type
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),...extra,chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))])
}

test('PNG audit distinguishes opaque, binary-cutout and partial alpha without assuming palette images are opaque',()=>{
  assert.deepEqual(inspectNativeItemPng(png()),{width:2,height:1,opaque:false,binaryAlpha:false,minAlpha:128/255,maxAlpha:1})
  assert.equal(inspectNativeItemPng(png({raw:Buffer.from([0,1,2,3,255,4,5,6,255])})).opaque,true)
  const indexed=png({width:4,depth:2,type:3,raw:Buffer.from([0,27]),extra:[
    chunk('PLTE',Buffer.from([255,0,0,0,255,0,0,0,255,255,255,0])),chunk('tRNS',Buffer.from([255,0,128,255]))]})
  assert.deepEqual(inspectNativeItemPng(indexed),{width:4,height:1,opaque:false,binaryAlpha:false,minAlpha:0,maxAlpha:1})
  const gray=png({width:2,depth:1,type:0,raw:Buffer.from([0,64]),extra:[chunk('tRNS',Buffer.from([0,1]))]})
  assert.equal(inspectNativeItemPng(gray).opaque,false);assert.equal(inspectNativeItemPng(gray).binaryAlpha,true)
})

test('PNG row filters retain real alpha, including Paeth, rather than reading compressed bytes as pixels',()=>{
  const values=[1,2,3,255,4,5,6,128]
  for(const filter of [0,1,2,3,4]){
    const encoded=values.map((value,x)=>{
      const left=x>=4?values[x-4]:0
      return (value-(filter===1||filter===4?left:filter===3?Math.floor(left/2):0))&255
    })
    assert.equal(inspectNativeItemPng(png({raw:Buffer.from([filter,...encoded])})).minAlpha,128/255)
  }
  const twoRows=png({height:2,raw:Buffer.from([0,...values,2,0,0,0,0,0,0,0,0])})
  assert.equal(inspectNativeItemPng(twoRows).minAlpha,128/255)
})

test('oversized dimensions, corrupt CRC, animation, invalid filter and excessive inflate output fail closed before large allocation',()=>{
  assert.throws(()=>inspectNativeItemPng(png({width:2049})),/DIMENSIONS_UNSUPPORTED/)
  const corrupt=png();corrupt[corrupt.length-1]^=1;assert.throws(()=>inspectNativeItemPng(corrupt),/PNG_INVALID/)
  assert.throws(()=>inspectNativeItemPng(png({extra:[chunk('acTL',Buffer.alloc(8))]})),/APNG_UNSUPPORTED/)
  assert.throws(()=>inspectNativeItemPng(png({raw:Buffer.from([5,1,2,3,255,4,5,6,255])})),/PNG_INVALID/)
  assert.throws(()=>inspectNativeItemPng(png({raw:Buffer.alloc(100000)})),/PNG_INVALID/)
})

test('offline audit separates candidate, verified assets, production texture guard and pending browser/pixel acceptance',async()=>{
  const image=png({raw:Buffer.from([0,1,2,3,255,4,5,6,255])}),name='minecraft:iron_ingot'
  const reader={manifest:{minecraftVersion:'1.21.1',assetIntegrityVerified:true,clientJarSha256:STATIC_ITEM_SOURCES.minecraft.sha256,
    sources:[STATIC_ITEM_SOURCES.minecraft],assets:{'assets/minecraft/textures/item/iron_ingot.png':{bytes:image.length}}},
    json:async path=>path.endsWith('/iron_ingot.json')?{parent:'minecraft:item/generated',textures:{layer0:'minecraft:item/iron_ingot'}}:{parent:'builtin/generated',gui_light:'front'},
    bytes:async()=>image}
  const result=await auditNativeItemGuiReader(reader,{names:[name]})
  assert.equal(result.candidates,1);assert.equal(result.assetIntegrityReady,1);assert.equal(result.guardScope,1)
  assert.equal(result.browserVerified,false);assert.equal(result.pixelParityVerified,false)
  assert.equal(result.rows[0].providerEvidence.itemClass,'net.minecraft.world.item.Item')
  await assert.rejects(auditNativeItemGuiReader(reader,{names:Array(4097).fill(name)}),/CANDIDATE_LIMIT/)
  await assert.rejects(auditNativeItemGuiReader(reader,{names:[name,name]}),/CANDIDATE_LIMIT/)
  reader.bytes=async()=>{throw Error('NATIVE_RESOURCE_PRIORITY_UNRESOLVED')}
  const fail=await auditNativeItemGuiReader(reader,{names:[name]});assert.equal(fail.guardScope,0)
  assert.equal(fail.unavailable.NATIVE_RESOURCE_PRIORITY_UNRESOLVED,1)
})

test('registration audit uses SHA-verified native IDs rather than similarly spelled Java field names',()=>{
  const bytes=Buffer.from('minecraft:air\t0\nminecraft:cut_sandstone_slab\t267\n')
  const manifest={registryHashes:{'items.tsv':createHash('sha256').update(bytes).digest('hex')}}
  assert.deepEqual(verifyNativeItemGuiRegistry(manifest,bytes,['minecraft:cut_sandstone_slab']),{registryEntries:2,candidatesRegistered:1})
  assert.throws(()=>verifyNativeItemGuiRegistry(manifest,bytes,['minecraft:cut_standstone_slab']),/REGISTRATION_MISSING/)
  assert.throws(()=>verifyNativeItemGuiRegistry(manifest,Buffer.from('minecraft:air\t0\n'),[]),/REGISTRY_HASH_MISMATCH/)
  const duplicate=Buffer.from('minecraft:air\t0\nminecraft:air\t1\n')
  assert.throws(()=>verifyNativeItemGuiRegistry({registryHashes:{'items.tsv':createHash('sha256').update(duplicate).digest('hex')}},duplicate,[]),/REGISTRY_INVALID/)
  assert.throws(()=>verifyNativeItemGuiRegistry(manifest,Buffer.alloc(4194305),[]),/REGISTRY_LIMIT/)
})
