import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createCanvas} from 'canvas';
import {originalArmorTextures} from '../viewer-armor-textures.mjs';
import {installOriginalArmorTextures} from '../../src/modern-viewer/armor-textures.js';

test('exact legacy and modern original armor textures populate the same renderer contract, including copper',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'original-armor-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const png=createCanvas(64,32).toBuffer('image/png');
 for(const [v,files]of [['1.21.1',['models/armor/leather_layer_1.png','models/armor/gold_layer_2.png']],
  ['1.21.11',['entity/equipment/humanoid/copper.png','entity/equipment/humanoid_leggings/copper.png','entity/equipment/humanoid/gold.png','entity/equipment/humanoid/turtle_scute.png','entity/equipment/humanoid/leather_overlay.png']]]){
  for(const f of files){const target=path.join(root,'public/textures',v,f);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,png);}
  const manifest=await originalArmorTextures(root,v),resources={currentConfig:{version:v,texturesVersion:v},currentResources:{customTextures:{}}};
  assert.equal(installOriginalArmorTextures(resources,manifest),files.length);
  if(v==='1.21.1')assert.ok(manifest.textures.golden_layer_2);
  for(const row of Object.values(manifest.textures))assert.match(row.sha256,/^[a-f0-9]{64}$/);
  if(v==='1.21.11'){
   assert.match(resources.currentResources.customTextures.armor.textures.copper_layer_1.src,/humanoid\/copper\.png$/);
   assert.match(resources.currentResources.customTextures.armor.textures.copper_layer_2.src,/humanoid_leggings\/copper\.png$/);
   assert.ok(manifest.textures.golden_layer_1);assert.ok(manifest.textures.turtle_layer_1);assert.ok(manifest.textures.leather_layer_1_overlay);
  }
 }
});
test('unavailable armor packs stay optional, while cross-version and external texture substitutions are refused',()=>{
 const resources={currentConfig:{version:'1.21.1'},currentResources:{customTextures:{}}};
 assert.equal(installOriginalArmorTextures(resources,{}),0);
 assert.throws(()=>installOriginalArmorTextures(resources,{schemaVersion:1,minecraftVersion:'1.21.11',textures:{}}),/VERSION/);
 for(const src of ['https://example.com/copper.png','/textures/1.21.1/../secret.png','/textures/1.21.1/models/armor/helmet.png?key=private'])
  assert.throws(()=>installOriginalArmorTextures(resources,{schemaVersion:1,minecraftVersion:'1.21.1',textures:{copper_layer_1:{src}}}),/PATH/);
});
