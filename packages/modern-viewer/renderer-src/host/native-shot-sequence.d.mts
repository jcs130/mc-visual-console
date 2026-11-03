import type {NativeCameraChoice} from './native-director-policy.mjs';
export const NATIVE_CAMERA_CADENCE_PROTOCOL:'mcvisual.native-camera-cadence/v1';
export function nativeCameraFamily(view:string):string;
export function nativeScheduledCamera(choice:NativeCameraChoice,native:Record<string,any>,options?:{now?:number;deadline?:boolean}):boolean;
export class NativeCameraSequence {
 constructor(options:{enabled?:boolean;now?:()=>number;currentView:(native:any)=>string;intervalMs?:number;cadenceProfile?:'steady'|'lively'});
 observe(native:Record<string,any>):void;
 choose(native:Record<string,any>,options?:{activity?:Array<Record<string,any>>;lastProjectionChangeAt?:number;orthographic?:boolean;preferOrthographic?:boolean}):NativeCameraChoice|null;
 stats():{enabled:boolean;phase:string;intervalMs:number;cadenceProfile:'steady'|'lively';actualView:string|null;stopped:boolean;coverage:{renderedViews:string[];recent:Array<{view:string;family:string;at:number}>};attempts:Array<{view:string;family:string;at:number;failed:boolean}>;eligibleViews:string[];excluded:Array<{view:string;reason:string}>};
 stop():void;
}
