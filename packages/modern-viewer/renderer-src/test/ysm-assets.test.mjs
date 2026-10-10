import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {EventEmitter} from 'node:events';
import {decodeYsmBundle,createYsmAssetReceiver,YSM_ASSET_CHANNEL} from '../host/viewer-ysm-assets.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
function fixture(){const file=Buffer.from('{}');return {schemaVersion:1,ysmVersion:'2.4.1',format:'ysm-bedrock-original',modelId:'uploaded_actor',model:'main.json',animation:'main.json',textures:{skin:'main.json'},files:Object.fromEntries(['main.json','ysm.json'].map(path=>[path,{bytes:file.length,sha256:sha(file),base64:file.toString('base64')}]))};}
test('hash-addressed original bundles reject modified files, paths, gzip bombs and version aliases',()=>{
 const bundle=fixture(),zip=gzipSync(JSON.stringify(bundle));assert.equal(decodeYsmBundle(zip,sha(zip)).modelId,'uploaded_actor');
 assert.throws(()=>decodeYsmBundle(zip,'0'.repeat(64)),/HASH/);
 for(const change of [b=>b.files['main.json'].sha256='0'.repeat(64),b=>b.files['../secret']=b.files['main.json'],b=>b.ysmVersion='2.6.5']){
  const bad=fixture();change(bad);const bytes=gzipSync(JSON.stringify(bad));assert.throws(()=>decodeYsmBundle(bytes,sha(bytes)));}
 const bomb=gzipSync(Buffer.alloc(8*1024*1024+1));assert.throws(()=>decodeYsmBundle(bomb,sha(bomb)));
});
test('existing game connection requests only opted-in assets; chunks bind the request, hash and model',()=>{
 const zip=gzipSync(JSON.stringify(fixture())),hash=sha(zip),writes=[],received=[];
 const client=Object.assign(new EventEmitter(),{state:'play',write:(name,packet)=>writes.push({name,packet})});
 const receiver=createYsmAssetReceiver({_client:client},{onAsset:b=>received.push(b)});
 const row={webAvailable:true,modelId:'uploaded_actor',assetSha256:hash};
 receiver.request({...row,webAvailable:false});assert.equal(writes.length,0);receiver.request(row);assert.equal(writes.length,1);
 const request=JSON.parse(writes[0].packet.data);assert.equal(writes[0].packet.channel,YSM_ASSET_CHANNEL);
 const payload={schemaVersion:1,type:'chunk',requestId:request.requestId,sha256:hash,index:0,count:1,bytes:zip.length,data:zip.toString('base64')};
 const emit=p=>client.emit('custom_payload',{channel:YSM_ASSET_CHANNEL,data:Buffer.from(JSON.stringify(p))});
 emit({...payload,requestId:'0'.repeat(32)});assert.equal(received.length,0);emit(payload);assert.equal(received.length,1);
 receiver.request(row);assert.equal(writes.length,1);receiver.dispose();assert.equal(client.listenerCount('custom_payload'),0);
});
