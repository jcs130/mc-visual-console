import test from 'node:test';
import assert from 'node:assert/strict';
import { renderedEntityPosition, installRenderedCameraFollow } from '../../src/modern-viewer/rendered-camera-follow.js';
import { EntityPositionTimeline } from '../../src/modern-viewer/entity-position-timeline.js';

test('camera and avatar share the same rendered sample before culling, with scene-origin offsets',()=>{
  const timeline=new EntityPositionTimeline(),root={position:{x:0,y:0,z:0}},origin={x:1000,y:64,z:-300};
  const draws=[],world={entities:{entities:{42:root}},sceneOrigin:{getWorldPosition:r=>({x:r.position.x+origin.x,y:r.position.y+origin.y,z:r.position.z+origin.z})},
    render(){draws.push({actor:renderedEntityPosition(this,42),camera:{...this.camera}});return 'drawn';}};
  const restore=installRenderedCameraFollow(world,()=>{world.camera=renderedEntityPosition(world,42);});
  for(let t=0;t<2000;t+=10){
    if(t%100===0)timeline.push({x:1000+t/250,y:64,z:-300},t);
    const p=timeline.sample(t);for(const k of ['x','y','z'])root.position[k]=p[k]-origin[k];
    assert.equal(world.render(),'drawn');
  }
  for(const d of draws)assert.deepEqual(d.actor,d.camera);
  assert.equal(renderedEntityPosition(world,999),null);
  root.position.x=NaN;assert.equal(renderedEntityPosition(world,42),null);
  restore();world.camera=null;world.render();assert.equal(world.camera,null);
});
