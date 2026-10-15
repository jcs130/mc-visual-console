import assert from 'node:assert/strict';
import test from 'node:test';
import { Scene, Mesh, InstancedMesh, InstancedBufferAttribute, BoxGeometry, ShaderMaterial, EqualDepth, MeshBasicMaterial, ShaderLib, PerspectiveCamera } from 'three';
import { createCutawayUniforms, patchCutawayMaterial, OBSTRUCTION_OPACITY } from '../../src/modern-viewer/room-visibility.js';
import { createObserverTransparency } from '../../src/modern-viewer/observer-transparency.js';
import {createNativeRoomVisibility} from '../../src/native-viewer/native-room-visibility.js';

function fixture() {
  const uniforms=createCutawayUniforms();uniforms.u_lanternReveal.value=1;
  const material=new ShaderMaterial({vertexShader:'void main() { vec3 relativePos = position; gl_Position=vec4(relativePos,1.0); }',
    fragmentShader:'out vec4 FragColor; void main() { FragColor=vec4(1.0); }',uniforms:{u_atlas:{value:{original:true}}}});
  patchCutawayMaterial(material,uniforms);
  const scene=new Scene(),source=new Mesh(new BoxGeometry(),material);
  scene.add(source);source.position.set(-1024,64,-2048);scene.updateMatrixWorld(true);
  let draws=0;source.onAfterRender=()=>draws++;
  const layer=createObserverTransparency({scene},uniforms);
  return {source,scene,uniforms,material,layer,draws:()=>draws};
}

test('obstructions blend their original texture at 35% opacity through a nearest-surface pass',()=>{
  const {source,scene,material,layer,draws}=fixture();layer.update();
  const depth=scene.getObjectByName('observer-obstruction-depth'),colour=scene.getObjectByName('observer-obstruction-colour');
  assert.equal(OBSTRUCTION_OPACITY,.35);
  assert.equal(material.transparent,false);assert.equal(material.depthWrite,true,'unrelated terrain keeps opaque depth');
  assert.equal(colour.geometry,source.geometry,'reuse native GPU geometry');
  assert.equal(colour.material.uniforms.u_atlas,material.uniforms.u_atlas,'reuse original textures and lighting updates');
  assert.equal(colour.material.uniforms.u_lanternTransparencyPass.value,1);
  assert.equal(colour.material.transparent,true);assert.equal(colour.material.depthWrite,false);
  assert.equal(colour.material.depthFunc,EqualDepth,'only the nearest faded obstruction contributes colour');
  assert.equal(depth.material.colorWrite,false);assert.equal(depth.material.depthWrite,true);
  assert.ok(depth.renderOrder<colour.renderOrder);
  colour.onAfterRender();depth.onAfterRender();assert.equal(draws(),2,'native visible span callbacks are preserved');
  assert.ok(colour.material.fragmentShader.includes('FragColor.a *= lanternSurfaceOpacity'));
  assert.ok(!colour.material.fragmentShader.includes('gl_FragCoord'),'true alpha, not screen-door dithering');
  layer.dispose();
});

test('movement, rebasing, zero reveal and unload reuse or remove overlays without disposing owned geometry',()=>{
  const {source,scene,uniforms,layer}=fixture();let geometryDisposed=0;
  source.geometry.addEventListener('dispose',()=>geometryDisposed++);layer.update();
  const colour=scene.getObjectByName('observer-obstruction-colour');
  for(let frame=0;frame<60;frame++){source.position.x=frame;scene.updateMatrixWorld(true);layer.sync();assert.equal(colour.matrixWorld.elements[12],frame);}
  layer.update();assert.equal(layer.diagnostics.surfaces,1);assert.equal(scene.children.length,3,'no per-frame clone growth');
  uniforms.u_lanternReveal.value=0;layer.sync();assert.equal(colour.visible,false);
  source.removeFromParent();layer.sync();assert.equal(colour.visible,false);layer.update();
  assert.equal(scene.children.length,0);assert.equal(geometryDisposed,0);layer.dispose();
});

test('offscreen terrain keeps original opaque surfaces and restores live translucency on success and failure',()=>{
  const {scene,uniforms,layer,material}=fixture();uniforms.u_lanternCutawayEnabled.value=2;layer.update();
  const overlays=scene.children.filter(mesh=>mesh.userData.lanternTransparencyOverlay);
  assert.equal(overlays.length,2);
  for(const fail of [false,true]){
    let draws=0;
    const draw=()=>{draws++;assert.equal(uniforms.u_lanternReveal.value,0);assert.equal(uniforms.u_lanternCutawayEnabled.value,0);
      assert.ok(overlays.every(mesh=>!mesh.visible));assert.equal(material.transparent,false);
      if(fail)throw Error('draw failed');return 'original terrain';};
    if(fail)assert.throws(()=>layer.withOpaqueTerrain(draw),/draw failed/);
    else assert.equal(layer.withOpaqueTerrain(draw),'original terrain');
    assert.equal(draws,1);assert.equal(uniforms.u_lanternReveal.value,1);assert.equal(uniforms.u_lanternCutawayEnabled.value,2);
    assert.ok(overlays.every(mesh=>mesh.visible));assert.equal(uniforms.u_lanternObstructionOpacity.value,.35);
  }
  layer.dispose();
});

test('standard decorations use a separate pass uniform while sky and unpatched actors are untouched',()=>{
  const scene=new Scene(),uniforms=createCutawayUniforms();uniforms.u_lanternReveal.value=1;
  const decoration=new Mesh(new BoxGeometry(),new MeshBasicMaterial());patchCutawayMaterial(decoration.material,uniforms);scene.add(decoration);
  const sky=new Mesh(new BoxGeometry(),new MeshBasicMaterial({depthTest:false}));scene.add(sky);
  const layer=createObserverTransparency({scene},uniforms);layer.update();assert.equal(layer.diagnostics.surfaces,1);
  const material=scene.getObjectByName('observer-obstruction-colour').material;
  const shader={uniforms:{},vertexShader:ShaderLib.basic.vertexShader,fragmentShader:ShaderLib.basic.fragmentShader};
  material.onBeforeCompile(shader,{});assert.equal(shader.uniforms.u_lanternTransparencyPass.value,1);assert.equal(uniforms.u_lanternTransparencyPass.value,0);
  assert.equal(sky.material.userData.lanternVisibilityVersion,undefined);
  layer.dispose();
});

test('native instanced terrain shares its actual instance buffers across both obstruction passes',()=>{
  const scene=new Scene(),room=createNativeRoomVisibility();room.attach(scene);
  const source=new InstancedMesh(new BoxGeometry(),new MeshBasicMaterial(),2);room.patch(source.material);scene.add(source);
  source.instanceColor=new InstancedBufferAttribute(new Float32Array([1,0,0,0,1,0]),3);
  let disposed=0;source.geometry.addEventListener('dispose',()=>disposed++);
  const snapshot={states:[],groups:[],revision:1,bounds:{minX:0,minY:63,minZ:0,maxX:15,maxY:68,maxZ:15},viewCoverage:{receivedColumns:['0,0']}};
  room.stage(snapshot);room.uniforms.u_lanternReveal.value=1;
  const overlays=scene.children.filter(mesh=>mesh.userData.lanternTransparencyOverlay);
  assert.equal(overlays.length,2);
  for(const mesh of overlays){assert.equal(mesh.instanceMatrix,source.instanceMatrix);assert.equal(mesh.instanceColor,source.instanceColor);assert.equal(mesh.geometry,source.geometry)}
  source.count=1;source.instanceColor=new InstancedBufferAttribute(new Float32Array([0,0,1]),3);
  room.update({camera:new PerspectiveCamera(),pose:{x:.5,y:64,z:.5},mode:'first',now:1});
  for(const mesh of overlays){assert.equal(mesh.count,1);assert.equal(mesh.instanceColor,source.instanceColor);assert.equal(mesh.visible,false)}
  source.removeFromParent();room.reset();assert.equal(scene.children.length,0);assert.equal(disposed,0);
  room.dispose();assert.equal(disposed,0);
});
