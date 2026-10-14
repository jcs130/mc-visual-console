import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {createNativeMiniMap} from '../../src/native-viewer/native-mini-map.js'
import {Document} from './fixtures/native-console-dom.mjs'
const UUID='e371227c-09fa-3722-84f4-f3228a552c3c'
function fixture() {
  const document=new Document(),create=document.createElement.bind(document),calls=[]
  const context={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),clearRect(){},putImageData(){},beginPath(){},moveTo(x,y){calls.push(['move',x,y])},lineTo(x,y){calls.push(['line',x,y])},stroke(){},arc(){},fill(){}}
  document.createElement=tag=>{const e=create(tag);if(tag==='canvas')e.getContext=()=>context;return e}
  const original={},renderer={target:original,viewport:new THREE.Vector4(2,3,80,90),scissor:new THREE.Vector4(4,5,50,60),scissorTest:true,autoClear:false,
    getRenderTarget(){return this.target},setRenderTarget(t){this.target=t},getViewport(v){return v.copy(this.viewport)},setViewport(...args){this.viewport=args[0]?.isVector4?args[0].clone():new THREE.Vector4(...args)},
    getScissor(v){return v.copy(this.scissor)},setScissor(v){this.scissor=v.clone()},getScissorTest(){return this.scissorTest},setScissorTest(v){this.scissorTest=v},
    render(scene,camera){calls.push(['render',scene,camera.position.toArray()]);if(this.fail)throw Error('GL_TEST_FAILURE')},readRenderTargetPixels(...args){args.at(-1).fill(127)}}
  const scene=new THREE.Scene(),map=createNativeMiniMap({document,renderer,scene,size:8}),frame={position:{x:10,y:65,z:20},playerUuid:UUID,entityId:7,epoch:1,now:1000}
  return {map,renderer,scene,calls,original,document,frame}
}
test('terrain uses the same original scene/context, rate limits draws and restores all main renderer state',()=>{
  const {map,renderer,scene,calls,original,frame}=fixture()
  assert.equal(map.render(frame),true);assert.equal(calls[0][1],scene)
  assert.equal(renderer.target,original);assert.deepEqual(renderer.viewport.toArray(),[2,3,80,90]);assert.deepEqual(renderer.scissor.toArray(),[4,5,50,60]);assert.equal(renderer.scissorTest,true);assert.equal(renderer.autoClear,false)
  assert.equal(map.root.dataset.state,'available');assert.match(map.root.textContent,/10, 65, 20/)
  assert.equal(map.render({...frame,now:1100}),false);assert.equal(calls.length,1)
  renderer.fail=true;assert.equal(map.render({...frame,now:1400}),false)
  assert.equal(renderer.target,original);assert.equal(renderer.autoClear,false);assert.equal(map.root.dataset.reason,'GL_TEST_FAILURE');map.dispose();map.dispose()
})
test('route/trail require the same UUID and entity, identity reset clears pixels and hidden views do no work',()=>{
  const {map,calls,document,frame}=fixture(),visual={subject:{playerUuid:UUID,entityId:7},trail:[{x:9,y:65,z:20},{x:10,y:65,z:21}],route:{points:[{x:10,y:65,z:20},{x:15,y:65,z:20}]}}
  assert.equal(map.render({...frame,visual}),true);assert.equal(calls.filter(c=>c[0]==='line').length,2)
  calls.length=0;map.render({...frame,visual:{...visual,subject:{playerUuid:UUID,entityId:8}},now:1500});assert.equal(calls.filter(c=>c[0]==='line').length,0)
  document.hidden=true;assert.equal(map.render({...frame,now:2000}),false);assert.equal(map.root.dataset.state,'unavailable')
  document.hidden=false;assert.equal(map.render({...frame,entityId:8,epoch:2,now:2001}),true)
  map.reset();assert.equal(map.root.dataset.state,'unavailable');map.dispose();assert.equal(map.root.parentNode,null)
})
