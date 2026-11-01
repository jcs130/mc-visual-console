export interface NativeVisionFrame {kind:'frame';images:string[];revision:string;capturedAt:number;width:number;height:number;scope:string;targetUuid:string;cameraRequestId:string}
export function createNativeVisionSource(options:{readNative:()=>Promise<unknown>;writeRequest:(request:Record<string,unknown>,options:{signal:AbortSignal})=>Promise<void>;readReceipt:()=>Promise<unknown>;readImage:(name:'frame.jpg')=>Promise<Uint8Array>;expectedServer:string;observerUuid:string;now?:()=>number;timeoutMs?:number;pollMs?:number}):{
 capture(options?:{signal?:AbortSignal;maxWidth?:number;maxHeight?:number}):Promise<NativeVisionFrame|{kind:'unavailable';reason:string}>;
 stop():void;
};
