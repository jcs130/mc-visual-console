import type {CameraScript} from './camera-script.mjs';
export interface NativeCameraChoice {name:string;view:string;kind:string;at?:number;id?:string;motion?:CameraScript;[key:string]:unknown}
export function nativeCameraCandidates(choice:NativeCameraChoice,native:Record<string,any>,options?:{now?:number}):Array<NativeCameraChoice&{id:string}>;
export interface BallotSelection {kind:'keep'|'use';reason?:string;choice?:NativeCameraChoice;scores?:Record<string,number>;entropy?:number;margin?:number;source?:'probabilities'|'hard_choices'}
export function selectCameraBallot(options:Array<{id:string;name?:string;view?:string;motion?:CameraScript}>,votes?:Array<{role:string;choice:string;probabilities?:Record<string,number>}>,previous?:Record<string,number>):BallotSelection;
export class NativeCameraPacing {constructor(options:{now?:()=>number;currentView:(native:any)=>string});observe(native:any):void;check(choice:NativeCameraChoice,native:any,options?:{activity?:Array<{name:string;lastCombatAt?:number|null;motion?:string;stillSince?:number|null}>;/** Host-verified native target loss only. */recovery?:boolean}):{allow:boolean;reason:string};stop():void}
