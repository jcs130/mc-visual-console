import {CameraDirector,CAMERA_PROTOCOL,callCameraTool,type CameraAdapter,type CameraObservation} from 'mc-visual-console/broadcast-camera';
const observed:CameraObservation={schema:CAMERA_PROTOCOL,at:Date.now(),scope:'isolated-world',subjectUuid:'subject',shots:[{id:'isometric',available:true}]};
const adapter:CameraAdapter={observe:async()=>observed,submit:async(operation,{signal})=>{if(signal.aborted)throw Error('aborted');return {actionId:operation.actionId};}};
const director=new CameraDirector(adapter);
const {lease}=director.claim('typed-host');
const result=director.take({actionId:'typed-shot',lease,shot:'isometric',holdMs:10000});
const wait=director.wait('typed-shot',{signal:new AbortController().signal,timeoutMs:1000});
void result;void wait;void callCameraTool;
// @ts-expect-error A host must provide a numeric bounded dwell, not model text.
director.take({actionId:'bad',lease,shot:'isometric',holdMs:'ten seconds'});
