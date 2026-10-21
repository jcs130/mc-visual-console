import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import * as THREE from 'three'
import { NativeAssetReader } from '../../src/native-viewer/model-loader.js'
import { prepareNativeGlint, nativeGlintSprite, nativeGlintMatrix, NATIVE_GLINT_TEXTURE, installNativeGlintMaterial } from '../../src/native-viewer/native-item-glint.js'
import { nativeGlintIconUvMap, nativeGlintIconPixels, NativeIconGlintClock } from '../../src/native-viewer/native-icon-glint.js'
import { resolveNativeItemAppearance } from '../../src/native-viewer/native-item-appearance.js'
import { parseNativeItemStack } from '../../src/native-viewer/native-item-stack.js'
import { pngRgba } from './fixtures/png-rgba.mjs'

const root = new URL('../../../asset-packs/vanilla-1.21.1/', import.meta.url)
const raw = (name='iron_sword', components='"minecraft:enchantments":{levels:{"minecraft:sharpness":1}}') => ({name:'minecraft:'+name,count:1,snbt:`{id:"minecraft:${name}",count:1,components:{${components}}}`})
async function reader (mutate = () => {}) {
  const manifest = JSON.parse(await fs.readFile(new URL('native-assets.json',root),'utf8'));mutate(manifest)
  return new NativeAssetReader(manifest,p=>fs.readFile(new URL(p,root)))
}
test('SHA-checked original glint pixels equal the independent PNG decoder; original Java stitches supply actual sprite coordinates',async()=>{
  const r=await reader(), glint=await prepareNativeGlint(r), expected=pngRgba(await r.bytes(NATIVE_GLINT_TEXTURE))
  assert.deepEqual(glint.pixels,expected.pixels);assert.equal(glint.width,128)
  assert.deepEqual(nativeGlintSprite(r,'assets/minecraft/textures/item/iron_sword.png'),[688,128,16,16,1024,512])
  assert.deepEqual(nativeGlintSprite(r,'assets/minecraft/textures/entity/shield_base_nopattern.png'),[256,320,64,64,512,512])
  assert.equal(await prepareNativeGlint(r),glint,'one shared decode per reader')
})
test('changed atlas inputs, shaders, resource sources and glint PNG cannot silently get an approximate effect',async()=>{
  for(const mutate of [m=>m.sources.push({sha256:'unknown'}),m=>m.assets['assets/minecraft/textures/item/extra.png']={sha256:'new'},m=>m.assets[NATIVE_GLINT_TEXTURE].sha256='wrong',
    m=>m.assets['assets/minecraft/textures/item/iron_sword.png'].sha256='wrong',
    m=>m.assets['assets/minecraft/shaders/core/rendertype_glint.vsh'].sha256='wrong'])await assert.rejects(prepareNativeGlint(await reader(mutate)),/NATIVE_GLINT_/)
})
test('GUI and held original shaders move with time; blend adds squared source RGB while retaining transparent pixels and alpha',async()=>{
  const r=await reader(), stack=parseNativeItemStack(raw()), selection=await resolveNativeItemAppearance(r,stack,{kind:'gui'}),glint=selection.requirements.glint
  const map=nativeGlintIconUvMap(selection,glint), base=new Uint8ClampedArray(32*32*4).fill(45)
  for(let i=0;i<32*32;i++)base[i*4+3]=255
  base[3]=0
  const first=nativeGlintIconPixels(base,map,glint,1000),second=nativeGlintIconPixels(base,map,glint,6000)
  assert.notDeepEqual(first,second);assert.deepEqual(first.slice(0,4),base.slice(0,4));assert.equal(first[7],255)
  assert.ok(first.some((value,index)=>index%4!==3&&value>base[index]))
  assert.ok(map.uv.every(Number.isFinite));assert.ok(map.uv[0]>=688/1024&&map.uv[0]<704/1024)
  assert.notDeepEqual(nativeGlintMatrix(1000).elements,nativeGlintMatrix(2000).elements)
  const material=new THREE.ShaderMaterial({fragmentShader:'gl_FragColor=vec4(c.rgb*nativeTint,c.a);'})
  installNativeGlintMaterial(material,glint,glint.sprites['assets/minecraft/textures/item/iron_sword.png'])
  assert.match(material.fragmentShader,/nativeFoil/);assert.match(material.fragmentShader,/pow\(c.rgb\*0.75/)
  let disposed=0;material.userData.nativeGlint.texture.addEventListener('dispose',()=>disposed++)
  const before=material.uniforms.nativeGlintMatrix.value.clone();material.userData.updateNativeGlint(1000)
  assert.notDeepEqual(material.uniforms.nativeGlintMatrix.value.elements,before.elements);material.dispose();assert.equal(disposed,1)
})
test('float texture matrices agree with original 1.21.1 RenderStateShard arithmetic executed by its JOML library',()=>{
  for(const [time,x,y]of [[0,0,0],[1000,-.036363635,.13333334],[6000,-.21818182,.8],[1700000000000,-.8181818,.6666667]]){
    const expected=[7.878462,1.3891854,0,-1.3891854,7.878462,0,x,y,1],actual=nativeGlintMatrix(time).elements
    expected.forEach((value,index)=>assert.ok(Math.abs(actual[index]-value)<3e-7,`${time} at ${index}`))
  }
})
test('unenchanted and explicit no-glint stacks keep ordinary material; shield GUI UVs come from its own stitched atlas',async()=>{
  const r=await reader()
  for(const components of ['', '"minecraft:enchantments":{levels:{"minecraft:sharpness":1}},"minecraft:enchantment_glint_override":false']) {
    const selected=await resolveNativeItemAppearance(r,parseNativeItemStack(raw('iron_sword',components)),{kind:'gui'})
    assert.equal(selected.requirements.glint,null)
  }
  const selected=await resolveNativeItemAppearance(r,parseNativeItemStack(raw('shield')),{kind:'gui'})
  const map=nativeGlintIconUvMap(selected,selected.requirements.glint), known=[...map.uv].filter(Number.isFinite)
  assert.ok(known.length>100);assert.ok(known.every(value=>value>=0&&value<=1))
})
test('one bounded icon clock shares a painted entry, skips hidden/offscreen targets, removes retired cells and cancels on disposal',async()=>{
  const r=await reader(), selected=await resolveNativeItemAppearance(r,parseNativeItemStack(raw()),{kind:'gui'})
  let callback,cancelled=0,time=1000,paints=0,decodes=0
  const document={hidden:false,defaultView:{innerWidth:100,innerHeight:100}},canvas=()=>({dataset:{},isConnected:true,
    getClientRects:()=>[{}],getBoundingClientRect:()=>({left:0,top:0,right:32,bottom:32}),getContext:()=>({createImageData:()=>({data:new Uint8ClampedArray(32*32*4)}),putImageData(){paints++}})})
  const clock=new NativeIconGlintClock({document,requestFrame:fn=>{callback=fn;return 1},cancelFrame:()=>cancelled++,now:()=>time,
    decode:async()=>{decodes++;return new Uint8ClampedArray(32*32*4).fill(255)}})
  const effect=clock.add({url:'blob:original'},selected,selected.requirements.glint),a=canvas(),b=canvas();effect.bind(a);effect.bind(b)
  await new Promise(resolve=>setImmediate(resolve));callback();assert.equal(decodes,1);assert.equal(paints,2)
  document.hidden=true;time+=100;callback();assert.equal(paints,2)
  document.hidden=false;a.isConnected=false;time+=100;callback();assert.equal(paints,3);assert.equal(clock.bindings.size,1)
  effect.dispose();assert.equal(clock.bindings.size,0);clock.dispose();assert.equal(cancelled,1)
})
