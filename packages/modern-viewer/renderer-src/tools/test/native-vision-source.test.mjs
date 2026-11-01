import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {createNativeVisionSource} from '../../host/native-vision-source.mjs';
function fixture(){
 const now=Date.now(),bytes=Buffer.from('jpeg-fixture');let request;
 const n={recordedAt:new Date(now).toISOString(),connected:true,authenticated:true,spectator:true,phase:'attached',server:'server',observerUuid:'observer',
  targetUuid:'actor',cameraUuid:'actor',connectionEpoch:'connection',nativeWorldEpoch:1,requestId:'camera-op',visionCapture:{enabled:true}};
 const receipt=()=>request?{schema:'mcvisual.vision-frame/v1',...request,id:request.id,phase:'captured',file:'frame.jpg',mime:'image/jpeg',capturedAt:now,width:512,height:288,
  bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}:null;
 const ports={readNative:async()=>n,writeRequest:async r=>{request=r;},readReceipt:async()=>receipt(),readImage:async()=>bytes,expectedServer:'server',observerUuid:'observer',now:()=>now,pollMs:1};
 return{n,ports,receipt};
}
test('frame capture is explicit, bounded, hash-checked and matches the live camera before and after IO',async()=>{
 const f=fixture(),s=createNativeVisionSource(f.ports);const r=await s.capture();assert.equal(r.kind,'frame');assert.equal(r.width,512);assert.equal(r.targetUuid,'actor');assert.equal(r.images.length,1);s.stop();
});
test('manual, GUI, disabled capture, untrusted camera and transitions cannot capture',async()=>{
 for(const patch of[{screenOpen:true},{manualDetachRequested:true},{visionCapture:{enabled:false}},{cameraUuid:'other'},{transition:{active:true}},{authenticated:false}]){
  const f=fixture();Object.assign(f.n,patch);const s=createNativeVisionSource(f.ports);assert.equal((await s.capture()).kind,'unavailable');assert.equal(f.receipt(),null);s.stop();
 }
});
test('changed request, world, camera or mismatched JPEG bytes cannot be returned as a valid image',async()=>{
 for(const key of['requestId','nativeWorldEpoch','cameraUuid']){const f=fixture();f.ports.readReceipt=async()=>{f.n[key]='changed';return f.receipt();};const s=createNativeVisionSource(f.ports);assert.equal((await s.capture()).kind,'unavailable');s.stop();}
 const f=fixture();f.ports.readImage=async()=>Buffer.from('other');assert.equal((await createNativeVisionSource(f.ports).capture()).reason,'capture_image_mismatch');
});
test('waiting capture cancels promptly and stop cannot revive a pending image',async()=>{
 const f=fixture();f.ports.readReceipt=async()=>null;const s=createNativeVisionSource(f.ports),controller=new AbortController();
 const wait=s.capture({signal:controller.signal});await new Promise(r=>setImmediate(r));controller.abort();assert.equal((await wait).reason,'stopped_or_aborted');
 s.stop();assert.equal((await s.capture()).reason,'stopped_or_aborted');
});
