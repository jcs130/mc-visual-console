import type {CameraAdapter} from './broadcast-camera.mjs';
export interface NativeCameraStatus {
 schema:'mcvisual-native-director/v1';recordedAt:string;server:string;observerUuid:string;connected:boolean;authenticated:boolean;
 connectionBoundRequests:boolean;connectionEpoch:string;nativeWorldEpoch:number;phase:string;availableViews?:string[];
 targets:Array<{name:string;uuid:string|null}>;requestId?:string;activeLease?:string;cameraUuid?:string;targetUuid?:string;
 renderedAt?:number;perspective?:string;effectiveView?:string;manualDetachRequested?:boolean;rigCancelSupported?:boolean;
 drone?:{active:boolean;lastRenderedAt:number};
 shotExecution?:{requestId:string;view:string;phase:string;fallback?:boolean;[key:string]:unknown};
 cancelReceipt?:{id:string;lease:string;connectionEpoch:string;nativeWorldEpoch:number;targetUuid:string;phase:string};
 closeView?:unknown;transition?:{active:boolean};projection?:'perspective'|'orthographic';projectionProfile?:string|null;
 orthographic?:{ready:boolean;active:boolean;phase:string;requestId?:string;view?:string;reason?:string;renderedAt?:number;targetUuid?:string;nativeWorldEpoch?:number};
 spatial?:{at:number;targetUuid:string;nativeWorldEpoch:number;layout:string;known:boolean;floorSafe:boolean;orthographicVisibility:number};
}
export const NATIVE_CAMERA_RECIPES:Readonly<Record<string,{recipeId:string;label:string;finite:boolean;projection?:'orthographic';projectionProfile?:string}>>;
export function createNativeCameraAdapter(options:{readNative:()=>Promise<NativeCameraStatus>;writeRequest:(request:{id:string;lease:string;target:string;view:string;issuedAt:number;expiresAt:number;connectionEpoch:string},options:{signal:AbortSignal})=>Promise<unknown>;writeCancel?:(request:{id:string;lease:string;target:string;targetUuid:string;connectionEpoch:string;issuedAt:number;expiresAt:number})=>Promise<unknown>;expectedServer:string;observerUuid:string;targetUuid:string;targetName:string;now?:()=>number;maxAgeMs?:number}):CameraAdapter;
