import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRoomCap, originalCubeTop } from '../../src/modern-viewer/room-cutaway-cap.js';
const texture = { u: .1, v: .2, su: .01, sv: .01 };
const cube = { elements: [{ from: [0,0,0], to: [16,16,16], faces: { up: { texture } } }] };
const provider = { getAllResolvedModels0_1: () => [[cube]] };
const block = { name: 'stone', stateId: 1, getProperties: () => ({}) };
test('solid cut surfaces use exact full-cube model UV and reject unavailable/partial models', () => {
  assert.equal(originalCubeTop(provider, block), texture);
  assert.equal(originalCubeTop({getAllResolvedModels0_1:()=>[]},block),null);
  assert.equal(originalCubeTop({getAllResolvedModels0_1:()=>[[{elements:[{...cube.elements[0],to:[16,8,16]}]}]]},block),null);
  assert.equal(originalCubeTop({getAllResolvedModels0_1:()=>[[{...cube,x:90}]]},block),null);
});
test('negative-coordinate solid interiors close, air and unmeasured space remain open', () => {
  const cap = buildRoomCap({cache:{isOpaqueFullBlock:(x,y,z)=>x===-3&&y===64&&z===-4,blockAt:()=>block},provider,
    center:{x:-2.5,y:64,z:-3.5},camera:{x:-3,y:70,z:3},radius:2});
  assert.equal(cap.faces,1);
  assert.equal(cap.positions.length,18);
  assert.equal(cap.positions[0],0);
  assert.ok(Math.abs(cap.positions[1]-.06)<1e-10);
  assert.deepEqual(cap.origin,{x:-3,y:64,z:-4});
  assert.deepEqual(cap.uvs.slice(0,2),[texture.u,texture.v]);
});

test('a floating roof cannot create an invented foot-level floor',()=>{
  const cap=buildRoomCap({cache:{isOpaqueFullBlock:(_x,y)=>y===65,blockAt:()=>block},provider,
    center:{x:0,y:64,z:0},radius:2});
  assert.equal(cap.faces,0,'air below the ceiling remains actual air');
});

test('a projected foreground cut closes the measured foot-level stone even when the head-level cell is air',()=>{
  const mask={contains:()=>true,floorYAt:()=>64};
  const cap=buildRoomCap({cache:{isOpaqueFullBlock:(x,y,z)=>x===-3&&y===64&&z===-4,blockAt:()=>block},provider,
    center:{x:-2.5,y:64,z:-3.5},camera:{x:-3,y:80,z:12},floorMask:mask,radius:2});
  assert.equal(cap.faces,1,'select the final projected cut height before checking the intersected block');
  assert.ok(Math.abs(cap.positions[1]-.06)<1e-10);
});

test('lower connected steps cannot move the solid closing surface below the globally protected foot plane',()=>{
  const mask={contains:()=>true,floorYAt:()=>60};
  const cap=buildRoomCap({cache:{isOpaqueFullBlock:(x,y,z)=>x===-3&&y===64&&z===-4,blockAt:()=>block},provider,
    center:{x:-2.5,y:64,z:-3.5},camera:{x:-3,y:80,z:12},floorMask:mask,radius:2});
  assert.equal(cap.faces,1);
  assert.ok(Math.abs(cap.positions[1]-.06)<1e-10,'match the shader foot plane instead of exposing the lower interior');
});
