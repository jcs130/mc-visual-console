import test from 'node:test';
import assert from 'node:assert/strict';
import { overviewSpec, overviewPanels, overviewRegions, overviewCamera, overviewProject, overviewCoverage, overviewMarker, overviewLabelLayout, annotateOverview, captureOverview } from '../../src/modern-viewer/overview-capture.js';

function origin(x, y, z) {
  return { x, y, z, update(a, b, c) { this.x=a; this.y=b; this.z=c; },
    toSceneX(v) { return v-this.x; }, toSceneY(v) { return v-this.y; }, toSceneZ(v) { return v-this.z; } };
}
const close = (a, b) => assert.ok(Math.abs(a-b) < 1e-6, `${a} != ${b}`);

test('overhead projection shares camera coordinates, stays north up across negative and rebased worlds', () => {
  for (const [x,z] of [[-545,-436], [29_999_950, -29_999_950], [0,0]]) {
    const spec = overviewSpec({ center:[x,z], span:32 }, null, 1280,720);
    for (const o of [origin(0,0,0), origin(x+5, 327,z-3)]) {
      const { camera } = overviewCamera(spec,o,-64,320);
      for (const y of [0,64,200]) {
        const center = overviewProject([x,y,z],camera,o,1280,720);
        close(center.pixel[0],640); close(center.pixel[1],360); assert.equal(center.inFrame,true);
        close(overviewProject([x+1,y,z-1],camera,o,1280,720).pixel[0],680);
        close(overviewProject([x+1,y,z-1],camera,o,1280,720).pixel[1],320);
      }
      assert.equal(overviewProject([x+100,64,z],camera,o,1280,720).inFrame,false);
    }
  }
});

test('negative chunk boundaries and missing coverage are explicit, not fabricated air', () => {
  const coverage = overviewCoverage({minX:-32,maxX:0,minZ:-16,maxZ:16},{'-32,-16':true,'-16,0':true});
  assert.deepEqual(coverage,{total:4,meshed:2,missing:[[-32,0],[-16,-16]]});
});

test('block pins land at cell centers; continuous positions, including integers, are never shifted', () => {
  for (const [x,z] of [[-545,-436], [29_999_950,-29_999_950], [0,0]]) {
    const spec=overviewSpec({center:[x,z],span:16,grid:1},null,1280,720), o=origin(x+7,70,z-3);
    const {camera}=overviewCamera(spec,o,-64,320);
    const project=at=>overviewProject(at,camera,o,1280,720);
    const cell=overviewMarker({at:[x,64,z]},0,project);
    assert.deepEqual(cell.at,[x,64,z]); assert.deepEqual(cell.world,[x+.5,64.5,z+.5]);
    close(cell.pixel[0],680); close(cell.pixel[1],400);
    const corner=overviewMarker({at:[x,64,z],anchor:'position'},1,project);
    assert.deepEqual(corner.world,corner.at);close(corner.pixel[0],640);close(corner.pixel[1],360);
    const exact=overviewMarker({at:[x+.25,64,z-.75],anchor:'position'},2,project);
    assert.deepEqual(exact.world,exact.at);close(exact.pixel[0],660);close(exact.pixel[1],300);
  }
});

test('bounds, marker count and labels reject oversized or ambiguous requests', () => {
  const spec=overviewSpec({}, {x:10,y:64,z:20},640,1080);
  assert.deepEqual(spec.center,[10,20]); close(spec.bounds.maxZ-spec.bounds.minZ,54);
  for (const input of [null,[],{center:null},{span:null},{grid:null},{labels:null},{markers:null},{center:[NaN,1]},{span:2049},{grid:1.5},{grid:'dense'},{labels:'all'},{markers:Array(129).fill({at:[0,1,2]})},
    {markers:[{at:[.5,1,2]}]},{markers:[{at:[0,1,2],anchor:'corner'}]},
    {markers:[{at:[0,1,2],label:'bad\nlabel'}]},{center:[0,1],oops:true}])
    assert.throws(()=>overviewSpec(input,{x:0,z:0},1280,720));
});

test('large cameras use adaptive grids and retain all 128 markers, without loading terrain', () => {
  const markers=Array.from({length:128},(_,i)=>({at:[-i,64,i],label:`target ${i}`}));
  for (const [span,grid] of [[8,1],[32,4],[128,16],[512,64],[2048,256]]) {
    const spec=overviewSpec({span,markers},{x:0,z:0},1280,720);
    assert.equal(spec.grid,grid);assert.equal(spec.markers.length,128);
  }
  assert.equal(overviewSpec({span:512,grid:3},{x:0,z:0},1280,720).grid,3);
  assert.equal(overviewSpec({grid:0},{x:0,z:0},1280,720).grid,0);
  assert.doesNotThrow(()=>overviewSpec({markers:[{at:[-.2,64,.7],anchor:'position'}]},{x:0,z:0},1280,720));
});

test('dense labels remain disjoint and on-screen, with hidden-label counts and stable point IDs', () => {
  const spec=overviewSpec({span:128},{x:0,z:0},1280,720);
  const pins=Array.from({length:128},(_,i)=>({id:`P${i+1}`,anchor:'block',at:[i,64,-i],pixel:[100+i%16*69,100+Math.floor(i/16)*65],inFrame:true}));
  const layout=overviewLabelLayout(spec,pins,null,text=>text.length*8);
  assert.equal(layout.mode,'ids');assert.equal(layout.shown+layout.hidden,128);assert.ok(layout.shown>32);
  const rects=layout.placed;
  for(let i=0;i<rects.length;i++) {
    const a=rects[i];assert.equal(a.text,`点${a.id.slice(1)}`);assert.ok(a.x>=82&&a.x+a.w<=1277&&a.y>=64&&a.y+a.h<=685);
    for(const b of rects.slice(i+1)) assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y);
  }
  const coincident=pins.map(pin=>({...pin,pixel:[400,400]}));
  assert.ok(overviewLabelLayout(spec,coincident,null,text=>text.length*8).hidden>100);
  assert.equal(coincident.length,128);
  const full=overviewLabelLayout({...spec,labels:'full'},pins.slice(0,1),null,text=>text.length*8);
  assert.match(full.placed[0].text,/\[0,64,0\]/);
});

test('large unmeshed regions use one clipped hatch pass instead of one per chunk', () => {
  let clips=0,strokes=0;
  const spec=overviewSpec({span:2048,grid:0},{x:0,z:0},1280,720);
  const coverage=overviewCoverage(spec.bounds,{'0,0':true});
  const ctx={canvas:{width:1280,height:720},save(){},restore(){},beginPath(){},rect(){},clip(){clips++;},
    fillRect(){},stroke(){strokes++;},moveTo(){},lineTo(){},fillText(){},measureText:text=>({width:text.length*8})};
  const project=at=>({pixel:[(at[0]-spec.bounds.minX)*1280/2048,(at[2]-spec.bounds.minZ)*1280/2048]});
  annotateOverview(ctx,spec,project,coverage,[],null,null);
  assert.equal(clips,1);assert.ok(coverage.missing.length>8000);assert.ok(strokes<200);
});

test('failed photograph restores camera, world coordinates, fog and culling; no world requests', () => {
  const originalCamera={},fog={},pos={x:-16.5,y:64,z:-16.5},o=origin(-16.5,65.62,-16.5);
  const world={camera:originalCamera, cameraWorldPos:{...pos}, sceneOrigin:o,scene:{fog},reactiveDebugParams:{smartCull:true},
    worldSizeParams:{minY:-64,worldHeight:384},finishedChunks:{'-32,-32':true},renderer:{domElement:{}},render(){}};
  const document={createElement:()=>({getContext:()=>({fillRect(){},drawImage(){throw new Error('readback failed');}})})};
  assert.throws(()=>captureOverview(world,{}, {position:pos,width:1280,height:720,document,mask:f=>({...f,perception:{current:0}})}),/readback failed/);
  assert.equal(world.camera,originalCamera);assert.deepEqual(world.cameraWorldPos,pos);
  assert.deepEqual([o.x,o.y,o.z],[-16.5,65.62,-16.5]);assert.equal(world.scene.fog,fog);
  assert.equal(world.reactiveDebugParams.smartCull,true);
});

test('attention panels preserve absolute coordinates and detail magnifies the same negative-coordinate region', () => {
  const spec=overviewSpec({center:[-541.5,-439.5],span:48,attention:{regions:[{bounds:[-545,-443,-538,-436],label:'uncertain passage'}]}},null,1280,720);
  const [main,detail]=overviewPanels(spec),o=origin(-541,330,-440);
  assert.equal(main.viewport.width+detail.viewport.width+12,1280);assert.equal(detail.viewport.x,main.viewport.width+12);
  const p=[-541.5,67,-439.5];
  for(const panel of [main,detail]) {
    const {camera}=overviewCamera(panel.spec,o,-64,320);
    const projected=overviewProject(p,camera,o,panel.viewport.width,panel.viewport.height);
    close(projected.pixel[0],panel.viewport.width/2);close(projected.pixel[1],panel.viewport.height/2);
    const area=overviewRegions(panel.spec)[0];assert.equal(area.clipped,false);assert.equal(area.inFrame,true);
    close(area.rect.width,7*panel.spec.width/panel.spec.span);
  }
  assert.ok(detail.spec.width/detail.spec.span > main.spec.width/main.spec.span);
  assert.equal(overviewPanels({...spec,attention:{...spec.attention,detail:0}}).length,1);
});

test('outside or partially visible attention stays explicit; a detail view can contain only unknown chunks', () => {
  const spec=overviewSpec({center:[0,0],span:32,attention:{detail:2,regions:[{bounds:[14,-2,20,2]},{bounds:[100,100,104,104]}]}},null,1280,720);
  const [main,detail]=overviewPanels(spec),[partial,outside]=overviewRegions(main.spec);
  assert.equal(partial.clipped,true);assert.equal(partial.inFrame,true);assert.equal(outside.inFrame,false);
  close(partial.rect.width,2*main.spec.width/32);
  assert.equal(detail.id,'A2');assert.equal(overviewCoverage(detail.spec.bounds,{'0,0':true}).meshed,0);
  for(const attention of [null,[],{}, {regions:[]},{regions:Array(33).fill({bounds:[0,0,1,1]})},
    {regions:[{bounds:[2,0,1,2]}]},{regions:[{bounds:[0,0,2049,1]}]},{regions:[{bounds:[0,0,1,1],score:1}]},
    {regions:[{bounds:[0,0,1,1]}],detail:2},{regions:[{bounds:[0,0,1,1]}],detail:NaN}])
    assert.throws(()=>overviewSpec({attention},{x:0,z:0},1280,720),/attention/);
});

test('failure during the second render restores the original camera and render hook', () => {
  const camera={},fog={},pos={x:8,y:64,z:8},o=origin(8,66,8);let passes=0;
  const render=()=>{};
  const world={camera,cameraWorldPos:{...pos},sceneOrigin:o,scene:{fog},reactiveDebugParams:{smartCull:true},
    worldSizeParams:{minY:-64,worldHeight:384},finishedChunks:{'0,0':true},renderer:{domElement:{},render},
    render(){if(++passes===2)throw Error('second panel failed');}};
  const document={createElement(){const canvas={width:0,height:0};canvas.getContext=()=>new Proxy({canvas,measureText:text=>({width:text.length*8})},{get:(obj,key)=>key in obj?obj[key]:(()=>{})});return canvas;}};
  assert.throws(()=>captureOverview(world,{attention:{regions:[{bounds:[6,6,10,10]}]}},{position:pos,width:1280,height:720,document,mask:f=>({...f,perception:{current:0}})}),/second panel failed/);
  assert.equal(world.camera,camera);assert.equal(world.renderer.render,render);assert.deepEqual(world.cameraWorldPos,pos);
  assert.deepEqual([o.x,o.y,o.z],[8,66,8]);assert.equal(world.scene.fog,fog);assert.equal(world.reactiveDebugParams.smartCull,true);assert.equal(passes,3);
});
