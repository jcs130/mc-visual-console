import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';
import {createSystemOneDecisionPort,decisionImageSize,systemOneInferenceStats} from '../../host/systemone-decisions.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await delay(10);}throw Error('condition not reached');}
const image=(width=512,height=288)=>{const b=Buffer.from([255,216,255,192,0,11,8,0,0,0,0,1,1,17,0,255,217]);b.writeUInt16BE(height,7);b.writeUInt16BE(width,9);return'data:image/jpeg;base64,'+b.toString('base64');};
const input=()=>({state:{scene:'walking'},images:[image()],questions:{action:{type:'choice',instructions:'Choose a safe complete action.',criteria:{keep:'Keep current shot',follow:'Use the verified follow shot'}}}});
const result=(choice='keep',session='stable')=>new Response(JSON.stringify({answers:{action:{choice}},inference_stats:{request_id:'request-1',session_id:session,queue_ms:2,execution_ms:8,input_tokens:501,vision:{image_count:1,encoder_ms:3,cache_hit:true}}}),{headers:{'Content-Type':'application/json'}});
const config=extra=>({endpoint:'http://127.0.0.1:4000/v1/systemone',apiKey:'private-key-never-log',sessionId:'stable',...extra});

test('explicit factory does not perform IO; top-level images and multiple questions share one authenticated POST',async()=>{
 const sent=[],metrics=[];const p=createSystemOneDecisionPort(config({onMetrics:x=>metrics.push(x),fetchImpl:async(url,o)=>{sent.push({url,...o});const body=JSON.parse(o.body);return new Response(JSON.stringify({answers:Object.fromEntries(Object.keys(body.questions).map(k=>[k,{choice:'keep'}])),inference_stats:{request_id:'r',session_id:'stable',input_tokens:510,vision:true}}));}}));
 assert.equal(sent.length,0);const q=input();q.questions.continuity=structuredClone(q.questions.action);
 const r=await p.request(q);assert.equal(sent.length,1);assert.equal(sent[0].headers.Authorization,'Bearer private-key-never-log');
 assert.equal(sent[0].headers['X-LiteLLM-Session-Id'],'stable');const body=JSON.parse(sent[0].body);
 assert.equal(body.model,'system1');assert.deepEqual(body.images,q.images);assert.equal(body.state.images,undefined);assert.equal(Object.keys(body.questions).length,2);
 assert.equal(r.answers.continuity.choice,'keep');assert.equal(r.usage.output_tokens,0);assert.equal(metrics[0].input_tokens,510);
 assert.equal(JSON.stringify(metrics).includes('walking'),false);assert.equal(JSON.stringify(metrics).includes('private-key'),false);assert.equal(JSON.stringify(metrics).includes('base64'),false);p.stop();
});
test('all returned choices are validated; null, foreign choices and wrong sessions never gain authority',async()=>{
 for(const choice of[null,'arbitrary_command']){const p=createSystemOneDecisionPort(config({fetchImpl:async()=>result(choice)}));assert.equal((await p.request(input())).answers.action.choice,null);p.stop();}
 const p=createSystemOneDecisionPort(config({fetchImpl:async()=>result('keep','other-session')}));assert.equal((await p.request(input())).fallbackReason,'correlation_mismatch');p.stop();
});
test('per-question text and image budgets, image count and dimensions fail before network',async()=>{
 let calls=0;const p=createSystemOneDecisionPort(config({fetchImpl:async()=>{calls++;return result();}}));
 const large=input();large.state={text:'a'.repeat(3800)};assert.equal((await p.request(large)).fallbackReason,'input_budget');
 const many=input();many.images=Array(5).fill(image(64,64));assert.equal((await p.request(many)).fallbackReason,'invalid_images');
 const wide=input();wide.images=[image(513,288)];assert.equal((await p.request(wide)).fallbackReason,'image_dimensions');
 const remote=input();remote.images=['http://not-a-fetch-target/image.jpg'];assert.equal((await p.request(remote)).fallbackReason,'invalid_image');
 assert.equal(calls,0);assert.deepEqual(decisionImageSize(image()),{width:512,height:288,bytes:17});p.stop();
});
test('four concurrent lanes are a hard bound and queued work is drained without retries',async()=>{
 const releases=[];let running=0,peak=0,calls=0;
 const p=createSystemOneDecisionPort(config({fetchImpl:async()=>{calls++;running++;peak=Math.max(peak,running);await new Promise(r=>releases.push(r));running--;return result();}}));
 const work=Array.from({length:7},()=>p.request(input()));await until(()=>calls===4);assert.equal(p.stats().active,4);assert.equal(p.stats().queued,3);
 releases.splice(0).forEach(r=>r());await until(()=>calls===7);releases.splice(0).forEach(r=>r());await Promise.all(work);
 assert.equal(peak,4);assert.equal(calls,7);assert.equal(p.stats().retries,0);p.stop();
});
test('only the latest pending frame is retained and expired queued frames are never uploaded',async()=>{
 let clock=1000;const releases=[],sent=[];const p=createSystemOneDecisionPort(config({maxConcurrency:1,now:()=>clock,fetchImpl:async(_url,o)=>{sent.push(JSON.parse(o.body));await new Promise(r=>releases.push(r));return result();}}));
 const first=p.request(input());await until(()=>sent.length===1);
 const old=p.request({...input(),state:{scene:'old'}},{frameKey:'camera',capturedAt:clock});
 const newest=p.request({...input(),state:{scene:'new'}},{frameKey:'camera',capturedAt:clock});assert.equal((await old).fallbackReason,'superseded');assert.equal(p.stats().queued,1);
 clock+=3000;releases.shift()();await first;assert.equal((await newest).fallbackReason,'queue_expired');assert.equal(sent.length,1);p.stop();
});
test('cancellation closes the real HTTP response rather than just ignoring its result',async t=>{
 let connected=false,closed=false,calls=0;
 const server=createServer((req,res)=>{calls++;req.resume();req.on('end',()=>{connected=true;res.writeHead(200,{'Content-Type':'application/json'});res.write('{"answers":');res.on('close',()=>{closed=true;});});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
 const p=createSystemOneDecisionPort(config({endpoint:`http://127.0.0.1:${server.address().port}/v1/systemone`}));const controller=new AbortController();
 const pending=p.request(input(),{signal:controller.signal});await until(()=>connected);controller.abort();
 assert.equal((await pending).fallbackReason,'cancelled');await until(()=>closed);assert.equal(calls,1);p.stop();
});
test('a timed-out uncooperative transport keeps its occupied lane and never revives after stop',async()=>{
 let release,calls=0;const p=createSystemOneDecisionPort(config({timeoutMs:15,maxConcurrency:1,maxQueued:0,fetchImpl:async()=>{calls++;await new Promise(r=>{release=r;});return result('follow');}}));
 assert.equal((await p.request(input())).fallbackReason,'timeout');assert.equal(p.stats().active,1);
 assert.equal((await p.request(input())).fallbackReason,'queue_full');p.stop();release();await until(()=>p.stats().active===0);
 assert.equal((await p.request(input())).fallbackReason,'stopped');assert.equal(calls,1);
});
test('newer active frames abort the prior HTTP signal; stop cancels every waiting caller',async()=>{
 const releases=[],signals=[];const p=createSystemOneDecisionPort(config({maxConcurrency:1,fetchImpl:async(_url,o)=>{signals.push(o.signal);await new Promise(r=>releases.push(r));return result();}}));
 const old=p.request(input(),{frameKey:'camera',capturedAt:Date.now()});await until(()=>signals.length===1);
 const latest=p.request(input(),{frameKey:'camera',capturedAt:Date.now()});assert.equal((await old).fallbackReason,'superseded');assert.equal(signals[0].aborted,true);
 p.stop();assert.equal((await latest).fallbackReason,'stopped');releases.shift()();await until(()=>p.stats().active===0);assert.equal(signals.length,1);
});
test('telemetry strips prompt, image, credential and arbitrary string fields',()=>{
 const s=systemOneInferenceStats({request_id:'r',session_id:'s',queue_ms:0,execution_ms:2,input_tokens:33,
 vision:{image_count:1,encoder_ms:2,encoder_calls:1,request_encoding_reuses:2,image_tokens_per_prompt:361,encoder_quantization:'int8',whole_prompt:true,prompt:'do not log',base64:'do not log',apiKey:'secret',encoder:{tokens:7,text:'no'}}});
 assert.deepEqual(s.vision,{image_count:1,encoder_ms:2,encoder_calls:1,request_encoding_reuses:2,image_tokens_per_prompt:361,encoder_quantization:'int8',whole_prompt:true,encoder:{tokens:7}});assert.equal(JSON.stringify(s).includes('secret'),false);
});
