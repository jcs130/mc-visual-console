import {randomUUID,createHash} from 'node:crypto';

/** Read-only capture transport; the host supplies all explicit local IO. */
export function createNativeVisionSource({readNative,writeRequest,readReceipt,readImage,expectedServer,observerUuid,
 now=Date.now,timeoutMs=2500,pollMs=40}={}){
 if([readNative,writeRequest,readReceipt,readImage].some(f=>typeof f!=='function')||!expectedServer||!observerUuid
   ||timeoutMs<1||timeoutMs>5000||pollMs<1)throw Error('invalid_native_vision_source');
 let stopped=false,active=null;
 const available=n=>n?.connected===true&&n.authenticated===true&&n.spectator===true&&n.phase==='attached'
  &&n.server===expectedServer&&n.observerUuid===observerUuid&&n.targetUuid&&n.targetUuid===n.cameraUuid
  &&n.visionCapture?.enabled===true&&!n.screenOpen&&!n.manualDetachRequested&&!n.transition?.active
  &&Number.isFinite(Date.parse(n.recordedAt))&&Date.parse(n.recordedAt)<=now()+1000&&now()-Date.parse(n.recordedAt)<3000;
 const bound=(n,r)=>available(n)&&n.connectionEpoch===r.connectionEpoch&&n.nativeWorldEpoch===r.nativeWorldEpoch
  &&n.targetUuid===r.targetUuid&&n.requestId===r.cameraRequestId;
 return{
  async capture({signal,maxWidth=512,maxHeight=512}={}){
   if(stopped||signal?.aborted)return{kind:'unavailable',reason:'stopped_or_aborted'};
   if(active)return{kind:'unavailable',reason:'capture_busy'};
   const controller=new AbortController();active=controller;
   const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
   try{
    if(!Number.isInteger(maxWidth)||!Number.isInteger(maxHeight)||maxWidth<64||maxHeight<64||maxWidth>512||maxHeight>512)return{kind:'unavailable',reason:'capture_size'};
    const n=await readNative();if(!available(n))return{kind:'unavailable',reason:'capture_context'};
    const request={id:randomUUID(),server:expectedServer,observerUuid,connectionEpoch:n.connectionEpoch,nativeWorldEpoch:n.nativeWorldEpoch,
     targetUuid:n.targetUuid,cameraRequestId:n.requestId,issuedAt:now(),expiresAt:now()+timeoutMs,maxWidth,maxHeight};
    if(stopped||controller.signal.aborted)return{kind:'unavailable',reason:'stopped_or_aborted'};
    await writeRequest(request,{signal:controller.signal});
    while(!stopped&&!controller.signal.aborted&&now()<request.expiresAt){
     const receipt=await readReceipt();
     if(receipt?.id===request.id){
      if(receipt.phase==='rejected')return{kind:'unavailable',reason:'capture_rejected'};
      if(receipt.phase==='captured'){
       const latest=await readNative();
       if(!bound(latest,request)||receipt.connectionEpoch!==request.connectionEpoch||receipt.nativeWorldEpoch!==request.nativeWorldEpoch
         ||receipt.targetUuid!==request.targetUuid||receipt.observerUuid!==observerUuid||receipt.server!==expectedServer
         ||receipt.cameraRequestId!==request.cameraRequestId||receipt.file!=='frame.jpg'||receipt.mime!=='image/jpeg'
         ||!Number.isInteger(receipt.width)||!Number.isInteger(receipt.height)||receipt.width<1||receipt.height<1
         ||receipt.width>maxWidth||receipt.height>maxHeight||!Number.isFinite(receipt.capturedAt)
         ||receipt.capturedAt<request.issuedAt||receipt.capturedAt>now()+1000||now()-receipt.capturedAt>3000)
         return{kind:'unavailable',reason:'capture_binding_changed'};
       const bytes=await readImage('frame.jpg');
       if(!(bytes instanceof Uint8Array)||bytes.byteLength>1024*1024||bytes.byteLength!==receipt.bytes
         ||createHash('sha256').update(bytes).digest('hex')!==receipt.sha256)return{kind:'unavailable',reason:'capture_image_mismatch'};
       const after=await readNative();if(!bound(after,request)||stopped||controller.signal.aborted)return{kind:'unavailable',reason:'capture_binding_changed'};
       return{kind:'frame',images:['data:image/jpeg;base64,'+Buffer.from(bytes).toString('base64')],revision:receipt.sha256,
        capturedAt:receipt.capturedAt,width:receipt.width,height:receipt.height,scope:request.connectionEpoch+':'+request.nativeWorldEpoch,
        targetUuid:request.targetUuid,cameraRequestId:request.cameraRequestId};
      }
     }
     await new Promise(resolve=>{const timer=setTimeout(done,pollMs);function done(){clearTimeout(timer);controller.signal.removeEventListener('abort',done);resolve();}controller.signal.addEventListener('abort',done,{once:true});if(controller.signal.aborted)done();});
    }
    return{kind:'unavailable',reason:stopped||controller.signal.aborted?'stopped_or_aborted':'capture_timeout'};
   }catch{return{kind:'unavailable',reason:'capture_io_error'};}
   finally{signal?.removeEventListener('abort',abort);if(active===controller)active=null;}
  },
  stop(){stopped=true;active?.abort();},
 };
}
