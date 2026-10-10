import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function verifyTextDisplayAssets(root,clientJarSha256) {
  const raw=await readFile(path.join(root,'public/text-display-font.json')).catch(error=>{
    if(error.code==='ENOENT')throw Error('text_display_font_missing: prepare java-1.20.6 assets with tools/prepare-viewer-assets.mjs; custom exports also need tools/export-text-display-font.py');
    throw error;
  });
  const font=JSON.parse(raw);
  if(font.schemaVersion!==1||font.minecraftVersion!=='1.20.6'||font.clientJarSha256!==clientJarSha256
      ||font.uniform!==false||font.jp!==false||!Array.isArray(font.providers)||font.providers.length>16
      ||!font.files||Object.keys(font.files).length!==8
      ||!font.providers.some(p=>p.type==='space')||!font.providers.some(p=>p.type==='bitmap')
      ||!font.providers.some(p=>p.type==='unihex'&&p.url==='/fonts/1.20.6/unifont.zip')
      ||!font.files['fonts/1.20.6/unifont.zip']||!/^[a-f0-9]{40}$/.test(font.assetIndexSha1))throw Error('text_display_font_version');
  for(const [relative,expected] of Object.entries(font.files)) {
    if(!/^(?:fonts\/1\.20\.6\/(?:default\.json|include\/(?:default|space|unifont)\.json|unifont\.zip)|textures\/1\.20\.6\/font\/[a-z_]+\.png)$/.test(relative))throw Error('text_display_font_path');
    const bytes=await readFile(path.join(root,'public',relative));
    if(bytes.length!==expected.bytes||hash(bytes)!==expected.sha256)throw Error('text_display_font_hash:'+relative);
  }
  return {schemaVersion:1,manifestSha256:hash(raw),assetIndexSha1:font.assetIndexSha1,
    defaultFontSourceVerified:true,javaTextPixelParityVerified:false};
}
