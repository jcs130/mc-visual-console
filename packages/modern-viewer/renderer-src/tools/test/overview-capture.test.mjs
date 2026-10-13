import test from 'node:test';
import assert from 'node:assert/strict';
import { overviewSpec, overviewCamera, overviewProject, overviewCoverage, captureOverview } from '../../src/modern-viewer/overview-capture.js';

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

test('bounds, marker count and labels reject oversized or ambiguous requests', () => {
  const spec=overviewSpec({}, {x:10,y:64,z:20},640,1080);
  assert.deepEqual(spec.center,[10,20]); close(spec.bounds.maxZ-spec.bounds.minZ,54);
  for (const input of [null,[],{center:[NaN,1]},{span:97},{grid:3},{markers:Array(9).fill({at:[0,1,2]})},
    {markers:[{at:[0,1,2],label:'bad\nlabel'}]},{center:[0,1],oops:true}])
    assert.throws(()=>overviewSpec(input,{x:0,z:0},1280,720));
});

test('failed photograph restores camera, world coordinates, fog and culling; no world requests', () => {
  const originalCamera={},fog={},pos={x:-16.5,y:64,z:-16.5},o=origin(-16.5,65.62,-16.5);
  const world={camera:originalCamera, cameraWorldPos:{...pos}, sceneOrigin:o,scene:{fog},reactiveDebugParams:{smartCull:true},
    worldSizeParams:{minY:-64,worldHeight:384},finishedChunks:{'-32,-32':true},renderer:{domElement:{}},render(){}};
  const document={createElement:()=>({getContext:()=>({drawImage(){throw new Error('readback failed');}})})};
  assert.throws(()=>captureOverview(world,{}, {position:pos,width:1280,height:720,document}),/readback failed/);
  assert.equal(world.camera,originalCamera);assert.deepEqual(world.cameraWorldPos,pos);
  assert.deepEqual([o.x,o.y,o.z],[-16.5,65.62,-16.5]);assert.equal(world.scene.fog,fog);
  assert.equal(world.reactiveDebugParams.smartCull,true);
});
