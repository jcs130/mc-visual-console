import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHeldMapPreview} from '../src/modern-viewer/held-map-preview.js';
import {applyMapPixels} from '../src/modern-viewer/map-photos.js';

function setup(){
  const nodes=[];let draws=0,clears=0,pixels=null;
  const context={createImageData:()=>({data:new Uint8ClampedArray(65536)}),putImageData(image){draws++;pixels=image.data;},clearRect(){clears++;}};
  const document={createElement(tag){const node={tag,children:[],style:{},dataset:{},attributes:{},textContent:'',events:{},append(...items){this.children.push(...items);},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,v){this.events[k]=v;},removeEventListener(k){delete this.events[k];},remove(){this.removed=true;},getContext:()=>context};nodes.push(node);return node;}};
  const preview=createHeldMapPreview({document});
  return {preview,canvas:nodes.find(n=>n.tag==='canvas'),button:nodes.find(n=>n.tag==='button'),nodes,draws:()=>draws,clears:()=>clears,pixels:()=>pixels};
}
const nativeMap=(data=Uint8Array.from([48,4]))=>{
  const palette=Array(62).fill(0);palette[12]=0x4040ff;palette[1]=0x7fb238;
  return applyMapPixels(null,{schemaVersion:1,mapId:21,columns:data.length===16384?128:data.length,rows:data.length===16384?128:1,x:0,y:0,data},palette,[180,220,255,135]);
};
test('uniform native blue water pixels remain exact and require an explicit preview expansion',()=>{
  const s=setup(),map=nativeMap(new Uint8Array(16384).fill(48));
  s.preview.update({id:21,map,epoch:0,revision:1});
  assert.equal(s.canvas.style.display,'none');assert.equal(s.draws(),0);
  assert.equal(s.button.textContent,'查看图片');assert.equal(s.button.attributes['aria-expanded'],'false');
  assert.ok(s.nodes.some(n=>n.textContent==='手持地图 #21'));
  s.button.events.click();assert.equal(s.canvas.style.display,'block');
  assert.deepEqual([...s.pixels().slice(0,4)],[45,45,180,255]);
  assert.deepEqual(new Uint8Array(s.pixels()),map.rgba,'real uniform maps are never recolored or rejected');
  s.preview.update({id:21,map,epoch:0,revision:1});assert.equal(s.draws(),1);
  s.button.events.click();s.preview.update({id:21,map,epoch:0,revision:2});
  assert.equal(s.draws(),1,'collapsed maps do not repaint');
});
test('changing maps or epochs clears an expanded old image, and missing pixels never display stale data',()=>{
  const s=setup(),map=nativeMap();s.preview.update({id:21,map,epoch:0,revision:1});s.button.events.click();
  s.preview.update({id:22,epoch:0,revision:2});
  assert.equal(s.canvas.style.display,'none');assert.equal(s.button.disabled,true);assert.equal(s.clears(),1);
  assert.ok(s.nodes.some(n=>n.textContent==='等待服务器像素'));
  s.preview.update({id:22,map:{...map,mapId:22},epoch:0,revision:3});s.button.events.click();
  s.preview.update({id:22,map:{...map,mapId:22},epoch:1,revision:4});
  assert.equal(s.canvas.style.display,'none');assert.equal(s.button.attributes['aria-expanded'],'false');
  s.preview.reset();assert.equal(s.preview.element.style.display,'none');
  s.preview.dispose();assert.equal(s.preview.element.removed,true);assert.equal(s.button.events.click,undefined);
});
test('partial maps and unsupported marker layers are disclosed rather than labeled as photographs',()=>{
  const s=setup(),map=nativeMap();s.preview.update({id:21,map,epoch:0,revision:1});
  assert.ok(s.nodes.some(n=>n.textContent==='已收到 2/16384 像素'));
  const full=nativeMap(new Uint8Array(16384).fill(48));full.icons=[{type:1}];
  s.preview.update({id:21,map:full,epoch:0,revision:2});
  assert.ok(s.nodes.some(n=>n.textContent==='服务器原图 · 地图标记暂未显示'));
});
