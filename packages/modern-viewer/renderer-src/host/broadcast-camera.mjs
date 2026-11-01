import { randomUUID } from 'node:crypto';

/** Display-only host API. The host supplies decisions; this module never calls a model. */
export const CAMERA_PROTOCOL = 'mcvisual.camera/v1';
/** Explicit knowledge read; these recipes do not grant native backend capabilities. */
export async function loadCameraShotLibrary() {
  const {readFile}=await import('node:fs/promises');
  return JSON.parse(await readFile(new URL('../../../../docs/skills/live-game-director/references/shot-library.json',import.meta.url),'utf8'));
}
export function mapCameraRecipes(observed,library) {
  return library.recipes.map(recipe=>({recipeId:recipe.id,
    shotIds:observed.shots.filter(shot=>shot.available===true&&shot.recipeId===recipe.id).map(shot=>shot.id)}));
}
export const CAMERA_TOOLS = Object.freeze([
  {name:'broadcast_camera_query',description:'Read fresh camera capabilities, observed subject, ownership and native operation state.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'broadcast_camera_take',description:'Submit a bounded shot with a stable actionId and the current lease. Acceptance is not completion; query the original result.',inputSchema:{type:'object',properties:{actionId:{type:'string'},lease:{type:'string'},shot:{type:'string'},holdMs:{type:'integer',minimum:10000,maximum:120000},reason:{type:'string',maxLength:240}},required:['actionId','lease','shot','holdMs'],additionalProperties:false}},
  {name:'broadcast_camera_result',description:'Reconcile one original actionId against fresh native evidence; never reissue an unknown action.',inputSchema:{type:'object',properties:{actionId:{type:'string'}},required:['actionId'],additionalProperties:false}},
  {name:'broadcast_camera_cancel',description:'Cancel the original camera action. Only a matching native cancellation acknowledgement establishes cancellation.',inputSchema:{type:'object',properties:{actionId:{type:'string'},lease:{type:'string'}},required:['actionId','lease'],additionalProperties:false}},
]);
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,72}$/.test(value);
const terminal = phase => ['applied','cancelled','rejected'].includes(phase);
const binding = o => JSON.stringify([o.scope,o.subjectUuid]);
const clone = value => structuredClone(value);
const fail = code => { throw Object.assign(new Error(code), {code}); };

export class CameraDirector {
  constructor(adapter,{now=Date.now,maxAgeMs=3000,minHoldMs=10000}={}) {
    this.adapter=adapter;this.now=now;this.maxAgeMs=maxAgeMs;this.minHoldMs=Math.max(10000,minHoldMs);
    this.records=new Map();this.pending=null;this.current=null;this.lease=null;
    this.owner=null;this.stopped=false;this.manual=false;this.generation=0;this.holdUntil=0;this.inflight=new Map();
  }
  async observe() {
    const o=await this.adapter.observe();
    if(o?.schema!==CAMERA_PROTOCOL||!Number.isFinite(o.at)||o.at>this.now()+1000||this.now()-o.at>this.maxAgeMs)fail('STALE_CAMERA_OBSERVATION');
    if(typeof o.scope!=='string'||!o.scope||typeof o.subjectUuid!=='string'||!Array.isArray(o.shots)||o.shots.length>16)fail('INVALID_CAMERA_OBSERVATION');
    return o;
  }
  claim(owner) {
    if(this.stopped)fail('DIRECTOR_STOPPED');if(this.manual)fail('MANUAL_LOCKED');
    if(!id(owner))fail('INVALID_OWNER');if(this.lease)fail('CAMERA_ALREADY_OWNED');
    this.owner=owner;this.lease=randomUUID();this.generation++;return {owner,lease:this.lease};
  }
  async query() {
    const observed=await this.observe();
    return {schema:CAMERA_PROTOCOL,observed,owner:this.owner,lease:this.lease,manualLocked:this.manual,stopped:this.stopped,
      pending:this.pending,current:this.current,holdUntil:this.holdUntil};
  }
  async take(plan) {
    if(plan&&Object.keys(plan).some(key=>!['actionId','lease','shot','holdMs','reason'].includes(key)))fail('INVALID_CAMERA_PLAN');
    if(!plan||!id(plan.actionId)||!id(plan.lease)||typeof plan.shot!=='string'||!Number.isInteger(plan.holdMs)||plan.holdMs<this.minHoldMs||plan.holdMs>120000||typeof (plan.reason??'')!=='string'||(plan.reason??'').length>240)fail('INVALID_CAMERA_PLAN');
    const canonical=JSON.stringify({shot:plan.shot,holdMs:plan.holdMs,reason:plan.reason??'',lease:plan.lease});
    const old=this.records.get(plan.actionId);
    if(old){if(old.canonical!==canonical)fail('ACTION_ID_CONFLICT');return this.result(plan.actionId);}
    if(this.stopped)fail('DIRECTOR_STOPPED');if(this.manual)fail('MANUAL_LOCKED');
    if(!this.lease||plan.lease!==this.lease)fail('CAMERA_LEASE_MISMATCH');
    if(this.pending)fail('CAMERA_OPERATION_PENDING');if(this.now()<this.holdUntil)fail('CAMERA_MINIMUM_HOLD');
    const generation=this.generation, observed=await this.observe();
    if(generation!==this.generation||this.stopped||this.manual)fail('CAMERA_OWNERSHIP_CHANGED');
    const raced=this.records.get(plan.actionId);
    if(raced){if(raced.canonical!==canonical)fail('ACTION_ID_CONFLICT');return this.result(plan.actionId);}
    if(this.pending)fail('CAMERA_OPERATION_PENDING');
    if(this.now()<this.holdUntil)fail('CAMERA_MINIMUM_HOLD');
    const shot=observed.shots.find(x=>x.id===plan.shot&&x.available===true);
    if(!shot)fail('SHOT_UNAVAILABLE');if(observed.manualControl)fail('NATIVE_MANUAL_CONTROL');
    if(shot.projection!==undefined&&!['perspective','orthographic'].includes(shot.projection))fail('INVALID_SHOT_PROJECTION');
    if(shot.projectionProfile!==undefined&&(!id(shot.projectionProfile)||shot.projection===undefined))fail('INVALID_SHOT_PROJECTION_PROFILE');
    if(shot.projection==='orthographic'&&(!id(shot.projectionProfile)||shot.projectionReady!==true))fail('SHOT_PROJECTION_UNAVAILABLE');
    if(this.records.size>=256)fail('CAMERA_SESSION_ARCHIVE_REQUIRED');
    const operation={schema:CAMERA_PROTOCOL,actionId:plan.actionId,lease:plan.lease,
      scope:observed.scope,subjectUuid:observed.subjectUuid,shot:plan.shot,
      issuedAt:this.now(),expiresAt:this.now()+10000,holdMs:plan.holdMs,reason:plan.reason??''};
    if(shot.projection!==undefined)operation.projection=shot.projection;
    if(shot.projectionProfile!==undefined)operation.projectionProfile=shot.projectionProfile;
    const record={operation,canonical,binding:binding(observed),phase:'accepted',acceptedAt:this.now(),completedAt:null};
    this.records.set(plan.actionId,record);this.pending=plan.actionId;
    // Reserve the unique writer before the asynchronous adapter is called.
    const controller=new AbortController();this.inflight.set(plan.actionId,controller);
    try { await this.adapter.submit(clone(operation),{signal:controller.signal}); }
    catch {record.phase='unknown';}
    finally{this.inflight.delete(plan.actionId);}
    if(generation!==this.generation&&!terminal(record.phase))record.phase='unknown';
    return clone(record);
  }
  async result(actionId) {
    const record=this.records.get(actionId);if(!record)fail('UNKNOWN_CAMERA_ACTION');
    if(terminal(record.phase))return clone(record);
    const observed=await this.observe();
    if(binding(observed)!==record.binding){record.phase='unknown';return clone(record);}
    const receipt=observed.receipt;
    if(receipt?.actionId===actionId&&receipt.lease===record.operation.lease) {
      if(receipt.phase==='applied'&&receipt.rendered===true) {
        if(record.operation.projection!==undefined&&(receipt.projection!==record.operation.projection
          ||record.operation.projectionProfile!==undefined&&receipt.projectionProfile!==record.operation.projectionProfile)){
          record.phase='unknown';record.verificationError='PROJECTION_EVIDENCE_MISMATCH';return clone(record);
        }
        record.phase='applied';record.completedAt=this.now();record.evidence=clone(receipt);
        delete record.verificationError;
        this.current={shot:record.operation.shot,actionId,scope:record.operation.scope,subjectUuid:record.operation.subjectUuid};
        if(record.operation.projection!==undefined)this.current.projection=record.operation.projection;
        if(record.operation.projectionProfile!==undefined)this.current.projectionProfile=record.operation.projectionProfile;
        this.holdUntil=this.now()+record.operation.holdMs;
      } else if(['cancelled','rejected'].includes(receipt.phase)) {
        record.phase=receipt.phase;record.completedAt=this.now();record.evidence=clone(receipt);
      } else if(receipt.phase==='transitioning')record.phase='transitioning';
      else if(receipt.phase==='unknown'){record.phase='unknown';record.evidence=clone(receipt);}
      if(terminal(record.phase)&&this.pending===actionId)this.pending=null;
    } else if(this.now()>record.operation.expiresAt)record.phase='unknown';
    return clone(record);
  }
  async wait(actionId,{signal,timeoutMs=10000,pollMs=100}={}) {
    const deadline=this.now()+Math.min(30000,Math.max(0,timeoutMs));
    for(;;) {
      if(signal?.aborted)throw Object.assign(new Error('WAIT_ABORTED_OPERATION_UNCHANGED'),{name:'AbortError'});
      const value=await this.result(actionId);if(terminal(value.phase)||value.phase==='unknown'||this.now()>=deadline)return value;
      await new Promise((resolve,reject)=>{
        const done=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);resolve();};
        const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(Object.assign(new Error('WAIT_ABORTED_OPERATION_UNCHANGED'),{name:'AbortError'}));};
        const timer=setTimeout(done,pollMs);signal?.addEventListener('abort',abort,{once:true});
        if(signal?.aborted)abort();
      });
    }
  }
  async cancel(actionId,lease) {
    const record=this.records.get(actionId);if(!record)fail('UNKNOWN_CAMERA_ACTION');
    if(lease!==record.operation.lease)fail('CAMERA_LEASE_MISMATCH');
    if(terminal(record.phase))return clone(record);
    if(typeof this.adapter.cancel!=='function')fail('NATIVE_CANCEL_UNAVAILABLE');
    try{await this.adapter.cancel(clone(record.operation));}catch{record.phase='unknown';return clone(record);}
    return this.result(actionId);
  }
  async handoverToManual() {
    this.manual=true;this.generation++;this.lease=null;this.owner=null;
    for(const controller of this.inflight.values())controller.abort();
    if(this.pending){const r=this.records.get(this.pending);await this.cancel(this.pending,r.operation.lease);}
    return {manualLocked:true,pending:this.pending};
  }
  resumeFromManual() {
    if(this.stopped)fail('DIRECTOR_STOPPED');if(this.pending)fail('CAMERA_OPERATION_PENDING');
    this.manual=false;this.generation++;return {manualLocked:false};
  }
  async stop() { this.stopped=true;await this.handoverToManual();return {stopped:true,pending:this.pending}; }
}

/** Tool transports and the SDK deliberately share this one dispatcher. */
export async function callCameraTool(director,name,input={}) {
  switch(name) {
    case 'broadcast_camera_query':return director.query();
    case 'broadcast_camera_take':return director.take(input);
    case 'broadcast_camera_result':return director.result(input.actionId);
    case 'broadcast_camera_cancel':return director.cancel(input.actionId,input.lease);
    default:fail('UNKNOWN_CAMERA_TOOL');
  }
}

/** Optional deterministic host fallback. Pass fresh structured facts, never chat assertions. */
export function suggestFallbackShot(observed) {
  const available=new Set(observed.shots.filter(x=>x.available===true).map(x=>x.id));
  const preference=observed.activity==='combat'?['perspective','close','isometric']:
    observed.activity==='building'?['overview','isometric','top']:['isometric','overview','perspective'];
  return preference.find(x=>available.has(x))??null;
}
