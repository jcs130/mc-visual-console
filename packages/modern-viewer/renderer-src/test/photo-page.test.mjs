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
    const context={URLSearchParams,location:{search:'?distance=2'},document:{fonts:{status:'loaded'},getElementById:()=>({width:1536,height:1536})}};
    vm.createContext(context);vm.runInContext(page.match(/<script>([\s\S]*?)<\/script>/)[1],context);
    assert.equal(context.__photoReady(),false);
    const state={received:25,meshed:25,masked:0,pendingSections:0};context.__lanternRenderer={photoMode:true,chunkLoading:state};assert.equal(context.__photoReady(),true);
    for (const changes of [{received:8},{meshed:8},{masked:1},{pendingSections:1}]) {context.__lanternRenderer.chunkLoading={...state,...changes};assert.equal(context.__photoReady(),false);}
    context.location.search='?distance=6';context.__lanternRenderer.chunkLoading={received:169,meshed:169,masked:0,pendingSections:0};assert.equal(context.__photoReady(),true);
    context.itemHeadDiagnostics=()=>({pending:1,unavailable:0});assert.equal(context.__photoReady(),false);
    context.itemHeadDiagnostics=()=>({pending:0,unavailable:1});assert.equal(context.__photoReady(),false);
    context.itemHeadDiagnostics=()=>({pending:0,unavailable:0});assert.equal(context.__photoReady(),true);
    context.cortiViewerContent={stats:()=>({ysm:{pending:1,failed:0,unavailable:0,rendered:0,states:1}})};assert.equal(context.__photoReady(),false);
    context.cortiViewerContent={stats:()=>({ysm:{pending:0,failed:0,unavailable:0,rendered:0,states:1}})};
    assert.equal(context.__photoReady(),true,'a deliberately hidden self is not a pending render job');
    for (const changes of [{pending:1},{failed:1},{unavailable:1}]) {
      context.cortiViewerContent={stats:()=>({ysm:{pending:0,failed:0,unavailable:0,rendered:0,states:1,...changes}})};
      assert.equal(context.__photoReady(),false,'actual incomplete models still block capture');
    }
    for (const mode of ['first','third','3dview']) assert.match(await viewerPhotoPage(root,mode),new RegExp('data-view-mode="'+mode+'"'));
    await assert.rejects(viewerPhotoPage(root,'forged'),/PHOTO_VIEW_MODE_INVALID/);
  } finally {await rm(root,{recursive:true,force:true});}
});
