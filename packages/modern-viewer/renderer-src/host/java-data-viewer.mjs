import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Server as SocketServer } from 'socket.io';
import { JavaVisualData } from './java-visual-data.mjs';
import { serveViewerAsset } from './viewer-asset-server.mjs';

/** Existing browser renderer fed by native data. rpc is injected by the body adapter;
 * tokens, screenshots and body commands never cross this read-only browser endpoint. */
export async function createJavaDataViewer({port,assetsDir,rpc,uuid,server:expectedServer,radius=2}) {
  if(!Number.isInteger(port)||port<0||port>65535||!Number.isInteger(radius)||radius<0||radius>4) throw Error('JAVA_VIEWER_CONFIG_INVALID');
  const root=path.resolve(assetsDir), source=JSON.parse(await readFile(path.join(root,'public/asset-source.json'),'utf8'));
  if(source.minecraftVersion!=='1.20.6') throw Error('JAVA_VIEWER_ASSET_VERSION_MISMATCH');
  const notice='<div role="status" style="position:fixed;bottom:54px;left:12px;z-index:99999;background:#13242fe8;color:white;padding:8px;max-width:430px;font:13px sans-serif">原生数据预览 · 已接入地形与本人移动。其他实体、容器、YSM、模组材质与光影尚未接入；界面空槽不代表实际背包为空。</div>';
  const pages=new Map(await Promise.all(['','third/','dungeon/'].map(async route=>[route,(await readFile(path.join(root,'public',route,'index.html'),'utf8')).replace('</body>',notice+'</body>')])));
  const css=await readFile(path.join(root,'public/viewer.css'));
  const skins=new Map(),skinBytes=new Map();
  const data=new JavaVisualData({uuid,server:expectedServer,skinUrl:resource=>skins.get(resource)??null});
  async function prepareSkin(resource) {
    if(skins.has(resource))return;
    if(!/^minecraft:textures\/entity\/player\/(slim|wide)\/[a-z_]+\.png$/.test(resource??''))throw Error('JAVA_VISUAL_NATIVE_SKIN_UNAVAILABLE');
    const bytes=await readFile(path.join(root,'public/textures/1.20.6',resource.slice('minecraft:textures/'.length)));
    const hash=createHash('sha256').update(bytes).digest('hex');
    skins.set(resource,`/head-texture/${hash}.png`);skinBytes.set(hash,bytes);
  }
  let activePort=port,closed=false,timer,chunkTimer,framePending=null,chunkBusy=false,dirty=[],error=null,lastFrameAt=0;
  let retryAfter=0,lastError=null;
  let frames=0,columns=0,chunkMs=0,registryMs=0,unsupportedEntities=0;
  const clients=new Set(), waiting=new Set(), sockets=[];
  const demanded=()=>clients.size+waiting.size>0;
  const allowed=req=>req.headers.host===`127.0.0.1:${activePort}`&&(!req.headers.origin||req.headers.origin===`http://127.0.0.1:${activePort}`)&&req.headers['sec-fetch-site']!=='cross-site';
  const emit=(name,value)=>{for(const socket of clients) {
    if(socket.conn.writeBuffer.length>128) {socket.disconnect(true);continue;}
    // These three legacy events form one observation. Consecutive volatile emits
    // drop avatar/entity packets while the position packet is being written.
    // Keep their ordering together; the bounded queue above evicts slow viewers.
    socket.emit(name,value);
  }};
  const status=()=>({ok:!closed&&!error&&(!demanded()||lastFrameAt>0&&Date.now()-lastFrameAt<=3000),state:closed?'closed':error?'unavailable':demanded()?'streaming':'idle',sampling:demanded()&&!closed,source:'real-java-world-data',transport:'socket.io',minecraftVersion:'1.20.6',error,lastError,epoch:data.epoch,
    sampledAt:data.frame?.sampledAt,ageMs:lastFrameAt?Date.now()-lastFrameAt:null,frames,columns:data.columns.size,chunkUpdates:columns,lastChunkMs:chunkMs,registryMs,
    viewers:[...clients].filter(s=>s.handshake.headers['x-mc-viewer-capture']!=='1').length,maxSessions:2,
    captureSessions:[...clients].filter(s=>s.handshake.headers['x-mc-viewer-capture']==='1').length,maxCaptureSessions:1,
    coverage:{self:true,loadedColumns:data.columns.size,radius,otherEntitiesRendered:false,observedOtherEntities:unsupportedEntities,
      blockEntities:false,modAnimations:false,clientShaders:false,fullParity:false}});
  const http=createServer(async(req,res)=>{
    if(!allowed(req)||req.method!=='GET'){res.writeHead(403).end();return;}
    try {
      const route=new URL(req.url,'http://127.0.0.1').pathname.slice(1);
      res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
      if(pages.has(route)){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(pages.get(route));return;}
      if(route==='viewer.css'){res.setHeader('Content-Type','text/css; charset=utf-8');res.end(css);return;}
      if(route==='healthz'||route==='viewer-coverage'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(status()));return;}
      const skinHash=/^head-texture\/([a-f0-9]{64})\.png$/.exec(route)?.[1];
      if(skinHash&&skinBytes.has(skinHash)){res.setHeader('Content-Type','image/png');res.end(skinBytes.get(skinHash));return;}
      if(route==='index.js' && await serveViewerAsset(res,root,'dist/modern-viewer.js','no-store'))return;
      if(await serveViewerAsset(res,path.join(root,'public'),route))return;
      if(route.startsWith('textures/')&&await serveViewerAsset(res,path.join(root,'public'),`textures/1.20.6/${route.slice(9)}`))return;
      res.writeHead(404).end();
    }catch{res.writeHead(503).end('Viewer resource unavailable');}
  });
  function unavailable(reason) {
    error=reason;lastError=reason;retryAfter=Date.now()+1000;dirty=[];data.clear();console.error(reason);
    // Transport closes: existing browser shows disconnected; never presents old facts as live.
    for(const socket of clients)socket.disconnect(true);
  }
  function frame() {
    if(!closed&&demanded()&&framePending&&lastFrameAt&&Date.now()-lastFrameAt>3000&&!error)unavailable('JAVA_VISUAL_SAMPLE_STALE');
    if(closed||!demanded()||Date.now()<retryAfter)return Promise.resolve();
    return framePending??=sampleFrame().finally(()=>{framePending=null;});
  }
  async function sampleFrame() {
    try {
      const value=await rpc('visual_frame',{radius});if(closed)return;
      if(!demanded())return;
      data.verify(value);
      if(Math.abs(Date.now()-value.sampledAt)>3000)throw Error('JAVA_VISUAL_SAMPLE_STALE');
      await prepareSkin(value.self.skinResource);if(closed)return;
      if(data.epoch!==value.epoch){
        if(data.epoch){emit('viewerReset');for(const socket of clients)socket.disconnect(true);}
        const started=performance.now(),registry=await rpc('visual_registry',{});if(closed)return;
        data.registry(registry);
        if(data.nativeBiomes.size && !(await readFile(path.join(root,'public/mesher.js'),'utf8')).includes('agent-mc-native-biomes/v1')) throw Error('JAVA_VIEWER_NATIVE_BIOME_RENDERER_REQUIRED');
        registryMs=performance.now()-started;
        if(value.epoch!==data.epoch)return;
      }
      dirty=data.applyFrame(value,emit);lastFrameAt=Date.now();frames++;unsupportedEntities=value.entities.length;error=null;
    }catch(e){if(!closed)unavailable(e.message);}
  }
  async function chunk() {
    if(closed||!clients.size||chunkBusy||!dirty.length||!data.epoch)return;chunkBusy=true;
    const item=dirty.shift(),epoch=data.epoch,started=performance.now();
    try {
      const value=await rpc('visual_chunk',{x:item.x,z:item.z,epoch});
      if(closed||data.epoch!==epoch||!data.frame?.columns.some(c=>c.x===item.x&&c.z===item.z))return;
      if(data.acceptChunk(value,emit))columns++;chunkMs=performance.now()-started;
      emit('chunkStreamState',{streamed:data.columns.size,expected:data.frame.columns.length,retried:0});
    }catch(e){if(!closed && data.epoch===epoch)unavailable(e.message);}finally{chunkBusy=false;}
  }
  for(const pathname of ['/socket.io','/third/socket.io']) {
    const io=new SocketServer(http,{path:pathname,serveClient:false,maxHttpBufferSize:1024,allowRequest:(req,done)=>done(null,allowed(req))});sockets.push(io);
    io.on('connection',async socket=>{
      const capture=socket.handshake.headers['x-mc-viewer-capture']==='1';
      if([...clients,...waiting].filter(s=>(s.handshake.headers['x-mc-viewer-capture']==='1')===capture).length>=(capture?1:2)){socket.emit('viewerBusy',{reason:'Viewer limit',maximum:capture?1:2});socket.disconnect(true);return;}
      waiting.add(socket);
      const lease=capture?setTimeout(()=>socket.disconnect(true),60000):null;lease?.unref();
      socket.on('disconnect',()=>{clients.delete(socket);waiting.delete(socket);if(lease)clearTimeout(lease);});
      // Only a real view/capture asks for observations. Never replay an idle cache
      // as current facts; concurrent first viewers share the same fresh sample.
      await frame();waiting.delete(socket);
      if(!socket.connected)return;
      if(closed||error||!data.frame||Date.now()-lastFrameAt>3000){socket.emit('viewerBusy',{reason:error??'Waiting for actual Java world'});socket.disconnect(true);return;}
      clients.add(socket);socket.emit('version','1.20.6');
      const latest=data.frame,self=data.entity(latest.self,true);
      socket.emit('position',{pos:self.pos,yaw:self.yaw,pitch:self.pitch,teleport:true});socket.emit('playerEntity',self);socket.emit('entity',self);
      for(const c of data.columns.values())socket.emit('loadChunk',c);
      socket.emit('time',((latest.time%24000)+24000)%24000);socket.emit('weather',{raining:latest.raining,thunder:latest.thunder});
      socket.emit('viewerControlState',{available:false,reason:'Read-only native data view'});
    });
  }
  await new Promise((resolve,reject)=>{http.once('error',reject);http.listen(port,'127.0.0.1',()=>{activePort=http.address().port;resolve();});});
  timer=setInterval(()=>void frame(),50);chunkTimer=setInterval(()=>void chunk(),100);timer.unref();chunkTimer.unref();
  return {url:`http://127.0.0.1:${activePort}`,status,async close(){closed=true;clearInterval(timer);clearInterval(chunkTimer);for(const socket of [...clients,...waiting])socket.disconnect(true);
    for(const io of sockets)io.close();http.closeAllConnections();if(http.listening)await new Promise(resolve=>http.close(resolve));data.clear();}};
}
