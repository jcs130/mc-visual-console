import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyAssetPack} from '../../../../../tools/prepare-viewer-assets.mjs';
import {verifyViewerContentAssets} from '../viewer-content-assets.mjs';
import {loadViewerContentAssets} from '../../src/modern-viewer/server-particles.js';
import {loadTextDisplayFont} from '../../src/modern-viewer/text-display-font.js';
import {viewerVersionTexture} from '../../host/viewer-version.mjs';

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
  assert.equal(viewerVersionTexture('textures/1.16.4/entity/horse/horse_skeleton.png','1.21.1'),'textures/1.21.1/entity/horse/horse_skeleton.png');
  assert.ok(manifest.files['public/textures/1.21.1/entity/horse/horse_skeleton.png']);
});

test('browser content loading accepts the matching 1.21.1 manifest and refuses cross-version resources',async()=>{
  const root=new URL('../../../asset-packs/java-1.21.1/public/',import.meta.url);
  const fetcher=async p=>({ok:true,json:async()=>JSON.parse(await readFile(new URL(p.slice(1),root),'utf8'))});
  const loaded=await loadViewerContentAssets(fetcher,{minecraftVersion:'1.21.1',loadTexture:async url=>({url})});
  assert.equal(loaded.assets.minecraftVersion,'1.21.1');assert.equal(loaded.texture.url,'/particle-content.png');
  await assert.rejects(loadViewerContentAssets(fetcher,{minecraftVersion:'1.20.6'}),/mismatch/);
});

test('schema-compatible current versions load their exact content without a historical version whitelist',async()=>{
  for(const version of ['1.21.5','1.21.11']){
    const assets={schemaVersion:1,minecraftVersion:version,clientJarSha256:'a'.repeat(64),mapColors:Array(62).fill(0),particleSprites:{}};
    const fetcher=async p=>({ok:true,json:async()=>p==='/viewer-content.json'?assets:{minecraftVersion:version,clientJarSha256:'a'.repeat(64)}});
    assert.equal((await loadViewerContentAssets(fetcher,{minecraftVersion:version,loadTexture:async()=>({})})).assets.minecraftVersion,version);
    await assert.rejects(loadViewerContentAssets(fetcher,{minecraftVersion:'1.21.1'}),/mismatch/);
  }
});

test('1.21.1 browser fonts keep strict matching-version bitmap and unihex paths',async()=>{
  const spec={schemaVersion:1,minecraftVersion:'1.21.1',uniform:false,jp:false,providers:[{type:'space',advances:{' ':4}}]};
  const fetcher=async()=>({ok:true,json:async()=>spec});
  const font=await loadTextDisplayFont({fetcher,minecraftVersion:'1.21.1'});assert.equal(font.glyph(' ').advance,4);font.dispose();
  await assert.rejects(loadTextDisplayFont({fetcher,minecraftVersion:'1.20.6'}),/version/);
  for(const [type,url,error] of [['bitmap','/textures/1.20.6/font/ascii.png',/bitmap_path/],['unihex','/fonts/1.20.6/unifont.zip',/hex_path/]]){
    spec.providers=[{type,url}];await assert.rejects(loadTextDisplayFont({fetcher,minecraftVersion:'1.21.1'}),error);
  }
});
