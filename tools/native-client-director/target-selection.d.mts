export const BROADCAST_SELECTION_SCHEMA: 'mcvisual.broadcast-selection/v1';
export interface BroadcastSelection { mode:'auto'|'follow'|'invalid';state:string;id:string|null;target?:{name:string;uuid:string} }
export interface BroadcastSubject {name:string;priority?:number;[key:string]:unknown}
export interface BroadcastChoice {name:string;[key:string]:unknown}
export function resolveBroadcastSelection(value:unknown,native:object):BroadcastSelection;
export function broadcastEligible(selection:BroadcastSelection,names:string[]):string[];
export function broadcastSubjects<T extends BroadcastSubject>(selection:BroadcastSelection,subjects:T[]):T[];
export function broadcastChoice(selection:BroadcastSelection,choice:BroadcastChoice|null,current:string|null,currentUuid:string|null,now:number):BroadcastChoice|null;
export function broadcastAllows(selection:BroadcastSelection,choice:BroadcastChoice|null,subjects:BroadcastSubject[],current:string|null):boolean;
export function broadcastPacing(selection:BroadcastSelection,choice:BroadcastChoice|null,gate:{allow:boolean;reason:string}):{allow:boolean;reason:string};
