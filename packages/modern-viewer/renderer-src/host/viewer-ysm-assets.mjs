import {createHash, randomBytes} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
export const YSM_ASSET_CHANNEL='mcagent:ysm_asset';
const MAX_BYTES=2*1024*1024, MAX_RAW=8*1024*1024;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function decodeYsmBundle(compressed,hash) {
  if(compressed.length>MAX_BYTES || sha(compressed)!==hash)throw Error('YSM_ASSET_HASH_MISMATCH');
  const raw=gunzipSync(compressed,{maxOutputLength:MAX_RAW});
  const bundle=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  if(bundle.schemaVersion!==1 || bundle.ysmVersion!=='2.4.1' || bundle.format!=='ysm-bedrock-original'
    || typeof bundle.modelId!=='string' || bundle.modelId.length>96 || !bundle.files || Object.keys(bundle.files).length>20)throw Error('YSM_ASSET_FORMAT_UNSUPPORTED');
  let total=0;
  for(const [path,file] of Object.entries(bundle.files)) {
    if(path.startsWith('/') || path.includes('\\') || path.includes(':') || path.split('/').includes('..') || typeof file.base64!=='string')throw Error('YSM_ASSET_PATH_INVALID');
    const bytes=Buffer.from(file.base64,'base64');total+=bytes.length;
    if(total>MAX_RAW || bytes.length!==file.bytes || sha(bytes)!==file.sha256)throw Error('YSM_SOURCE_HASH_MISMATCH');
  }
  if(!bundle.files[bundle.model] || !bundle.files[bundle.animation] || !bundle.files['ysm.json']
    || Object.values(bundle.textures??{}).some(path=>!bundle.files[path]))throw Error('YSM_SOURCE_MISSING');
  return {...bundle,assetSha256:hash};
}
/** Opt-in asset requests over the existing Minecraft connection, serialized and bounded. */
export function createYsmAssetReceiver(bot,{onAsset=()=>{},onError=()=>{}}={}) {
  const cache=new Map(),queue=new Map(),attempts=new Map();let active=null,disposed=false,bytes=0,lastStarted=0;
  const start=()=>{
    if(disposed || active || !queue.size || bot._client.state!=='play' || Date.now()-lastStarted<600)return;
    const [hash,row]=queue.entries().next().value;queue.delete(hash);
    const requestId=randomBytes(16).toString('hex');active={row,hash,requestId,parts:[],size:0,count:null,started:Date.now()};
    lastStarted=Date.now();attempts.set(hash,(attempts.get(hash)??0)+1);
    bot._client.write('custom_payload',{channel:YSM_ASSET_CHANNEL,data:Buffer.from(JSON.stringify({type:'get',modelId:row.modelId,sha256:hash,requestId}))});
  };
  const fail=reason=>{const prior=active;active=null;if(prior)onError(prior.row,reason);start();};
  const payload=packet=>{
    if(packet.channel!==YSM_ASSET_CHANNEL || !active || packet.data.length>18000)return;
    try {
      const p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(packet.data));
      if(p.schemaVersion!==1 || p.type!=='chunk' || p.requestId!==active.requestId || p.sha256!==active.hash)return;
      if(!Number.isInteger(p.count) || p.count<1 || p.count>171 || !Number.isInteger(p.index) || p.index<0 || p.index>=p.count
        || !Number.isInteger(p.bytes) || p.bytes<1 || p.bytes>MAX_BYTES || typeof p.data!=='string' || p.data.length>16384
        || active.count!==null && (active.count!==p.count || active.bytes!==p.bytes))throw Error('YSM_TRANSFER_INVALID');
      active.count=p.count;active.bytes=p.bytes;
      if(active.parts[p.index])return;
      const part=Buffer.from(p.data,'base64');if(part.length!==Math.min(12288,p.bytes-p.index*12288))throw Error('YSM_TRANSFER_SIZE_INVALID');
      active.parts[p.index]=part;active.size+=part.length;
      if(active.parts.filter(Boolean).length===p.count) {
        if(active.size!==p.bytes)throw Error('YSM_TRANSFER_SIZE_INVALID');
        const bundle=decodeYsmBundle(Buffer.concat(active.parts),active.hash);
        if(bundle.modelId!==active.row.modelId)throw Error('YSM_MODEL_BINDING_MISMATCH');
        const size=Buffer.byteLength(JSON.stringify(bundle));
        while(cache.size>=32 || bytes+size>32*1024*1024){const key=cache.keys().next().value;bytes-=cache.get(key).size;cache.delete(key);}
        const hash=active.hash;cache.set(hash,{bundle,size});bytes+=size;active=null;onAsset(bundle);setTimeout(start,600).unref?.();
      }
    } catch(error){fail(error.message?.startsWith('YSM_')?error.message:'YSM_TRANSFER_INVALID');}
  };
  const timer=setInterval(()=>{if(active && Date.now()-active.started>20000)fail('YSM_TRANSFER_TIMEOUT');else start();},1000);timer.unref?.();
  bot._client.on('custom_payload',payload);
  return {get:hash=>cache.get(hash)?.bundle,request(row){
    if(disposed || row.webAvailable!==true || cache.has(row.assetSha256) || active?.hash===row.assetSha256 || (attempts.get(row.assetSha256)??0)>=3 || queue.size>=40)return;
    queue.set(row.assetSha256,row);start();
  },reset(){active=null;queue.clear();attempts.clear();},dispose(){disposed=true;clearInterval(timer);bot._client.off('custom_payload',payload);cache.clear();queue.clear();active=null;}};
}
