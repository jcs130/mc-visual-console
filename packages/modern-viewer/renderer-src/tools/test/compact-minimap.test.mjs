import test from 'node:test';
import assert from 'node:assert/strict';
import {Document} from './fixtures/native-console-dom.mjs';
import {installSceneMinimap,drawCompactMap,mapSpec,mapPixel} from '../../src/modern-viewer/scene-minimap.js';
import {installRenderedCameraFollow} from '../../src/modern-viewer/rendered-camera-follow.js';

const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(t,{asyncRead=false}={}) {
  let time=10000;
  t.mock.method(performance,'now',()=>time);
  const document=new Document(),make=document.createElement.bind(document),contexts=[];
  document.createElement=tag=>{
    const el=make(tag);
    if(tag==='canvas'){
      const calls=[],ctx={canvas:el,calls,createImageData:(w,h)=>({data:new Uint8Array(w*h*4)})};
      for(const name of ['clearRect','putImageData','save','restore','beginPath','rect','clip','fillRect',
        'moveTo','lineTo','stroke','drawImage','translate','rotate','closePath','fill'])ctx[name]=(...args)=>calls.push({name,args});
      el.getContext=()=>ctx;contexts.push(ctx);
    }
    return el;
  };
  const root=document.createElement('aside');root.getClientRects=()=>[{}];
  const canvas=document.createElement('canvas'),caption=document.createElement('div');
  caption.setAttribute('data-map-caption','');root.append(canvas,caption);document.body.append(root);
  let ticks,cleared=0;
  const window={setInterval(fn){ticks=fn;return 1;},clearInterval(){cleared++;}};
  const state={connected:true,dimension:'minecraft:overworld',entity:{id:1,pos:{x:8,y:64,z:8},yaw:0}};
  const origin={x:0,y:0,z:0,update(x,y,z){Object.assign(this,{x,y,z});},
    toSceneX(x){return x-this.x;},toSceneY(y){return y-this.y;},toSceneZ(z){return z-this.z;}};
  const reads=[];let renders=0;
  const renderer={render(){},autoClear:true,getRenderTarget:()=>null,setRenderTarget(){},getViewport:v=>v,getScissor:v=>v,
    getScissorTest:()=>false,setScissor(){},setViewport(){},setScissorTest(){},readRenderTargetPixels(_target,_x,_y,_w,_h,bytes){bytes.fill(150);}};
  if(asyncRead)renderer.readRenderTargetPixelsAsync=(_target,_x,_y,_w,_h,bytes)=>new Promise((yes,no)=>reads.push({yes:()=>{bytes.fill(150);yes();},no}));
  const finishedChunks={};for(let x=-32;x<=32;x+=16)for(let z=-32;z<=32;z+=16)finishedChunks[`${x},${z}`]=true;
  const world={renderer,camera:{},sceneOrigin:origin,cameraWorldPos:{x:8,y:64,z:8},scene:{fog:null},
    finishedChunks,worldSizeParams:{minY:-64,worldHeight:384},reactiveDebugParams:{smartCull:true},render(){renders++;}};
  let visible=true;
  const map=installSceneMinimap({document,window,root,getWorld:()=>world,getState:()=>state,
    getSight:()=>({top:()=>64,snapshot(){throw Error('A navigation map must not run the old visibility/history mask');}}),visible:()=>visible});
  t.after(()=>map.dispose());
  return {map,root,canvas,caption,document,state,world,reads,contexts,tick:()=>ticks(),setTime:value=>{time=value;},
    visible:value=>{visible=value;},renders:()=>renders,cleared:()=>cleared};
}

test('received terrain is shown without the old perception mask or analysis controls',async t=>{
  const h=fixture(t);h.map.draw();await settle();
  assert.equal(h.map.diagnostics().source,'loaded-scene');assert.equal(h.map.diagnostics().markers,1);
  assert.equal(h.canvas.width,256);assert.equal(h.canvas.height,256);
  assert.equal(h.root.querySelectorAll('button').length,2);assert.equal(h.root.querySelector('select'),null);
  for(const cls of ['corti-map-risk','corti-map-legend','corti-map-hearing','corti-map-detail'])assert.equal(h.root.querySelector('.'+cls),null);
  assert.equal(h.caption.textContent,'8, 64, 8');
  assert.ok(h.contexts[0].calls.some(c=>c.name==='drawImage'&&c.args[0]===h.contexts[1].canvas));
  assert.equal(h.renders(),1,'one offscreen pass, no duplicate live-scene draw');
});

test('the player stays centered while true terrain positions shift, with unloaded columns hatched',t=>{
  const h=fixture(t),ctx=h.contexts[0],frame={canvas:{terrain:true},spec:mapSpec({x:-10,z:-20},48,256),coverage:{missing:[[-32,-32]]}};
  const self={pos:{x:-9,y:64,z:-22},yaw:Math.PI/2};
  const result=drawCompactMap(ctx,frame,self);
  assert.deepEqual(result.center,[-9,-22]);assert.deepEqual(result.terrainOffset,[-256/48,2*256/48]);
  assert.deepEqual(ctx.calls.find(c=>c.name==='drawImage').args,[frame.canvas,-256/48,2*256/48,256,256]);
  assert.deepEqual(ctx.calls.find(c=>c.name==='translate').args,[128,128]);
  assert.ok(Math.abs(ctx.calls.find(c=>c.name==='rotate').args[0]+Math.PI/2)<1e-9);
  assert.deepEqual(ctx.calls.filter(c=>c.name==='rect')[1].args,[...mapPixel({x:-32,z:-32},mapSpec(self.pos,48,256)),16*256/48,16*256/48]);
});

test('an old GPU frame cannot reappear after a dimension change',async t=>{
  const h=fixture(t,{asyncRead:true});h.map.draw();assert.equal(h.reads.length,1);
  h.state.dimension='minecraft:the_nether';h.map.draw();h.reads[0].yes();await settle();
  assert.equal(h.map.diagnostics().source,'unavailable');
  assert.equal(h.contexts[0].calls.filter(c=>c.name==='drawImage').length,0);
  h.setTime(12000);h.map.draw();assert.equal(h.reads.length,2);h.reads[1].yes();await settle();
  assert.equal(h.map.diagnostics().source,'loaded-scene');assert.match(h.caption.title,/下界/);
});

test('hidden panels skip work, disconnected sessions clear the previous terrain',async t=>{
  const h=fixture(t);h.document.hidden=true;h.map.draw();assert.equal(h.renders(),0);
  h.document.hidden=false;h.visible(false);h.map.draw();assert.equal(h.renders(),0);
  h.visible(true);h.map.draw();await settle();assert.equal(h.renders(),1);
  h.state.connected=false;h.tick();assert.equal(h.map.diagnostics().source,'unavailable');
  assert.equal(h.root.dataset.mapSource,'unavailable');assert.equal(h.caption.textContent,'地图同步中');
});

test('failed readback expires old terrain instead of presenting it as current',async t=>{
  const h=fixture(t,{asyncRead:true});h.map.draw();h.reads[0].yes();await settle();
  assert.equal(h.map.diagnostics().source,'loaded-scene');
  h.setTime(16000);h.map.draw();assert.equal(h.map.diagnostics().source,'unavailable');
  h.reads[1].no(Error('GPU unavailable'));await settle();h.tick();
  assert.equal(h.map.diagnostics().failures,1);assert.equal(h.caption.textContent,'地图暂不可用');
  assert.equal(h.root.dataset.mapReason,'GPU unavailable');
});

test('disposing the map withdraws its timer and ignores pending GPU completion',async t=>{
  const h=fixture(t,{asyncRead:true});h.map.draw();h.map.dispose();h.map.dispose();
  h.reads[0].yes();await settle();h.tick();
  assert.equal(h.cleared(),1);assert.equal(h.contexts[0].calls.filter(c=>c.name==='drawImage').length,0);
  assert.equal(h.root.querySelector('.corti-map-header'),null);assert.equal(h.renders(),1);
});

test('live-avatar following cannot overwrite the minimap camera during its offscreen pass',async t=>{
  const h=fixture(t);let followed=0;
  const restore=installRenderedCameraFollow(h.world,()=>{
    followed++;Object.assign(h.world.cameraWorldPos,{x:999,y:10,z:999});
  });
  t.after(restore);h.map.draw();await settle();
  assert.equal(followed,0);assert.equal(h.map.diagnostics().source,'loaded-scene');
  assert.deepEqual(h.world.cameraWorldPos,{x:8,y:64,z:8});
  h.world.render();assert.equal(followed,1,'the ordinary live camera still follows normally');
});

test('underground coordinates keep a clearly labelled surface map without clipping away solid terrain',async t=>{
  const h=fixture(t);h.state.entity.pos.y=-31;h.map.draw();await settle();
  assert.equal(h.root.querySelector('strong').textContent,'地表地图');
  assert.equal(h.map.diagnostics().layer,null);assert.equal(h.caption.textContent,'8, -31, 8');
  assert.match(h.caption.title,/地表俯视，坐标高度为本人高度/);
});
