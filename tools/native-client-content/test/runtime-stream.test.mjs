import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
const {WebSocketServer}=createRequire(import.meta.url)(process.env.MCVISUAL_TEST_WS_MODULE||'ws');
const reports=JSON.parse(process.env.MCVISUAL_CONTENT_BUILD_REPORTS||'[]');
if(!reports.length)throw Error('Explicit MCVISUAL_CONTENT_BUILD_REPORTS JSON array required; no silent skip');
const jdk=process.env.MCVISUAL_TEST_JAVA_HOME;if(!jdk)throw Error('Explicit MCVISUAL_TEST_JAVA_HOME required');
const exe=name=>path.join(jdk,'bin',name+(process.platform==='win32'?'.exe':''));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await delay(15);}throw Error('Timed out: '+label);}
async function cleanup(directory){
 const absolute=path.resolve(directory);
 assert.equal(path.dirname(absolute),path.resolve(tmpdir()));assert.ok(path.basename(absolute).startsWith('mcvisual-content-'));
 await fs.rm(absolute,{recursive:true,force:true});
}
for(const file of reports){
 const report=JSON.parse(await fs.readFile(file,'utf8'));
 test(report.loader+' packaged stream: scope, real WebSocket, hide/expiry, disconnect and stop',async()=>{
  const directory=await fs.mkdtemp(path.join(tmpdir(),'mcvisual-content-stream-'));
  const gson=report.classpath.filter(p=>/^gson-[0-9].*\.jar$/.test(path.basename(p)));assert.equal(gson.length,1);
  const cp=[directory,report.artifact,...gson].join(path.delimiter);
  const fixture=fileURLToPath(new URL('./ContentRuntimeFixture.java',import.meta.url));
  execFileSync(exe('javac'),['--release','21','-proc:none','-encoding','UTF-8','-classpath',cp,'-d',directory,fixture],{windowsHide:true,stdio:'pipe'});
  const http=createServer((req,res)=>res.writeHead(404).end()),ws=new WebSocketServer({server:http});
  let connections=0,peer,subscription,sequence=0,status;
  const history=[];
  const send=(scope=subscription?.scope,ttl=3000)=>{if(!peer||!scope||peer.readyState!==1)return;const at=Date.now();peer.send(JSON.stringify({schema:'mcvisual.content/v1',scope,producer:'offline-fixture',sequence:++sequence,issuedAt:at,expiresAt:at+ttl,panels:[{id:'fixture',title:'Offline fixture',anchor:'bottom_right',width:220,bottomInset:58,rows:[{label:'Task',text:'Accepted',tone:'active',progress:0.5}]}]}));};
  ws.on('connection',socket=>{connections++;peer=socket;socket.on('message',bytes=>{subscription=JSON.parse(bytes.toString());history.push(subscription);if(subscription.scope)send();});});
  await new Promise(r=>http.listen(0,'127.0.0.1',r));
  const config=directory+'/content.json';await fs.writeFile(config,JSON.stringify({schema:'mcvisual.content-config/v1',enabled:true,endpoint:'ws://127.0.0.1:'+http.address().port+'/content'}));
  const child=spawn(exe('java'),['-Dmcvisual.contentConfig='+config,'-cp',cp,'ContentRuntimeFixture',directory],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let pending='',errors='';child.stdout.on('data',b=>{pending+=b;let at;while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at).trim();pending=pending.slice(at+1);if(line)status=JSON.parse(line);}});child.stderr.on('data',b=>errors+=b);
  const command=value=>child.stdin.write(value+'\n');
  try{
   await until(()=>status?.panelCount===1&&status.layout.length===1,'initial frame');assert.equal(status.fixtureNoMinecraftDependency,true);assert.ok(status.layout[0].x>480);assert.equal(history[0].schema,'mcvisual.subscribe/v1');
   const old=subscription.scope,accepted=status.accepted;command('target-b');await until(()=>status?.scope?.subjectUuid.startsWith('3333')&&status.accepted>accepted,'new target');
   const next=subscription.scope;assert.ok(next.epoch>old.epoch);const rejected=status.rejected;send(old);await until(()=>status.rejected>rejected,'late old-target frame rejected');assert.equal(status.scope.subjectUuid,next.subjectUuid);assert.equal(status.panelCount,1);
   command('hidden');await until(()=>status.layout.length===0,'menu hidden');const rendered=status.drawnFrames;await delay(100);assert.equal(status.drawnFrames,rendered);command('visible');send();await until(()=>status.layout.length===1,'HUD resumes');
   send(subscription.scope,150);await until(()=>status.reason==='accepted','short frame');await until(()=>status.panelCount===0&&status.layout.length===0,'expiry clears without repeated reads extending TTL');
   send();await until(()=>status.panelCount===1,'refreshed');const epoch=status.scope.epoch;command('world');await until(()=>status.scope.epoch>epoch&&status.panelCount===1,'world replacement gets new scope');
   const sockets=connections;command('loading');await until(()=>status.scope==null&&status.panelCount===0&&!status.streamOpen,'loading disconnect');command('resume');await until(()=>connections>sockets&&status.panelCount===1,'resume new connection');
   peer.terminate();await until(()=>!status.streamOpen&&status.panelCount===0,'disconnect clears');await until(()=>status.streamOpen&&status.panelCount===1,'bounded reconnect');
   command('stop');await until(()=>status.stopped&&status.transport==='stopped','close terminal');const count=connections;await delay(1200);assert.equal(connections,count);assert.equal(status.panelCount,0);assert.equal(status.streamOpen,false);assert.equal(status.layout.length,0);assert.equal(errors,'');
  }finally{
   command('quit');await Promise.race([new Promise(r=>child.once('exit',r)),delay(1500)]);if(child.exitCode==null)child.kill();for(const client of ws.clients)client.terminate();await new Promise(r=>ws.close(r));await new Promise(r=>http.close(r));await cleanup(directory);
  }
 });
 test(report.loader+' unconfigured packaged runtime is inert',async()=>{
  const directory=await fs.mkdtemp(path.join(tmpdir(),'mcvisual-content-disabled-'));
  const cp=[directory,report.artifact,...report.classpath.filter(p=>/^gson-[0-9].*\.jar$/.test(path.basename(p)))].join(path.delimiter);
  execFileSync(exe('javac'),['--release','21','-proc:none','-encoding','UTF-8','-classpath',cp,'-d',directory,fileURLToPath(new URL('./ContentRuntimeFixture.java',import.meta.url))],{windowsHide:true,stdio:'pipe'});
  const child=spawn(exe('java'),['-cp',cp,'ContentRuntimeFixture',directory],{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);
  try{await until(()=>output.includes('\n'),'disabled status');const state=JSON.parse(output.split('\n')[0]);assert.equal(state.transport,'disabled');assert.equal(state.streamOpen,false);assert.equal(state.accepted,0);assert.equal(state.drawnFrames,0);assert.equal(state.fixtureNoMinecraftDependency,true);await assert.rejects(fs.access(directory+'/diagnostics'));}
  finally{child.stdin.end('quit\n');await Promise.race([new Promise(r=>child.once('exit',r)),delay(1000)]);if(child.exitCode==null)child.kill();await cleanup(directory);}
 });
 test(report.loader+' pending HTTP upgrade cancels and cannot revive after close',async()=>{
  const directory=await fs.mkdtemp(path.join(tmpdir(),'mcvisual-content-cancel-'));
  const cp=[directory,report.artifact,...report.classpath.filter(p=>/^gson-[0-9].*\.jar$/.test(path.basename(p)))].join(path.delimiter);
  execFileSync(exe('javac'),['--release','21','-proc:none','-encoding','UTF-8','-classpath',cp,'-d',directory,fileURLToPath(new URL('./ContentRuntimeFixture.java',import.meta.url))],{windowsHide:true,stdio:'pipe'});
  const http=createServer(),ws=new WebSocketServer({noServer:true});let upgrade,attempts=0,status,pending='';
  http.on('upgrade',(req,socket,head)=>{attempts++;upgrade={req,socket,head};});await new Promise(r=>http.listen(0,'127.0.0.1',r));
  const config=directory+'/content.json';await fs.writeFile(config,JSON.stringify({schema:'mcvisual.content-config/v1',enabled:true,endpoint:'ws://127.0.0.1:'+http.address().port+'/content'}));
  const child=spawn(exe('java'),['-Dmcvisual.contentConfig='+config,'-cp',cp,'ContentRuntimeFixture',directory],{windowsHide:true,stdio:['pipe','pipe','pipe']});child.stderr.resume();
  child.stdout.on('data',b=>{pending+=b;let at;while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at).trim();pending=pending.slice(at+1);if(line)status=JSON.parse(line);}});
  try{
   await until(()=>upgrade&&status?.transport==='connecting','pending upgrade');child.stdin.write('stop\n');await until(()=>status?.stopped,'cancel pending request');
   if(!upgrade.socket.destroyed)ws.handleUpgrade(upgrade.req,upgrade.socket,upgrade.head,socket=>socket.close());
   await delay(1200);assert.equal(attempts,1);assert.equal(status.transport,'stopped');assert.equal(status.streamOpen,false);assert.equal(status.panelCount,0);
  }finally{child.stdin.end('quit\n');await Promise.race([new Promise(r=>child.once('exit',r)),delay(1000)]);if(child.exitCode==null)child.kill();upgrade?.socket.destroy();for(const socket of ws.clients)socket.terminate();await new Promise(r=>ws.close(r));await new Promise(r=>http.close(r));await cleanup(directory);}
 });
}
