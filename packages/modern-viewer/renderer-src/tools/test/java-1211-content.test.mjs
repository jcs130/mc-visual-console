import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyAssetPack} from '../../../../../tools/prepare-viewer-assets.mjs';
import {verifyViewerContentAssets} from '../viewer-content-assets.mjs';

test('exact 1.21.1 map/frame/particle inputs bind their original client and official mappings',async()=>{
  const {directory,manifest}=await verifyAssetPack('java-1.21.1');
  const content=JSON.parse(await readFile(directory+'/public/viewer-content.json','utf8'));
  assert.equal(content.clientJarSha256,'499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99');
  assert.match(content.mappingsSha256,/^[a-f0-9]{64}$/);
  const verified=await verifyViewerContentAssets(directory,content.clientJarSha256,{required:true,version:'1.21.1'});
  assert.equal(verified.manifestSha256,manifest.source.viewerContent.manifestSha256);
  assert.equal(verified.capabilities.mapPixels,true);assert.equal(verified.capabilities.mapDecorations,false);
  assert.equal(verified.javaFramePixelParityVerified,false);
  await assert.rejects(verifyViewerContentAssets(directory,content.clientJarSha256,{version:'1.20.6'}),/mismatch/);
  for(const p of ['public/viewer-content.json','public/particle-content.png'])assert.ok(manifest.files[p]);
});
