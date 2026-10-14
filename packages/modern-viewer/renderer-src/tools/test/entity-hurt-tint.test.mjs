import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group,Mesh,BoxGeometry,MeshBasicMaterial,ShaderMaterial} from 'three';
import {tintEntityDamage} from '../../src/modern-viewer/entity-hurt-tint.js';
test('overlapping damage returns to the original material without cloning red or leaking each event',()=>{
  const root=new Group(),original=new MeshBasicMaterial({color:0xabcdef}),other=new Mesh(new BoxGeometry(),original);
  const skin=new Mesh(new BoxGeometry(),original),shader=new ShaderMaterial();root.add(skin,new Mesh(new BoxGeometry(),shader));
  const tweens=[];class Tween{constructor(color){this.color=color;tweens.push(this);}to(target){this.target=target;return this;}onComplete(fn){this.done=fn;return this;}start(){return this;}stop(){this.stopped=true;}}
  tintEntityDamage(root,Tween);const tinted=skin.material;let disposed=0;tinted.addEventListener('dispose',()=>disposed++);
  for(let i=0;i<20;i++){tinted.color.set(0xaa2222);tintEntityDamage(root,Tween);assert.equal(skin.material,tinted);}
  assert.ok(tweens.slice(0,-1).every(t=>t.stopped));assert.equal(other.material.color.getHex(),0xabcdef);
  assert.equal(tweens.at(-1).target.getHex(),0xabcdef);tweens.at(-1).done();
  assert.equal(skin.material,original);assert.equal(disposed,1);
});
