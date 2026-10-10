import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {viewerPhotoPage} from '../host/viewer-photo-page.mjs';
test('clean photography waits for actual meshed chunks and hides UI without deleting world pixels', async () => {
  const root=await mkdtemp(path.join(tmpdir(),'photo-page-'));
  try {
    await assert.rejects(viewerPhotoPage(root),/PHOTO_VIEWER_ASSETS_MISSING/);
    await mkdir(root+'/public');await writeFile(root+'/public/index.html','<html><head></head><body><div>HUD</div><script type="module" src="/index.js"></script></body></html>');
    const page=await viewerPhotoPage(root);assert.match(page,/:not\(#viewer-canvas\)/);assert.match(page,/display:none !important/);
    const context={document:{fonts:{status:'loaded'},getElementById:()=>({width:768,height:768})}};
    vm.createContext(context);vm.runInContext(page.match(/<script>([\s\S]*?)<\/script>/)[1],context);
    assert.equal(context.__photoReady(),false);
    const state={received:25,meshed:25,masked:0,pendingSections:0};context.__lanternRenderer={photoMode:true,chunkLoading:state};assert.equal(context.__photoReady(),true);
    for (const changes of [{received:8},{meshed:8},{masked:1},{pendingSections:1}]) {context.__lanternRenderer.chunkLoading={...state,...changes};assert.equal(context.__photoReady(),false);}
  } finally {await rm(root,{recursive:true,force:true});}
});
