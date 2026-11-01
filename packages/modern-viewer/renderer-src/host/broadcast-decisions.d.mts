export const CAMERA_CHOICE_PROTOCOL:'mcvisual.director-choice/v1';
export type CameraJudgeRole='story'|'action'|'space'|'composition'|'motion'|'continuity';
export type CameraPlanMotion='hold'|'follow'|'native_pov'|'orbit_arc'|'push_in'|'pull_out'|'pedestal'|'truck';
export interface CompleteCameraPlan {subjectUuid:string;sourceId:string;shotId:string;motion:CameraPlanMotion;axisKey?:string;axisSide?:string}
export interface CameraQuality {visibility:number;action:number;interest:number;composition:number;stability:number}
export type CameraActivityKind='idle'|'combat'|'dungeon'|'fishing'|'crafting'|'interaction'|'conversation'|'travel'|'gathering'|'building'|'unknown';
export interface CameraActivity {kind:CameraActivityKind;at:number;since:number;lastProgressAt:number;critical?:boolean;provenance:'native'|'game';evidenceId:string}
export interface ObservedCameraSubject {uuid:string;scope:string;at:number;loaded:boolean;alive:boolean;provenance?:'native'|'web';evidenceId?:string;activity?:CameraActivity}
export interface OfferedCameraPlan extends CompleteCameraPlan {id:string;scope:string;at:number;ready:boolean;quality:CameraQuality;evidenceIds:string[];pathClear?:boolean;collisionReady?:boolean;requiresFloorMask?:boolean;floorSafe?:boolean;axisBridge?:boolean}
export interface ObservedCameraProgram {phase:'idle'|'accepted'|'transitioning'|'unknown'|'stopped'|'applied';operationId?:string;plan?:CompleteCameraPlan;quality?:CameraQuality;rendered?:boolean;renderedAt?:number;appliedAt?:number;transitionActive?:boolean;occlusionObservedMs?:number;visibilityProvenance?:'native'|'web';visibilityEvidenceId?:string}
export interface CameraDecisionObservation {scope:string;generation:string;at:number;sceneKey:string;manualLocked?:boolean;program:ObservedCameraProgram;subjects:ObservedCameraSubject[];shots:OfferedCameraPlan[];facts?:Array<{key:string;text:string;archiveRef:string}>}
export interface CameraDecisionPacket {schema:typeof CAMERA_CHOICE_PROTOCOL;scope:string;generation:string;revision:string;observedAt:number;manualLocked:boolean;program:ObservedCameraProgram;options:Array<{id:string;plan:CompleteCameraPlan|null;quality:CameraQuality;evidenceIds:string[];ruleScore:number}>;facts:Array<{key:string;text:string;truncated:boolean;archiveRef:string}>;activities?:Array<CameraActivity&{subjectUuid:string}>;excluded:Array<{id:string;reason:string}>;emergency:'target_lost'|'persistent_occlusion'|null}
export interface CameraJudgeVotes {kind:'votes';schema:typeof CAMERA_CHOICE_PROTOCOL;scope:string;generation:string;revision:string;at:number;votes:Array<{role:CameraJudgeRole;choice:string}>}
export interface CameraJudgeSkip {kind:'skipped';reason:string}
/** Structural compatibility with agent-mc-world/contracts DecisionPort. No runtime dependency in the visualization. */
export interface CameraDecisionPort {request(input:{state:unknown;questions:Record<string,{type:'choice';instructions:string;criteria:Record<string,string>}>},options?:{provider?:string;signal?:AbortSignal;timeoutMs?:number}):Promise<{answers:Record<string,unknown>;model?:string;latency_ms?:number;usage?:{input_tokens:number|null;output_tokens:number|null;cached_input_tokens:number|null}}>}
export const CAMERA_JUDGES:ReadonlyArray<{id:CameraJudgeRole;weight:number;instructions:string}>;
export function buildCameraDecision(observed:CameraDecisionObservation,options?:{now?:number;maxAgeMs?:number}):CameraDecisionPacket;
export function createCameraJudgePanel(decisions?:CameraDecisionPort|null,options?:{now?:()=>number;timeoutMs?:number;minIntervalMs?:number;maxCallsPerMinute?:number;maxAgeMs?:number;contextTokens?:number;reserveOutputTokens?:number;prefixTokens?:number;toolDescriptionTokens?:number;countTokens?:(text:string)=>number;provider?:string;onAudit?:(event:unknown)=>void}):{
 judge(packet:CameraDecisionPacket,options?:{roles?:CameraJudgeRole[];signal?:AbortSignal}):Promise<CameraJudgeVotes|CameraJudgeSkip>;
 stop():void;stats():{calls:number;timeouts:number;invalid:number;errors:number;inputTokens:number;outputTokens:number;latencyMs:number;busy:boolean;stopped:boolean};
};
export const CAMERA_PACING_DEFAULTS:Readonly<{minShotMs:number;minSubjectMs:number;returnSubjectMs:number;creativeCooldownMs:number;sustainMs:number;improvement:number;modelWeight:number;cutsPerMinute:number;subjectsPerMinute:number;emergencyGapMs:number;maxAgeMs:number;idleAfterMs:number;idleScorePenalty:number;combatSubjectMs:number;dungeonSubjectMs:number;engagementGraceMs:number}>;
export interface CameraRecommendation {kind:'recommendation';schema:typeof CAMERA_CHOICE_PROTOCOL;choice:string;recommendationId:string;scope:string;generation:string;revision:string;observedAt:number;plan:CompleteCameraPlan;holdMs:number;reason:string;requiresFreshExecutionCheck:true}
export class CameraChoiceArbiter {
 constructor(options?:Partial<typeof CAMERA_PACING_DEFAULTS>&{now?:()=>number});
 decide(packet:CameraDecisionPacket,ballots?:CameraJudgeVotes|CameraJudgeSkip):CameraRecommendation|{kind:'keep';choice:'keep';reason:string};
 stop():void;
}
