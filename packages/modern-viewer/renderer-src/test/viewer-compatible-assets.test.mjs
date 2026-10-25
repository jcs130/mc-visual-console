import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {runInNewContext} from 'node:vm';
import {selectViewerAssets,viewerVersionAssets} from '../host/viewer-version.mjs';
import {viewerRuntimeRegistry,viewerRuntimeScript} from '../host/viewer-runtime-registry.mjs';
import {viewerDataAlias} from '../tools/viewer-data-alias.mjs';
const require=createRequire(import.meta.url);

async function fixtures(t){
  const root=await mkdtemp(path.join(tmpdir(),'viewer-compat-'));
  t.after(async()=>{assert.equal(path.dirname(root),path.resolve(tmpdir()));assert.ok(path.basename(root).startsWith('viewer-compat-'));await rm(root,{recursive:true,force:true});});
  return root;
}
async function pack(directory,version,runtimeRegistryVersion=1,preset=null){
  await mkdir(directory,{recursive:true});
  await writeFile(path.join(directory,'viewer-assets.json'),JSON.stringify({minecraftVersion:version}));
  await writeFile(path.join(directory,'viewer-client.json'),JSON.stringify({minecraftVersion:version,runtimeRegistryVersion,preset}));
}
test('missing prebuilt version selects reusable materials while preserving the requested registry identity',async t=>{
  const root=await fixtures(t),second=path.join(root,'versions','1.21.5');
  await pack(root,'1.21.1');await pack(second,'1.21.5');
  assert.deepEqual(await selectViewerAssets(root,'1.21.4'),{directory:second,requestedVersion:'1.21.4',assetVersion:'1.21.5',mode:'compatible'});
  assert.deepEqual(await selectViewerAssets(root,'1.21.1'),{directory:root,requestedVersion:'1.21.1',assetVersion:'1.21.1',mode:'exact'});
  // Native callers retain their explicit exact-assets contract.
  await assert.rejects(viewerVersionAssets(root,'1.21.4'),/ASSETS_MISSING/);
});
test('compatibility never selects an old bundle with a baked numeric registry or a server preset',async t=>{
  const root=await fixtures(t);await pack(root,'1.21.1',undefined,'qiandengji');
  await assert.rejects(selectViewerAssets(root,'1.21.4'),/ASSETS_MISSING/);
  await pack(root,'1.21.1',0);
  await assert.rejects(selectViewerAssets(root,'1.21.4'),/ASSETS_MISSING/);
  await assert.rejects(selectViewerAssets(root,'../1.21.4'),/VERSION_UNSUPPORTED/);
});
test('a mismatched explicit pack remains a real error instead of quietly replacing its declared identity',async t=>{
  const root=await fixtures(t);await pack(root,'1.21.1');
  await pack(path.join(root,'versions','1.21.4'),'1.20.6');
  await assert.rejects(selectViewerAssets(root,'1.21.4'),/VERSION_MISMATCH/);
});
test('browser and worker data decode changed state IDs using the actual version, not the texture version',async()=>{
  const payload=await viewerRuntimeRegistry('1.21.4',require);
  const module={exports:{}};
  runInNewContext(viewerDataAlias(require,'1.21.1'),{require,module,globalThis:{__MC_VIEWER_REGISTRY__:payload}});
  const actual=module.exports('1.21.4'),data=require('minecraft-data');
  const changed=data('1.21.4').blocksArray.find(block=>data('1.21.1').blocksByName[block.name]?.defaultState!==block.defaultState);
  assert.ok(changed);assert.equal(actual.blocksByName[changed.name].defaultState,changed.defaultState);
  assert.equal(actual.version.minecraftVersion,'1.21.4');assert.equal(actual.supportFeature('blockStateId'),true);
  const Chunk=require('prismarine-chunk')(actual),column=new Chunk({minY:-64,worldHeight:384});
  const Vec3=require('vec3').Vec3,at=new Vec3(0,64,0);
  column.setBlockStateId(at,changed.defaultState);
  assert.equal(column.getBlock(at).name,changed.name);
  assert.equal(module.exports.versions.pc.some(row=>row.minecraftVersion==='1.21.4'),true);
});
test('exact builds still work without a runtime bootstrap and bootstraps contain no local path',async()=>{
  const module={exports:{}};runInNewContext(viewerDataAlias(require,'1.21.1'),{require,module,globalThis:{}});
  assert.equal(module.exports('1.21.1').version.minecraftVersion,'1.21.1');
  const registry=await viewerRuntimeRegistry('1.21.4',require);
  const script=viewerRuntimeScript(registry,{directory:'private-directory',requestedVersion:'1.21.4',assetVersion:'1.21.1',mode:'compatible'});
  assert.equal(script.includes('private-directory'),false);
  const scope={};runInNewContext(script,{globalThis:scope});
  assert.equal(scope.__MC_VIEWER_REGISTRY__.data.version.minecraftVersion,'1.21.4');
  assert.equal(scope.__MC_VIEWER_RESOURCE_INFO__.mode,'compatible');
});
