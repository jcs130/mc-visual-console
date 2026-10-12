import {readFile,access,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {validateItemAppearanceManifest} from '../src/modern-viewer/item-appearances.js';

/** The pack uses only original project art. Validate every byte before copying
 * it into the consumer's existing static root; never open a new HTTP listener.
 */
export async function readItemAppearanceAssets(source) {
  const raw=await readFile(path.join(source,'manifest.json'));
  if(raw.length>65536)throw Error('ITEM_APPEARANCE_MANIFEST_BUDGET');
  const manifest=validateItemAppearanceManifest(JSON.parse(raw)),files=new Map([['manifest.json',raw]]);
  for(const [name,entry]of Object.entries(manifest.assets)) {
    const bytes=await readFile(path.join(source,name));
    if(bytes.length!==entry.bytes||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('ITEM_APPEARANCE_HASH_MISMATCH:'+name);
    files.set(name,bytes);
  }
  return {manifest,files,manifestSha256:createHash('sha256').update(raw).digest('hex')};
}
export async function verifyItemAppearanceAssets(root) {
  const source=path.join(root,'public/item-appearances');
  try{await access(source);}catch(error){if(error.code==='ENOENT')return null;throw error;}
  const result=await readItemAppearanceAssets(source);
  return {catalogSha256:result.manifest.catalogSha256,manifestSha256:result.manifestSha256,items:result.manifest.items.length,files:result.files.size};
}
export async function installItemAppearanceAssets(source,root) {
  const target=path.join(root,'public/item-appearances'),result=await readItemAppearanceAssets(source);
  const original=JSON.parse(await readFile(path.join(root,'public/asset-source.json'),'utf8'));
  if(original.minecraftVersion!=='1.20.6')throw Error('ITEM_APPEARANCE_CONSUMER_VERSION_MISMATCH');
  // A new version uses a new candidate deployment directory. Never overwrite
  // a running consumer or quietly keep obsolete files from an older catalog.
  await mkdir(target);
  for(const [name,bytes]of result.files) {const dest=path.join(target,name);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,bytes,{flag:'wx'});}
  return verifyItemAppearanceAssets(root);
}
