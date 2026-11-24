export interface ContentScope {instanceId:string;epoch:number;server:string;recipientUuid:string;subjectUuid:string;entityId:number;dimension:string}
export interface ContentRow {label:string;text:string;tone:'info'|'muted'|'active'|'success'|'warning'|'error';progress?:number}
export interface ContentPanel {id:string;title:string;anchor:'bottom_left'|'bottom_right'|'top_left'|'top_right';width:number;bottomInset:number;rows:ContentRow[]}
export function normalizeContentScope(value:unknown):ContentScope|null;
export function normalizeContentPanels(value:unknown):ContentPanel[];
export function createClientContentStream(options:{WebSocketServer:new(...args:any[])=>any;server:{on(event:'upgrade',listener:(...args:any[])=>void):unknown;off(event:'upgrade',listener:(...args:any[])=>void):unknown};path?:string;getPanels:(context:{scope:ContentScope;subjectName:string;signal:AbortSignal})=>ContentPanel[]|Promise<ContentPanel[]>;authorizeScope?:(scope:ContentScope)=>boolean;authorizeConnection?:(request:any)=>boolean;intervalMs?:number;now?:()=>number}):{stats():{connections:number;sent:number;rejected:number;skipped:number;stopped:boolean};close():Promise<void>};
