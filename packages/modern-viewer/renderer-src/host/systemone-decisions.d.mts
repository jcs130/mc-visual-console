import type {CameraDecisionPort} from './broadcast-decisions.mjs';
export interface SystemOneInferenceStats {request_id:string|null;session_id:string|null;queue_ms:number|null;execution_ms:number|null;input_tokens:number|null;vision:unknown}
export interface SystemOneRequestOptions {provider?:string;signal?:AbortSignal;timeoutMs?:number;frameKey?:string;capturedAt?:number;expiresAt?:number}
export interface SystemOneDecisionPort extends CameraDecisionPort {
 request(input:Parameters<CameraDecisionPort['request']>[0],options?:SystemOneRequestOptions):Promise<Awaited<ReturnType<CameraDecisionPort['request']>>&{inference_stats?:SystemOneInferenceStats;fallbackReason?:string}>;
 stop():void;
 stats():{submitted:number;calls:number;completed:number;fallbacks:number;coalesced:number;cancelled:number;active:number;queued:number;stopped:boolean;maxConcurrency:number;timeoutMs:number;retries:number};
}
export function systemOneInferenceStats(raw:unknown):SystemOneInferenceStats;
export function decisionImageSize(data:string):{width:number;height:number;bytes:number};
export function createSystemOneDecisionPort(options:{endpoint:string;apiKey:string|(()=>string|Promise<string>);sessionId:string;model?:string;
 maxConcurrency?:number;timeoutMs?:number;maxQueued?:number;maxQueueAgeMs?:number;maxQuestionTokens?:number;
 countTokens?:(text:string)=>number;countImageTokens?:(size:{width:number;height:number;bytes:number})=>number;
 fetchImpl?:typeof fetch;now?:()=>number;onMetrics?:(metadata:SystemOneInferenceStats&{status:string;client_request_id:string;client_queue_ms:number;client_total_ms:number})=>void}):SystemOneDecisionPort;
