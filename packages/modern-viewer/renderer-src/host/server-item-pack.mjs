import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const resource=value=>typeof value==='string'&&/^[a-z0-9_./-]{1,160}\.png$/.test(value)&&!value.split('/').some(v=>!v||v==='.'||v==='..');

/** Explicit immutable resource pack, separate from the locked vanilla assets. */
export async function loadServerItemPack(file,sha256) {
  if(!file)return {metadata:{available:false},assets:new Map()};
  if(!/^[a-f0-9]{64}$/.test(sha256??''))throw Error('SERVER_ITEM_PACK_HASH_REQUIRED');
  const real=await fs.realpath(file),bytes=await fs.readFile(real);
  if(bytes.length>65536||digest(bytes)!==sha256)throw Error('SERVER_ITEM_PACK_HASH_MISMATCH');
  const data=JSON.parse(bytes),root=path.dirname(real),assets=new Map();
  if(data.schemaVersion!==1||data.minecraftVersion!=='1.21.1'||!/^[a-z0-9_.-]{1,80}$/.test(data.id??'')||!Array.isArray(data.items)||data.items.length>64)
    throw Error('SERVER_ITEM_PACK_INVALID');
  const selectors=new Set();
  for(const row of data.items){
    const key=row.baseId+':'+row.customModelData;
    if(!/^minecraft:[a-z_]+$/.test(row.baseId??'')||!Number.isSafeInteger(row.customModelData)||selectors.has(key)||!resource(row.icon))throw Error('SERVER_ITEM_PACK_SELECTOR_INVALID');
    selectors.add(key);
    const expected=data.assets?.[row.icon];
    if(!expected||!Number.isInteger(expected.bytes)||expected.bytes<24||expected.bytes>262144||!/^[a-f0-9]{64}$/.test(expected.sha256??''))throw Error('SERVER_ITEM_PACK_ASSET_INVALID');
    const absolute=await fs.realpath(path.resolve(root,row.icon));
    if(!absolute.startsWith(root+path.sep))throw Error('SERVER_ITEM_PACK_ASSET_ESCAPE');
    const image=await fs.readFile(absolute);
    if(image.length!==expected.bytes||digest(image)!==expected.sha256||image.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('SERVER_ITEM_PACK_ASSET_HASH_MISMATCH');
    assets.set(row.icon,image);
  }
  return {metadata:{available:true,schemaVersion:1,id:data.id,minecraftVersion:data.minecraftVersion,catalogSha256:sha256,
    representation:'original_server_catalog_icon',pixelParityVerified:false,
    items:data.items.map(({baseId,customModelData,icon})=>({baseId,customModelData,icon})),
    assets:Object.fromEntries([...assets.keys()].map(key=>[key,data.assets[key]]))},assets};
}
