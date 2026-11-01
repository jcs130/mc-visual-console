import {randomUUID} from 'node:crypto';

const number=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x:null;
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x)?x:null;
const error=code=>Object.assign(new Error(code),{code});
const clone=x=>structuredClone(x);
function visionMetrics(value,depth=0){
  if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
  if(!value||typeof value!=='object'||Array.isArray(value)||depth>3)return null;
  const out={};
  for(const [key,v]of Object.entries(value).slice(0,40)){
    if(key==='encoder_quantization'&&typeof v==='string'&&/^[A-Za-z0-9_.+-]{1,24}$/.test(v)){out[key]=v;continue;}
    if(!/^(?:enabled|used|cached|cache_hit|image_count|image_tokens_per_prompt|encoder_calls|request_encoding_reuses|mixed_decode_calls|whole_prompt|images|width|height|patches|tokens|input_tokens|vision_tokens|image_tokens|encoder_ms|encoding_ms|encode_ms|execution_ms|queue_ms|preprocess_ms|cache_hits|cache_misses|reused|total_ms|count|size|original_size|resized_size|embedding_tokens|image_encoding|encoder|timing|cache|per_image|processed_images|total_patches)$/.test(key))continue;
    const safe=visionMetrics(v,depth+1);if(safe!==null)out[key]=safe;
  }
  return Object.keys(out).length?out:null;
}
export function systemOneInferenceStats(raw){
  return{request_id:id(raw?.request_id),session_id:id(raw?.session_id),queue_ms:number(raw?.queue_ms),
    execution_ms:number(raw?.execution_ms),input_tokens:number(raw?.input_tokens),vision:visionMetrics(raw?.vision)};
}
/** Bounds input before HTTP; no URL downloads or image encoding are performed by the transport. */
export function decisionImageSize(data){
  const match=typeof data==='string'&&/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if(!match||match[2].length>2_800_000||match[2].length%4)throw error('invalid_image');
  const b=Buffer.from(match[2],'base64');let width,height;
  if(match[1]==='png'&&b.length>=24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){width=b.readUInt32BE(16);height=b.readUInt32BE(20);}
  else if(match[1]==='jpeg'&&b[0]===255&&b[1]===216){
    let p=2;while(p+4<=b.length){
      if(b[p++]!==255)break;while(b[p]===255)p++;const marker=b[p++];
      if(marker===217||marker===218)break;if(marker===216||marker===1||marker>=208&&marker<=215)continue;
      const length=b.readUInt16BE(p);if(length<2||p+length>b.length)break;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=8){height=b.readUInt16BE(p+3);width=b.readUInt16BE(p+5);break;}p+=length;
    }
  }
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>512||height>512)throw error('image_dimensions');
  return{width,height,bytes:b.length};
}

/** Explicit host-owned DecisionPort. Defaults: four lanes, 15s total deadline, zero retries. */
export function createSystemOneDecisionPort({endpoint,apiKey,sessionId,model='system1',maxConcurrency=4,
  timeoutMs=15000,maxQueued=4,maxQueueAgeMs=2500,maxQuestionTokens=4096,
  countTokens=text=>Buffer.byteLength(text,'utf8'),
  countImageTokens=({width,height})=>Math.ceil(width/14)*Math.ceil(height/14)+16,
  fetchImpl=globalThis.fetch,now=Date.now,onMetrics=()=>{}}={}){
  let url;try{url=new URL(endpoint);}catch{throw error('invalid_systemone_endpoint');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/v1/systemone'
    ||!id(sessionId)||!id(model)||typeof fetchImpl!=='function'||!(typeof apiKey==='string'&&apiKey||typeof apiKey==='function')
    ||!Number.isInteger(maxConcurrency)||maxConcurrency<1||maxConcurrency>4||!Number.isInteger(maxQueued)||maxQueued<0||maxQueued>16
    ||!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>15000||!Number.isFinite(maxQuestionTokens)||maxQuestionTokens<1||maxQuestionTokens>4096
    ||!Number.isFinite(maxQueueAgeMs)||maxQueueAgeMs<1||maxQueueAgeMs>15000)throw error('invalid_systemone_config');
  const active=new Set(),queue=[];let stopped=false;
  const counts={submitted:0,calls:0,completed:0,fallbacks:0,coalesced:0,cancelled:0};
  const emit=m=>{try{onMetrics(clone(m));}catch{/* Telemetry cannot grant authority or retry. */}};
  function metadata(job,status,stats){return{status,client_request_id:job.id,...(stats??systemOneInferenceStats(null)),
    session_id:stats?.session_id??sessionId,client_queue_ms:Math.max(0,(job.started??now())-job.enqueued),client_total_ms:Math.max(0,now()-job.enqueued)};}
  function settle(job,status,value,stats){
    if(job.settled)return;job.settled=true;clearTimeout(job.timer);job.signal?.removeEventListener('abort',job.abort);
    if(status==='ok')counts.completed++;else counts.fallbacks++;
    emit(metadata(job,status,stats));job.resolve(value??{answers:Object.fromEntries(job.questionIds.map(k=>[k,{choice:null}])),fallbackReason:status});
  }
  function cancel(job,status='cancelled'){
    if(job.settled)return;if(status==='superseded')counts.coalesced++;else counts.cancelled++;
    job.controller.abort(error(status));const index=queue.indexOf(job);if(index>=0)queue.splice(index,1);
    settle(job,status);drain();
  }
  async function execute(job){
    let stats;
    try{
      if(now()-job.enqueued>maxQueueAgeMs||job.capturedAt!==undefined&&now()-job.capturedAt>maxQueueAgeMs){settle(job,'queue_expired');return;}
      const key=typeof apiKey==='function'?await apiKey():apiKey;
      if(typeof key!=='string'||!key||/[\r\n]/.test(key))throw error('missing_credential');
      if(stopped||job.controller.signal.aborted)return;
      if(now()-job.enqueued>maxQueueAgeMs||job.capturedAt!==undefined&&now()-job.capturedAt>maxQueueAgeMs){settle(job,'queue_expired');return;}
      counts.calls++;job.started=now();
      const response=await fetchImpl(url.href,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+key,
        'Content-Type':'application/json','X-LiteLLM-Session-Id':sessionId,'X-Client-Request-Id':job.id},body:job.body,signal:job.controller.signal});
      if(!response.ok){await response.body?.cancel();throw error('http_'+response.status);}
      if(!response.body)throw error('empty_response');
      const reader=response.body.getReader(),parts=[];let bytes=0;
      try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>262144){await reader.cancel();throw error('response_too_large');}parts.push(value);}}
      finally{reader.releaseLock();}
      const raw=JSON.parse(Buffer.concat(parts).toString('utf8'));stats=systemOneInferenceStats(raw.inference_stats);
      if(stopped||job.controller.signal.aborted||job.settled)return;
      if(stats.session_id!==null&&stats.session_id!==sessionId){settle(job,'correlation_mismatch',null,stats);return;}
      if(job.expiresAt!==undefined&&now()>=job.expiresAt){settle(job,'expired',null,stats);return;}
      const answers={};let invalid=false;
      for(const name of job.questionIds){const choice=raw.answers?.[name]?.choice;
        if(typeof choice!=='string'||!Object.hasOwn(job.criteria[name],choice)){invalid=true;answers[name]={choice:null};}
        else answers[name]={choice};}
      const result={answers,model,latency_ms:Math.max(0,now()-job.started),inference_stats:stats,
        usage:{input_tokens:stats.input_tokens,output_tokens:number(raw.usage?.output_tokens)??0,cached_input_tokens:number(raw.usage?.cached_input_tokens)}};
      settle(job,invalid?'invalid_choice':'ok',result,stats);
    }catch(e){if(!job.settled)settle(job,stopped?'stopped':job.controller.signal.aborted?'cancelled':/^(?:http_\d{3}|missing_credential|empty_response|response_too_large)$/.test(e.code??'')?e.code:'provider_error',null,stats);}
    finally{active.delete(job);job.body=null;drain();}
  }
  function drain(){
    if(stopped)return;
    while(active.size<maxConcurrency&&queue.length){const job=queue.shift();if(job.settled)continue;active.add(job);void execute(job);}
  }
  return{
    request(input,options={}){
      const enqueued=now(),controller=new AbortController(),questionIds=Object.keys(input?.questions??{});
      let resolve;const promise=new Promise(r=>{resolve=r;});
      const job={id:randomUUID(),enqueued,controller,questionIds,criteria:{},resolve,settled:false,signal:options.signal,
        frameKey:options.frameKey,capturedAt:options.capturedAt,expiresAt:options.expiresAt};counts.submitted++;
      if(stopped){settle(job,'stopped');return promise;}
      if(options.signal?.aborted){settle(job,'cancelled');return promise;}
      try{
        if(!input||!questionIds.length||questionIds.length>8||questionIds.some(k=>!id(k)))throw error('invalid_questions');
        const images=input.images??[];if(!Array.isArray(images)||images.length>4)throw error('invalid_images');
        const imageCost=images.map(decisionImageSize).reduce((sum,size)=>{const n=countImageTokens(size);if(number(n)===null)throw error('invalid_image_budget');return sum+n;},0);
        const questions={};
        for(const name of questionIds){
          const q=input.questions[name];if(q?.type!=='choice'||typeof q.instructions!=='string'||!q.instructions||!q.criteria||typeof q.criteria!=='object'||Array.isArray(q.criteria))throw error('invalid_question');
          const entries=Object.entries(q.criteria);if(!entries.length||entries.length>16||entries.some(([k,v])=>!id(k)||typeof v!=='string'||!v))throw error('invalid_criteria');
          questions[name]={type:'choice',instructions:q.instructions,criteria:{...q.criteria}};job.criteria[name]=questions[name].criteria;
          const textCost=countTokens(JSON.stringify({state:input.state,questions:{[name]:questions[name]}}));
          if(number(textCost)===null||textCost+imageCost>maxQuestionTokens)throw error('input_budget');
        }
        if(options.frameKey!==undefined&&(!id(options.frameKey)||!Number.isFinite(job.capturedAt)||job.capturedAt>enqueued+1000))throw error('invalid_frame');
        if(job.expiresAt!==undefined&&(!Number.isFinite(job.expiresAt)||job.expiresAt<=enqueued))throw error('expired');
        job.body=JSON.stringify({model,state:input.state,questions,...(images.length?{images:[...images]}:{})});
        if(Buffer.byteLength(job.body)>4*1024*1024)throw error('request_too_large');
      }catch(e){settle(job,e.code??'invalid_input');return promise;}
      if(job.frameKey)for(const old of [...queue,...active])if(old.frameKey===job.frameKey&&!old.settled)cancel(old,'superseded');
      if(active.size>=maxConcurrency&&queue.length>=maxQueued){settle(job,'queue_full');return promise;}
      const limit=Math.min(timeoutMs,Number.isFinite(options.timeoutMs)?Math.max(1,options.timeoutMs):timeoutMs,
        job.expiresAt===undefined?Infinity:job.expiresAt-enqueued);
      job.abort=()=>cancel(job,'cancelled');job.signal?.addEventListener('abort',job.abort,{once:true});
      job.timer=setTimeout(()=>cancel(job,'timeout'),limit);
      queue.push(job);drain();return promise;
    },
    stop(){if(stopped)return;stopped=true;for(const job of [...queue,...active])cancel(job,'stopped');queue.length=0;},
    stats(){return{...counts,active:active.size,queued:queue.length,stopped,maxConcurrency,timeoutMs,retries:0};},
  };
}
