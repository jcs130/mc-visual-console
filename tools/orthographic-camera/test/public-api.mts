import {CameraDirector,CAMERA_PROTOCOL,callCameraTool,loadCameraShotLibrary,mapCameraRecipes,type CameraAdapter,type CameraObservation} from 'mc-visual-console/broadcast-camera';
const observed:CameraObservation={schema:CAMERA_PROTOCOL,at:Date.now(),scope:'isolated-world',subjectUuid:'subject',shots:[{id:'isometric',available:true}]};
const adapter:CameraAdapter={observe:async()=>observed,submit:async(operation,{signal})=>{if(signal.aborted)throw Error('aborted');return {actionId:operation.actionId};}};
const director=new CameraDirector(adapter);
const {lease}=director.claim('typed-host');
const result=director.take({actionId:'typed-shot',lease,shot:'isometric',holdMs:10000});
const wait=director.wait('typed-shot',{signal:new AbortController().signal,timeoutMs:1000});
void result;void wait;void callCameraTool;
const library=await loadCameraShotLibrary();const mapped=mapCameraRecipes(observed,library);
const recipeMotion:string=library.recipes[0].motion;const runtimeShotIds:string[]=mapped[0].shotIds;
void recipeMotion;void runtimeShotIds;
// @ts-expect-error A host must provide a numeric bounded dwell, not model text.
director.take({actionId:'bad',lease,shot:'isometric',holdMs:'ten seconds'});

import {CameraChoiceArbiter,buildCameraDecision,createCameraJudgePanel,type CameraDecisionObservation,type CameraDecisionPort} from 'mc-visual-console/broadcast-decisions';
import {BoundedCameraMotion,toJavaCameraAngles} from 'mc-visual-console/broadcast-motion';
const facts:CameraDecisionObservation={scope:'world',generation:'epochA',at:Date.now(),sceneKey:'travel',program:{phase:'idle'},subjects:[],shots:[]};
const packet=buildCameraDecision(facts);const arbiter=new CameraChoiceArbiter();const advice=arbiter.decide(packet);
facts.subjects.push({uuid:'subject',scope:'world',at:Date.now(),loaded:true,alive:true,
 activity:{kind:'combat',at:Date.now(),since:Date.now(),lastProgressAt:Date.now(),provenance:'game',evidenceId:'verified-hit'}});
const port:CameraDecisionPort={request:async()=>({answers:{}})};const panel=createCameraJudgePanel(port);
void panel.judge(packet,{roles:['action','space']});void advice;
// @ts-expect-error Roles are finite; arbitrary prompt names are not accepted.
void panel.judge(packet,{roles:['unboundedAgent']});
const motion=new BoundedCameraMotion({scope:'world',kind:'orbit_arc',position:[0,3,6],focus:[0,1,0],probe:()=>({known:true,clear:true,visible:true})});
const pose=motion.advance(500).pose;const nativeAngles:{yaw:number;pitch:number}=toJavaCameraAngles(pose);void nativeAngles;
// @ts-expect-error A pose is an explicit vector, not generated code.
new BoundedCameraMotion({scope:'world',kind:'orbit_arc',position:'run this script',focus:[0,1,0],probe:()=>({known:true,clear:true,visible:true})});
