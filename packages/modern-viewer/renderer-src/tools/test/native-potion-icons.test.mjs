import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {NativeAssetReader} from '../../src/native-viewer/model-loader.js'
import {parseNativeItemStack} from '../../src/native-viewer/native-item-stack.js'
import {loadOriginalItemColors} from '../../src/native-viewer/native-potion-items.js'
import {renderNativePotionIcon} from '../../src/native-viewer/native-potion-icons.js'
import {NativeItemIcons,nativeItemIconEligible} from '../../src/native-viewer/native-item-icons.js'
import {pngRgba} from './fixtures/png-rgba.mjs'
const directory=new URL('../../../asset-packs/vanilla-1.21.1/',import.meta.url)
const manifest=JSON.parse(await fs.readFile(new URL('native-assets.json',directory),'utf8'))
const reader=new NativeAssetReader(manifest,p=>fs.readFile(new URL(p,directory))),colors=await loadOriginalItemColors(reader)
const raw=(name,component='')=>({name:'minecraft:'+name,count:1,snbt:`{id:"minecraft:${name}",count:1${component?',components:{"minecraft:potion_contents":{'+component+'}}':''}}`})
const pixels=async bytes=>pngRgba(bytes)

test('all 46 bases retain the original color and alpha mask in all four potion GUI models',async()=>{
  for(const name of ['potion','splash_potion','lingering_potion','tipped_arrow'])for(const potion of colors.potions){
    let encoded
    const result=await renderNativePotionIcon(reader,parseNativeItemStack(raw(name,'potion:"'+potion.name+'"')),
      {readPixels:pixels,encodePixels:async value=>{encoded=value;return new Blob([value.pixels])}})
    assert.equal(result.tintColor,potion.color>>>0);assert.equal(result.width,16);assert.equal(result.height,16)
    assert(result.sourcePaths.includes('assets/minecraft/models/item/'+name+'.json'))
    assert(encoded.pixels.some((value,n)=>n%4===3&&value===255));assert.equal(result.pixelParityVerified,false)
  }
})

test('bottle pixels retain their original color while the liquid respects signed custom tint',async()=>{
  const layers=[];let encoded
  await renderNativePotionIcon(reader,parseNativeItemStack(raw('lingering_potion','custom_color:0')),
    {readPixels:async bytes=>{const value=pngRgba(bytes);layers.push(value);return value},encodePixels:async value=>{encoded=value;return new Blob([value.pixels])}})
  const bottle=layers[1].pixels,liquid=layers[0].pixels;let opaqueBottle=0,opaqueLiquid=0
  for(let n=0;n<bottle.length;n+=4){
    if(bottle[n+3]===255){assert.deepEqual(encoded.pixels.slice(n,n+4),bottle.slice(n,n+4));opaqueBottle++}
    else if(liquid[n+3]===255){assert.deepEqual([...encoded.pixels.slice(n,n+4)],[0,0,0,255]);opaqueLiquid++}
    else assert.equal(encoded.pixels[n+3],0)
  }
  assert(opaqueBottle>0&&opaqueLiquid>0)
})

test('icon cache binds to full potion components and disposal revokes each generated URL',async()=>{
  const made=[],revoked=[]
  const icons=new NativeItemIcons(reader,{createUrl:blob=>{made.push(blob);return 'blob:fixture-'+made.length},revokeUrl:url=>revoked.push(url),
    potionIconOptions:{readPixels:pixels,encodePixels:async value=>new Blob([value.pixels])}})
  const first=raw('potion','custom_color:0'),second=raw('potion','custom_color:-1')
  assert(nativeItemIconEligible(first));assert.equal(icons.resolve(first),null);assert.equal(icons.resolve(second),null)
  while(icons.active)await new Promise(resolve=>setImmediate(resolve))
  assert.equal(icons.reason(first),null);assert.equal(icons.reason(second),null)
  assert.notEqual(icons.resolve(first).url,icons.resolve(second).url);assert.equal(made.length,2)
  icons.dispose();assert.equal(revoked.length,2)
})

test('unverified partial alpha cannot silently become an approximate potion icon',async()=>{
  await assert.rejects(renderNativePotionIcon(reader,parseNativeItemStack(raw('splash_potion')),
    {readPixels:async bytes=>{const data=pngRgba(bytes);data.pixels[3]=128;return data},encodePixels:()=>assert.fail('unsupported alpha must not encode')}),/GUI_ALPHA_UNSUPPORTED/)
})
