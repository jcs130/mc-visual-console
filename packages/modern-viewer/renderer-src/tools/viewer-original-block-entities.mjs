import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {bakeFaces} from '../src/native-viewer/model-loader.js';
import {ORIGINAL_MODEL_LAYERS_SHA256} from '../src/native-viewer/native-original-model-layers.js';
import {UNSUPPORTED_POT_PATTERN} from '../src/modern-viewer/special-block-materials.js';

// CPU-baked polygons from the original, hash-verified 1.21.1 client. Particle-only
// JSON models are not the visible geometry of these BlockEntityRenderers.
export async function withOriginalBlockEntityModels(source, version) {
  if (version !== '1.21.1') return source;
  const bytes = await fs.readFile(new URL('../../asset-packs/vanilla-1.21.1/assets/minecraft/native/client-model-layers.json', import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== ORIGINAL_MODEL_LAYERS_SHA256) throw Error('ORIGINAL_BLOCK_ENTITY_SOURCE_MISMATCH');
  return addOriginalBlockEntityModels(source, JSON.parse(bytes));
}

export function originalLayerBlockModel(original, layerKey, texture, transform = new THREE.Matrix4()) {
  const layer = original.layers[layerKey];
  if (!layer) throw Error('ORIGINAL_BLOCK_ENTITY_LAYER_MISSING');
  const matrices = new Map(), elements = [];
  for (const part of layer.parts) {
    const parent = part.parent ? matrices.get(part.parent) : transform;
    if (!parent) throw Error('ORIGINAL_BLOCK_ENTITY_PARENT_MISSING');
    const matrix = parent.clone().multiply(new THREE.Matrix4().compose(
      new THREE.Vector3(...part.pivot), new THREE.Quaternion().setFromEuler(new THREE.Euler(...part.rotationZYX, 'ZYX')),
      new THREE.Vector3(...part.scale)));
    matrices.set(part.path, matrix);
    if (!part.visible || part.skipDraw) continue;
    for (const polygon of part.polygons) {
      const points = Array.from({length:4}, (_,i) => new THREE.Vector3(...polygon.positions.slice(i*3,i*3+3)).applyMatrix4(matrix).toArray().map(round));
      // Original ModelPart includes zero-area cube faces. They render no pixels.
      if (new THREE.Vector3(...points[1]).sub(new THREE.Vector3(...points[0])).cross(new THREE.Vector3(...points[2]).sub(new THREE.Vector3(...points[0]))).lengthSq() < 1e-12) continue;
      const normal = new THREE.Vector3(...polygon.normal).transformDirection(matrix).toArray().map(round);
      const axis = normal.findIndex(v => Math.abs(v) > .99999);
      if (axis < 0) throw Error('ORIGINAL_BLOCK_ENTITY_NON_AXIAL_FACE');
      const direction = [['west','east'],['down','up'],['north','south']][axis][normal[axis] > 0 ? 1 : 0];
      const from = [0,1,2].map(i => Math.min(...points.map(p=>p[i]))), to = [0,1,2].map(i=>Math.max(...points.map(p=>p[i])));
      const us = polygon.uv.filter((_,i)=>i%2===0).map(v=>v*16), vs=polygon.uv.filter((_,i)=>i%2===1).map(v=>v*16);
      let matched;
      for (const flipU of [false,true]) for (const flipV of [false,true]) for (const rotation of [0,90,180,270]) {
        const u=[Math.min(...us),Math.max(...us)],v=[Math.min(...vs),Math.max(...vs)];
        if(flipU)u.reverse();if(flipV)v.reverse();
        const face={texture:'#original',uv:[u[0],v[0],u[1],v[1]],...(rotation?{rotation}:{})};
        const element={from,to,faces:{[direction]:face}};
        const baked=bakeFaces({textures:{original:texture},elements:[element]})[0];
        if (Array.from({length:4},(_,i)=>i).every(i=> {
          const p=baked.position.slice(i*3,i*3+3).map(v=>(v+.5)*16);
          const index=points.findIndex(q=>q.every((v,j)=>Math.abs(v-p[j])<1e-5));
          return index>=0 && Math.abs(baked.uv[i*2]-polygon.uv[index*2])<1e-6 && Math.abs(1-baked.uv[i*2+1]-polygon.uv[index*2+1])<1e-6;
        })) matched ??= element;
      }
      if (!matched) throw Error('ORIGINAL_BLOCK_ENTITY_UV_UNREPRESENTABLE');
      elements.push(matched);
    }
  }
  return {textures:{original:texture},elements};
}
const round = v=>Math.round(v*1e5)/1e5;

export function addOriginalBlockEntityModels(source, original) {
  const models={...source.models.latest},states={...source.blockstates.latest};
  const register=(name,model)=>{const key=`block/viewer/original/${name}`;models[key]=model;return key;};
  for (const [name,layer,texture] of [
    ['skeleton_skull','skeleton_skull','skeleton/skeleton'],
    ['wither_skeleton_skull','wither_skeleton_skull','skeleton/wither_skeleton'],
    ['zombie_head','zombie_head','zombie/zombie'],['creeper_head','creeper_head','creeper/creeper'],
  ]) {
    if (!states[name]) continue;
    const transform=new THREE.Matrix4().makeTranslation(8,0,8).multiply(new THREE.Matrix4().makeScale(-1,-1,1));
    const model=originalLayerBlockModel(original,`minecraft:${layer}#main`,`block/entity/${texture}`,transform);
    const key=register(name,model);
    states[name]={variants:Object.fromEntries(Array.from({length:16},(_,rotation)=>[`rotation=${rotation}`,{model:key,...(rotation?{y:rotation*22.5}:{})}]))};
    const wallName=name.replace(/_(skull|head)$/,'_wall_$1');
    const wall=register(wallName,{...model,elements:model.elements.map(e=>({...e,from:[e.from[0],e.from[1]+4,e.from[2]+4],to:[e.to[0],e.to[1]+4,e.to[2]+4]}))});
    states[wallName]={variants:Object.fromEntries([['north',0],['east',90],['south',180],['west',270]].map(([facing,y])=>[`facing=${facing}`,{model:wall,...(y?{y}:{})}]))};
  }
  if (states.decorated_pot) {
    const base=originalLayerBlockModel(original,'minecraft:decorated_pot_base#main','block/entity/decorated_pot/decorated_pot_base');
    const sides=originalLayerBlockModel(original,'minecraft:decorated_pot_sides#main','block/entity/decorated_pot/decorated_pot_side');
    const key=register('decorated_pot',{textures:{base:base.textures.original,side:sides.textures.original},elements:[
      ...base.elements.map(e=>replaceTexture(e,'#base')),...sides.elements.map(e=>replaceTexture(e,'#side'))]});
    states.decorated_pot={variants:Object.fromEntries([['north',0],['east',90],['south',180],['west',270]].map(([facing,y])=>[`facing=${facing}`,{model:key,...(y?{y}:{})}]))};
    states[UNSUPPORTED_POT_PATTERN]={variants:{'':{model:'block/__viewer_missing_material'}}};
  }
  return {...source,models:{...source.models,latest:models},blockstates:{...source.blockstates,latest:states}};
}
const replaceTexture=(e,texture)=>({...e,faces:Object.fromEntries(Object.entries(e.faces).map(([k,v])=>[k,{...v,texture}]))});
