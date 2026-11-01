export interface CameraOperation { schema:'mcvisual.camera/v1';actionId:string;lease:string;scope:string;subjectUuid:string;shot:string;issuedAt:number;expiresAt:number;holdMs:number;reason:string;projection?:'perspective'|'orthographic';projectionProfile?:string }
export interface CameraReceipt {actionId:string;lease:string;phase:'accepted'|'transitioning'|'applied'|'cancelled'|'rejected';rendered?:boolean;projection?:'perspective'|'orthographic';projectionProfile?:string;[key:string]:unknown}
export interface CameraObservation {schema:'mcvisual.camera/v1';at:number;scope:string;subjectUuid:string;manualControl?:boolean;activity?:string;shots:Array<{id:string;available:boolean;recipeId?:string;projection?:'perspective'|'orthographic';projectionProfile?:string;projectionReady?:boolean}>;receipt?:CameraReceipt;[key:string]:unknown}
export interface CameraShotRecipe {id:string;name:string;purpose:string;angle:string;motion:string;useWhen:string[];avoidWhen:string[];requires:string[];finish:string;fallback:string[];suggested?:{arcDegrees?:[number,number];durationMs?:[number,number]}}
export interface CameraShotLibrary {schema:'mcvisual.shot-recipes/v1';status:string;units:string;recipes:CameraShotRecipe[]}
export function loadCameraShotLibrary():Promise<CameraShotLibrary>;
export function mapCameraRecipes(observed:CameraObservation,library:CameraShotLibrary):Array<{recipeId:string;shotIds:string[]}>;
export interface CameraAdapter {observe():Promise<CameraObservation>;submit(operation:CameraOperation,options:{signal:AbortSignal}):Promise<unknown>;cancel?(operation:CameraOperation):Promise<unknown>}
export interface CameraPlan {actionId:string;lease:string;shot:string;holdMs:number;reason?:string}
export interface CameraResult {operation:CameraOperation;phase:'accepted'|'transitioning'|'applied'|'cancelled'|'rejected'|'unknown';acceptedAt:number;completedAt:number|null;evidence?:CameraReceipt;verificationError?:'PROJECTION_EVIDENCE_MISMATCH'}
export const CAMERA_PROTOCOL:'mcvisual.camera/v1';
export const CAMERA_TOOLS:ReadonlyArray<{name:string;description:string;inputSchema:Record<string,unknown>}>;
export class CameraDirector {
 constructor(adapter:CameraAdapter,options?:{now?:()=>number;maxAgeMs?:number;minHoldMs?:number});
 claim(owner:string):{owner:string;lease:string};
 observe():Promise<CameraObservation>;
 query():Promise<{schema:string;observed:CameraObservation;owner:string|null;lease:string|null;manualLocked:boolean;stopped:boolean;pending:string|null;current:unknown;holdUntil:number}>;
 take(plan:CameraPlan):Promise<CameraResult>;
 result(actionId:string):Promise<CameraResult>;
 wait(actionId:string,options?:{signal?:AbortSignal;timeoutMs?:number;pollMs?:number}):Promise<CameraResult>;
 cancel(actionId:string,lease:string):Promise<CameraResult>;
 handoverToManual():Promise<{manualLocked:true;pending:string|null}>;
 resumeFromManual():{manualLocked:false};
 stop():Promise<{stopped:true;pending:string|null}>;
}
export function callCameraTool(director:CameraDirector,name:string,input?:Record<string,unknown>):Promise<unknown>;
export function suggestFallbackShot(observed:CameraObservation):string|null;
