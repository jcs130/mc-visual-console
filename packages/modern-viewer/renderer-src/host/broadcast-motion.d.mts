export type CameraVector=[number,number,number];
export interface CameraPose {position:CameraVector;focus:CameraVector;up?:CameraVector}
export interface CameraMotionResult {phase:'running'|'completed'|'blocked'|'cancelled';reason:string;elapsedMs:number;durationMs:number;pose:CameraPose}
export function toJavaCameraAngles(pose:CameraPose):{yaw:number;pitch:number};
export class BoundedCameraMotion {
 constructor(options:{scope:string;kind:'hold'|'orbit_arc'|'push_in'|'pull_out'|'pedestal'|'truck'|'pan'|'tilt';position:CameraVector;focus:CameraVector;endPosition?:CameraVector;endFocus?:CameraVector;arcDegrees?:number;durationMs?:number;maxSpeed?:number;maxTurnDegrees?:number;radius?:number;probe:(pose:CameraPose,radius:number)=>{known:boolean;clear:boolean;visible:boolean}});
 readonly durationMs:number;
 advance(elapsedMs:number,options?:{scope?:string}):CameraMotionResult;
 cancel():CameraMotionResult;
 result():CameraMotionResult;
}
