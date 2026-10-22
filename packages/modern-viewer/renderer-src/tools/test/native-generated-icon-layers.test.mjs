import test from 'node:test'
import assert from 'node:assert/strict'
import {renderNativeGeneratedLayers} from '../../src/native-viewer/native-generated-icon-layers.js'
import {parseNativeItemStack} from '../../src/native-viewer/native-item-stack.js'
import {nativeStaticItemState} from '../../src/native-viewer/native-static-item-providers.js'

const png=(width=16,height=16)=>{const bytes=new Uint8Array(33);bytes.set([137,80,78,71,13,10,26,10],0);bytes.set([73,72,68,82],12);const v=new DataView(bytes.buffer);v.setUint32(16,width);v.setUint32(20,height);return bytes}
const model={nativeGenerated:true,elements:[],textures:{layer0:'twilightforest:item/glass_sword_solid',layer1:'twilightforest:item/glass_sword_clear'},sourcePaths:['assets/twilightforest/models/item/glass_sword.json']}
test('original generated layers retain their exact PNG bytes and order in a self-contained image',async()=>{
  const calls=[],a=png(),b=png();b[32]=102
  const reader={manifest:{assets:{}},bytes:async p=>{calls.push(p);return p.includes('solid')?a:b}}
  const result=await renderNativeGeneratedLayers(reader,model),svg=await result.blob.text()
  assert.equal(result.layers,2);assert.equal(result.blob.type,'image/svg+xml');assert.equal(result.width,16)
  assert.equal(calls.length,2);assert(svg.indexOf(Buffer.from(a).toString('base64'))<svg.indexOf(Buffer.from(b).toString('base64')))
  assert.equal((svg.match(/<image /g)||[]).length,2);assert(!svg.includes('<script'));assert(!svg.includes('http:')||svg.includes('http://www.w3.org/2000/svg'))
  assert.equal(result.pixelParityVerified,false)
})
test('gaps, animated textures, differing dimensions and invalid original PNGs remain explicit',async()=>{
  const reader={manifest:{assets:{}},bytes:async()=>png()}
  await assert.rejects(()=>renderNativeGeneratedLayers(reader,{...model,textures:{layer0:'a:a',layer2:'a:b'}}),/SEQUENCE_INVALID/)
  await assert.rejects(()=>renderNativeGeneratedLayers({...reader,manifest:{assets:{'assets/twilightforest/textures/item/glass_sword_clear.png.mcmeta':{}}}},model),/ANIMATION_UNSUPPORTED/)
  await assert.rejects(()=>renderNativeGeneratedLayers({...reader,bytes:async p=>png(p.includes('clear')?32:16)},model),/DIMENSIONS_UNSUPPORTED/)
  await assert.rejects(()=>renderNativeGeneratedLayers({...reader,bytes:async()=>new Uint8Array(33)},model),/PNG_INVALID/)
})
test('durability and cooldown tags cannot hide the original glass sword model or lose long precision',()=>{
  const stack=parseNativeItemStack({name:'twilightforest:glass_sword',count:1,snbt:'{id:"twilightforest:glass_sword",count:1,components:{"twilightforest:infinite_glass_sword":{},"twilightforest:sidestep_cooldown":9223372036854775807L}}'})
  assert.equal(nativeStaticItemState(stack).stack,stack)
  assert.equal(stack.components['twilightforest:sidestep_cooldown'].value,'9223372036854775807')
  assert.throws(()=>nativeStaticItemState(parseNativeItemStack({name:stack.id,count:1,snbt:'{id:"twilightforest:glass_sword",count:1,components:{"twilightforest:ore_data":{}}}'})),/VISUAL_COMPONENT_UNSUPPORTED/)
})
