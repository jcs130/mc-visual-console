import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Vector3} from 'three';
import {applyMapPixels,heldMapId,MapPhotos,mapFramePose} from '../src/modern-viewer/map-photos.js';

const palette=Array(62).fill(0);palette[1]=0x7fb238;palette[2]=0xf7e9a3;
const shades=[180,220,255,135];
const patch=(extra={})=>({schemaVersion:1,epoch:0,mapId:55,columns:2,rows:1,x:0,y:0,data:Uint8Array.from([4,10]),...extra});
test('map palette converts native shade bytes, merges partial rectangles and transparent pixels',()=>{
  let map=applyMapPixels(null,patch(),palette,shades);
  assert.deepEqual([...map.rgba.slice(0,8)],[89,125,39,255,247,233,163,255]);assert.equal(map.received,2);
  map=applyMapPixels(map,patch({columns:1,x:1,y:0,data:Buffer.from([0])}),palette,shades);
  assert.equal(map.received,2);assert.deepEqual([...map.rgba.slice(4,8)],[0,0,0,0]);
  map=applyMapPixels(map,patch({columns:1,x:127,y:127,data:{type:'Buffer',data:[7]}}),palette,shades);
  assert.equal(map.received,3);assert.equal(map.pixels[16383],7);
  assert.equal(applyMapPixels(null,patch({data:Uint8Array.from([4,10]).buffer}),palette,shades).received,2);
  assert.equal(applyMapPixels(map,patch({mapId:99}),palette,shades),null);
  assert.equal(applyMapPixels(map,patch({columns:2,x:127}),palette,shades),null);
});
test('reconnect full snapshots retain only the pixels actually received, not black fabricated coverage',()=>{
  const data=new Uint8Array(16384);data[500]=10;
  const coverage=new Uint8Array(2048);coverage[500>>3]=1<<(500&7);
  const map=applyMapPixels(null,patch({snapshot:true,columns:128,rows:128,x:0,y:0,data,coverage}),palette,shades);
  assert.equal(map.received,1);assert.equal(map.rgba[500*4+3],255);assert.equal(map.rgba[3],0);
  assert.equal(applyMapPixels(null,patch({snapshot:true}),palette,shades),null);
});
test('native map rotations use quarter turns even when the item-frame rotation has eight values',()=>{
  for(let r=0;r<8;r++)assert.equal(mapFramePose({position:{x:0,y:0,z:0},normal:[0,0,1],rotation:r}).angle,-(r%4)*Math.PI/2);
  for(const normal of [[0,0,1],[0,0,-1],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0]]) {
    const pose=mapFramePose({position:{x:0,y:0,z:0},normal,rotation:0});
    assert.ok(new Vector3(0,0,1).applyQuaternion(pose.rotation).distanceTo(new Vector3(...normal))<1e-6);
    assert.ok(new Vector3(0,1,0).applyQuaternion(pose.rotation).distanceTo(pose.up)<1e-6);
  }
  assert.equal(mapFramePose({position:{x:0,y:0,z:0},normal:[1,1,0],rotation:0}),null);
});
test('same-connection held maps require the actual map_id component, never item name or ImageFrame index',()=>{
  assert.equal(heldMapId({name:'filled_map',metadata:52}),null);
  assert.equal(heldMapId({name:'filled_map',components:[{type:'map_id',data:52}]}),52);
  assert.equal(heldMapId({name:'map',components:[{type:'map_id',data:52}]}),null);
});
test('renderer caches are bounded, stale-world patches rejected, textures released on reset',()=>{
  const photos=new MapPhotos({getWorld:()=>({scene:new Scene()})});photos.setAssets({mapColors:palette,shades});
  for(let id=0;id<80;id++)photos.handlePixels(patch({mapId:id}));
  assert.equal(photos.stats().maps,64);assert.equal(photos.stats().evicted,16);
  const map=photos.maps.get(79);let disposed=false;map.texture.addEventListener('dispose',()=>disposed=true);
  photos.reset(1);assert.equal(disposed,true);assert.equal(photos.stats().maps,0);
  assert.equal(photos.handlePixels(patch()),false);assert.equal(photos.handlePixels(patch({epoch:1})),true);photos.dispose();
});
