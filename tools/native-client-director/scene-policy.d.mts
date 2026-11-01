export interface SceneSubjectCandidate {name:string;kind:string;at:number;score?:number;priority?:number;waitingMs?:number;lastShownAt?:number|null;airtimeMs?:number;visits?:number;motionState?:'unknown'|'stationary'|'recent_sample';positionAt?:number|null;protected?:boolean;current?:boolean;dwellMs?:number}
export interface SceneChoice extends SceneSubjectCandidate {view:string;reason?:string;reframe?:boolean;forceSubjectReview?:boolean;subjectPool?:string[]}
export class SceneSelector {
 constructor(names:string[],options?:{minDwellMs?:number;maxDwellMs?:number;cinematicFraming?:boolean});
 readonly minDwellMs:number;readonly maxDwellMs:number;
 setAvailable(names:string[]|null):void;
 observe(name:string,event:Record<string,any>,now?:number):void;
 observePosition(name:string,sample:{at:number;position:number[];scope:string;source?:string},now?:number):void;
 observeProgram(name:string,sample:{at:number;scope:string},now?:number):void;
 subjectCandidates(current:string|null,currentSince:number,now?:number):SceneSubjectCandidate[];
 choose(current:string|null,currentSince:number,now?:number,currentView?:string|null):SceneChoice|null;
 inspect(now?:number):Array<{name:string;available:boolean|null;positionAt:number|null;motion:string;stillSince:number|null;lastShownAt:number|null;airtimeMs:number;lastSpeechAt:number|null;lastMotionAt:number|null;lastCombatAt:number|null;lastInteractionAt:number|null}>;
}
export function belongsToActor(name:string,event:Record<string,any>):boolean;
export function eventActor(sourceName:string,event:Record<string,any>,allowed:string[]):string|null;
export function classifyEvent(event:Record<string,any>,now?:number):{at:number;score:number;kind:string}|null;
