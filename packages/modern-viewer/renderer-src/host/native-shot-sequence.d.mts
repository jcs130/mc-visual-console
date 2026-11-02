import type {NativeCameraChoice} from './native-director-policy.mjs';
export class NativeCameraSequence {
 constructor(options:{enabled?:boolean;now?:()=>number;currentView:(native:any)=>string;intervalMs?:number});
 observe(native:Record<string,any>):void;
 choose(native:Record<string,any>,options?:{activity?:Array<Record<string,any>>;lastProjectionChangeAt?:number;orthographic?:boolean;preferOrthographic?:boolean}):NativeCameraChoice|null;
 stats():{enabled:boolean;phase:string;intervalMs:number;actualView:string|null;stopped:boolean};
 stop():void;
}
