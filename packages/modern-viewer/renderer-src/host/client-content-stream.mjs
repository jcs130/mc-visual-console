import {randomUUID} from 'node:crypto';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const opaque=(v,n=100)=>typeof v==='string'&&v.length<=n&&/^[A-Za-z0-9_.:-]+$/.test(v);
const keys=(v,allowed)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>allowed.includes(k));
const text=(v,n)=>typeof v==='string'?v.replace(/[\p{Cc}\p{Cf}§]/gu,' ').slice(0,n).trim():null;
export function normalizeContentScope(v){
 if(!keys(v,['instanceId','epoch','server','recipientUuid','subjectUuid','entityId','dimension'])||!opaque(v.instanceId)
  ||!Number.isSafeInteger(v.epoch)||v.epoch<0||typeof v.server!=='string'||!v.server||v.server.length>255
  ||!uuid(v.recipientUuid)||!uuid(v.subjectUuid)||!Number.isSafeInteger(v.entityId)||v.entityId<0||v.entityId>2147483647
  ||typeof v.dimension!=='string'||!/^[-\w.:/]{1,128}$/.test(v.dimension))return null;
 return{instanceId:v.instanceId,epoch:v.epoch,server:v.server,recipientUuid:v.recipientUuid,subjectUuid:v.subjectUuid,entityId:v.entityId,dimension:v.dimension};
}
export function normalizeContentPanels(panels){
 if(!Array.isArray(panels)||panels.length>3)throw Error('content_panel_limit');
 const ids=new Set(),anchors=new Set();let count=0;
 return panels.map(p=>{
  if(!keys(p,['id','title','anchor','width','bottomInset','rows'])||!opaque(p.id,48)||ids.has(p.id)||anchors.has(p.anchor)
   ||!['bottom_left','bottom_right','top_left','top_right'].includes(p.anchor)||typeof p.title!=='string'||p.title.length>144
   ||!Number.isInteger(p.width)||p.width<100||p.width>260||!Number.isInteger(p.bottomInset)||p.bottomInset<0||p.bottomInset>160
   ||!Array.isArray(p.rows)||p.rows.length>8||(count+=p.rows.length)>16)throw Error('content_panel_invalid');
  ids.add(p.id);anchors.add(p.anchor);
  const rows=p.rows.map(r=>{
   if(!keys(r,['label','text','tone','progress'])||typeof r.label!=='string'||r.label.length>48||typeof r.text!=='string'||r.text.length>440
    ||!['info','muted','active','success','warning','error'].includes(r.tone)||r.progress!==undefined&&(!Number.isFinite(r.progress)||r.progress<0||r.progress>1))throw Error('content_row_invalid');
   return{label:text(r.label,24),text:text(r.text,220),tone:r.tone,...(r.progress===undefined?{}:{progress:r.progress})};
  });
  return{id:p.id,title:text(p.title,72),anchor:p.anchor,width:p.width,bottomInset:p.bottomInset,rows};
 });
}
/** Transport only. The caller supplies its existing ws server class and trusted projection. */
export function createClientContentStream({WebSocketServer,server,path='/content',getPanels,authorizeScope=()=>true,
 authorizeConnection=req=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress),intervalMs=500,now=Date.now}={}){
 if(typeof WebSocketServer!=='function'||!server||typeof getPanels!=='function'||intervalMs<250||intervalMs>2000||!/^\/[\w/-]+$/.test(path))throw Error('explicit_content_stream_required');
 const wss=new WebSocketServer({noServer:true,maxPayload:8192,perMessageDeflate:false}),clients=new Map(),producer='content:'+randomUUID();
 let stopped=false,sent=0,rejected=0,skipped=0;
 const upgrade=(req,socket,head)=>{
  let allowed=false;try{allowed=!stopped&&req.url===path&&clients.size<4&&authorizeConnection(req)===true;}catch{}
  if(!allowed){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
 };
 server.on('upgrade',upgrade);
 async function tick(ws,row){
  if(stopped||!row.scope||row.busy||ws.readyState!==1)return;
  if(ws.bufferedAmount>65536){skipped++;return;}
  const revision=row.revision,scope=row.scope,controller=new AbortController();row.busy=true;row.controller=controller;
  try{
   const panels=normalizeContentPanels(await getPanels({scope,subjectName:row.subjectName,signal:controller.signal}));
   if(stopped||controller.signal.aborted||!clients.has(ws)||row.revision!==revision||ws.readyState!==1)return;
   const issuedAt=now(),frame={schema:'mcvisual.content/v1',scope,producer,sequence:++row.sequence,issuedAt,expiresAt:issuedAt+3500,panels};
   const data=JSON.stringify(frame);if(Buffer.byteLength(data)>32768)throw Error('content_frame_limit');ws.send(data);sent++;
  }catch{if(!controller.signal.aborted){row.errors++;if(ws.readyState===1&&row.errors>=3)ws.close(1011,'projection unavailable');}}
  finally{row.busy=false;if(row.controller===controller)row.controller=null;}
 }
 wss.on('connection',ws=>{
  const row={scope:null,subjectName:'',sequence:0,subscription:-1,revision:0,busy:false,controller:null,errors:0};clients.set(ws,row);
  ws.on('message',(data,binary)=>{
   try{
    if(binary||data.length>8192)throw Error('message_limit');
    const v=JSON.parse(data.toString('utf8'));
    if(!keys(v,['schema','scope','sequence','subjectName','capabilities'])||v.schema!=='mcvisual.subscribe/v1'
     ||!Number.isSafeInteger(v.sequence)||v.sequence<=row.subscription||typeof v.subjectName!=='string'||v.subjectName.length>128
     ||JSON.stringify(v.capabilities)!=='["panels/v1"]')throw Error('subscribe_schema');
    const scope=v.scope===null?null:normalizeContentScope(v.scope);if(v.scope!==null&&!scope||scope&&authorizeScope(scope)!==true)throw Error('scope_forbidden');
    row.controller?.abort();row.revision++;row.scope=scope;row.subjectName=v.subjectName;row.subscription=v.sequence;row.errors=0;void tick(ws,row);
   }catch{rejected++;ws.close(1008,'invalid subscription');}
  });
  ws.on('error',()=>{});ws.on('close',()=>{row.controller?.abort();clients.delete(ws);});
 });
 const timer=setInterval(()=>{for(const [ws,row]of clients)void tick(ws,row);},intervalMs);timer.unref?.();
 return{stats:()=>({connections:clients.size,sent,rejected,skipped,stopped}),
  async close(){if(stopped)return;stopped=true;clearInterval(timer);server.off('upgrade',upgrade);for(const [ws,row]of clients){row.controller?.abort();ws.terminate();}clients.clear();await new Promise(r=>wss.close(r));},
 };
}
