export const CAMERA_SCRIPT_PROTOCOL:'mcvisual.camera-script/v1';
export interface CameraScript {schema:typeof CAMERA_SCRIPT_PROTOCOL;distance?:number;height?:number;speed?:number;durationMs?:number;arcDegrees?:number}
export const CAMERA_SCRIPT_LIMITS:Readonly<Record<'distance'|'height'|'speed'|'durationMs'|'arcDegrees',readonly[number,number]>>;
export function validateCameraScript(value:unknown,view:string):CameraScript|undefined;
export function blendCameraScripts(options:Array<{id:string;name:string;view:string;motion?:CameraScript}>,probabilities:Record<string,number>|undefined,winner:string):CameraScript|undefined;
