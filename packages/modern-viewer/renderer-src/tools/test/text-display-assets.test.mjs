import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {verifyTextDisplayAssets} from '../text-display-assets.mjs';
const source=fileURLToPath(new URL('../../../asset-packs/java-1.20.6/',import.meta.url));
test('original bitmap and Unihex bytes are bound to the exact client and asset index without pixel-parity claims',async()=>{
  const font=JSON.parse(await readFile(path.join(source,'public/text-display-font.json'),'utf8'));
  const result=await verifyTextDisplayAssets(source,font.clientJarSha256);
  assert.equal(result.defaultFontSourceVerified,true);assert.equal(result.javaTextPixelParityVerified,false);
  assert.equal(result.assetIndexSha1,'2395c5add7c32697a5c80a29898ff5921340f92b');
  await assert.rejects(verifyTextDisplayAssets(source,'0'.repeat(64)),/font_version/);
});
test('missing or incomplete font inputs tell the operator to prepare the matching assets and fail closed',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'text-display-assets-'));
  try {
    await assert.rejects(verifyTextDisplayAssets(root,'a'.repeat(64)),/prepare java-1.20.6 assets/);
    await mkdir(path.join(root,'public'));
    await writeFile(path.join(root,'public/text-display-font.json'),JSON.stringify({schemaVersion:1,minecraftVersion:'1.20.6',clientJarSha256:'a'.repeat(64),uniform:false,jp:false,providers:[],files:{}}));
    await assert.rejects(verifyTextDisplayAssets(root,'a'.repeat(64)),/font_version/);
  } finally {await rm(root,{recursive:true,force:true});}
});
