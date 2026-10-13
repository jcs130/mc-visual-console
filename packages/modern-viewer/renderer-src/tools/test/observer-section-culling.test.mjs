import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { installObserverSectionCulling } from '../../src/modern-viewer/observer-section-culling.js';
const require = createRequire(import.meta.url);
const compiled = await build({entryPoints:[require.resolve('minecraft-renderer/src/three/occlusion/sectionOcclusionCull.ts')],bundle:true,write:false,platform:'node',format:'esm'});
const { SectionOcclusionCull } = await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const open = 2**36-1;
function fixture() {
  const cull = new SectionOcclusionCull();
  let room = {x:33,y:2,z:1}, dirty=0;
  const manager={sectionOcclusionCull:cull,markCullDirty(){dirty++},updateCullDirtyFromCamera(){}};
  const controller=installObserverSectionCulling(manager,()=>room);
  for(const [x,mask] of [[0,open],[16,0],[32,open],[48,0],[64,open]])cull.registerSection(`${x},0,0`,mask,x,0,0);
  const params={smartCull:true,cameraWorldX:1,cameraWorldY:2,cameraWorldZ:1,viewDistance:6,sectionHeight:16,worldMinY:0,worldMaxY:256};
  return {cull,manager,controller,params,setRoom:p=>room=p,getDirty:()=>dirty};
}
test('observer camera and revealed room survive, further sealed terrain does not draw',()=>{
  const {cull,params,controller}=fixture();
  const visible=cull.update(params);
  assert.deepEqual([...visible].sort(),['0,0,0','16,0,0','32,0,0','48,0,0']);
  assert.equal(cull.isSectionVisible('64,0,0'),false);
  assert.equal(cull.isSectionVisible('32,0,0'),true);
  assert.equal(cull.isSectionVisible('unknown'),true,'unmeshed is not proof of occlusion');
  for(let i=0;i<60;i++)assert.equal(cull.update({...params,cameraWorldX:1+i/100}),visible);
  assert.equal(controller.diagnostics.rebuilds,1,'no second BFS per rendered frame');
});
test('opening a wall, moving the observed room and disabling culling restore matching draw spans',()=>{
  const {cull,manager,params,setRoom,getDirty}=fixture();
  cull.update(params);
  cull.registerSection('48,0,0',open,48,0,0);
  assert.equal(cull.update(params).has('64,0,0'),true);
  cull.registerSection('48,0,0',0,48,0,0);
  assert.equal(cull.update(params).has('64,0,0'),false);
  setRoom(null);manager.updateCullDirtyFromCamera();
  assert.equal(cull.update(params).has('32,0,0'),false);
  assert.equal(cull.update({...params,smartCull:false}).has('64,0,0'),true,'minimap and overview own their complete pass');
  setRoom({x:65,y:2,z:1});manager.updateCullDirtyFromCamera();
  assert.ok(getDirty()>0); assert.equal(cull.update(params).has('64,0,0'),true);
});
test('removing an observed section, changing distance and disposal invalidate cached room visibility',()=>{
  const {cull,params,controller}=fixture();
  cull.update(params);cull.update({...params,viewDistance:7});assert.equal(controller.diagnostics.rebuilds,2);
  cull.unregisterSection('32,0,0');assert.equal(cull.update(params).has('32,0,0'),false);
  controller.dispose();assert.equal(cull.update(params).has('64,0,0'),false);
});
