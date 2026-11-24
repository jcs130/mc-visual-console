package org.mcvisual.content;

import com.google.gson.*;
import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/** Explicit local/secure WebSocket, presentation only. Never sends Minecraft packets or input. */
public final class ContentRuntime implements AutoCloseable {
 private record Config(String schema,boolean enabled,String endpoint,String bearerEnv){}
 private final Gson json=new GsonBuilder().serializeNulls().create();
 private final ContentState state=new ContentState();
 private final String instanceId=UUID.randomUUID().toString();
 private final ContentPlatform platform;
 private final Config config;
 private final Thread shutdownHook;
 private final AtomicReference<String> newest=new AtomicReference<>();
 private final AtomicLong generation=new AtomicLong();
 private final AtomicBoolean open=new AtomicBoolean(),stopped=new AtomicBoolean();
 private volatile WebSocket socket;
 private volatile CompletableFuture<WebSocket> connecting;
 private final HttpClient http;
 private Object world,connection,camera;
 private long scopeEpoch,lastDiagnostic,nextConnect,frames,lastDrawnAt;
 private final AtomicLong subscribeSequence=new AtomicLong();
 private int attempts;
 private volatile ContentState.Scope scope;
 private volatile String subjectName="",transport="disabled";
 private List<Map<String,Object>> layout=List.of();
 public ContentRuntime(ContentPlatform platform){
  this.platform=Objects.requireNonNull(platform);config=load();
  http=config==null?null:HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build();
  shutdownHook=config==null?null:new Thread(this::close,"mcvisual-content-close");
  if(shutdownHook!=null){transport="waiting_world";Runtime.getRuntime().addShutdownHook(shutdownHook);}
 }
 private Config load(){
  String path=System.getProperty("mcvisual.contentConfig");if(path==null||path.isBlank())return null;
  try{Path f=Path.of(path);if(!f.isAbsolute()||Files.size(f)>8192)return null;Config c=json.fromJson(Files.readString(f),Config.class);
   if(c==null||!c.enabled||!"mcvisual.content-config/v1".equals(c.schema))return null;
   URI u=URI.create(c.endpoint);boolean local=Set.of("127.0.0.1","localhost","[::1]","::1").contains(u.getHost());
   if(u.getHost()==null||!(local&&"ws".equals(u.getScheme())||"wss".equals(u.getScheme()))||u.getUserInfo()!=null||u.getQuery()!=null||u.getFragment()!=null)return null;
   if(c.bearerEnv!=null&&!c.bearerEnv.matches("[A-Z][A-Z0-9_]{1,80}"))return null;
   return c;
  }catch(Exception ignored){return null;}
 }
 private void disconnect(){generation.incrementAndGet();open.set(false);newest.set(null);state.disconnected();var s=socket;socket=null;if(s!=null)s.abort();var c=connecting;connecting=null;if(c!=null)c.cancel(true);}
 public synchronized void tick(){
  if(config==null||stopped.get())return;
  var observed=platform.scene();boolean connected=observed!=null&&observed.connected();
  Object w=observed==null?null:observed.world(),c=observed==null?null:observed.connection(),a=observed==null?null:observed.camera();
  if(w!=world||c!=connection||a!=camera){
   world=w;connection=c;camera=a;scopeEpoch++;newest.set(null);
   if(connected){
    scope=new ContentState.Scope(instanceId,scopeEpoch,observed.server(),observed.recipientUuid(),observed.subjectUuid(),observed.entityId(),observed.dimension());
    subjectName=Objects.toString(observed.subjectName(),"");
   }else{scope=null;subjectName="";}
   state.context(scope);if(open.get())subscribe();
  }
  if(scope==null){if(socket!=null||connecting!=null)disconnect();transport="waiting_world";}
  else{
   if(!open.get()){state.disconnected();if(connecting==null&&System.currentTimeMillis()>=nextConnect)connect();}
   else{String frame=newest.getAndSet(null);if(frame!=null)state.accept(frame,System.currentTimeMillis(),System.nanoTime());}
  }
  if(System.currentTimeMillis()-lastDiagnostic>=1000){lastDiagnostic=System.currentTimeMillis();diagnostic(connected);}
 }
 private void subscribe(){
  var s=socket;if(s==null||!open.get())return;
  var value=new LinkedHashMap<String,Object>();value.put("schema","mcvisual.subscribe/v1");value.put("sequence",subscribeSequence.incrementAndGet());value.put("scope",scope);value.put("subjectName",subjectName);value.put("capabilities",List.of("panels/v1"));
  s.sendText(json.toJson(value),true).exceptionally(error->{s.abort();return null;});
 }
 private void connect(){
  long token=generation.incrementAndGet();transport="connecting";
  var builder=http.newWebSocketBuilder().connectTimeout(Duration.ofSeconds(3));
  if(config.bearerEnv!=null){String secret=System.getenv(config.bearerEnv);if(secret==null||secret.isBlank()){transport="credential_unavailable";nextConnect=System.currentTimeMillis()+30000;return;}builder.header("Authorization","Bearer "+secret);}
  connecting=builder.buildAsync(URI.create(config.endpoint),new WebSocket.Listener(){
   private final StringBuilder partial=new StringBuilder();
   private boolean current(){return !stopped.get()&&generation.get()==token;}
   private void lost(String why){if(current()){open.set(false);newest.set(null);transport=why;}}
   @Override public void onOpen(WebSocket s){if(!current()){s.abort();return;}socket=s;open.set(true);attempts=0;transport="connected";subscribe();s.request(1);}
   @Override public CompletionStage<?> onText(WebSocket s,CharSequence data,boolean last){
    if(!current()){s.abort();return CompletableFuture.completedFuture(null);}
    if(partial.length()+data.length()>ContentState.MAX_BYTES){lost("frame_limit");s.abort();return CompletableFuture.completedFuture(null);}
    partial.append(data);if(last){String value=partial.toString();partial.setLength(0);if(value.getBytes(java.nio.charset.StandardCharsets.UTF_8).length>ContentState.MAX_BYTES){lost("frame_limit");s.abort();return CompletableFuture.completedFuture(null);}newest.set(value);}
    s.request(1);return CompletableFuture.completedFuture(null);
   }
   @Override public CompletionStage<?> onBinary(WebSocket s,java.nio.ByteBuffer data,boolean last){lost("unsupported_binary");s.abort();return CompletableFuture.completedFuture(null);}
   @Override public CompletionStage<?> onClose(WebSocket s,int code,String reason){lost("disconnected");return CompletableFuture.completedFuture(null);}
   @Override public void onError(WebSocket s,Throwable error){lost("stream_error");}
  });
  connecting.whenComplete((s,error)->{if(!currentToken(token)){if(s!=null)s.abort();return;}connecting=null;if(error!=null){open.set(false);transport="connect_failed";}nextConnect=System.currentTimeMillis()+new int[]{1000,3000,10000,30000}[Math.min(attempts++,3)];});
 }
 private boolean currentToken(long token){return !stopped.get()&&generation.get()==token;}
 public synchronized void render(ContentPlatform.Canvas draw){
  layout=List.of();if(config==null||stopped.get()||!open.get()||scope==null||platform.hidden())return;
  var observed=platform.scene();
  if(observed==null||!observed.connected()||observed.camera()!=camera||observed.world()!=world||observed.connection()!=connection){state.disconnected();return;}
  int sw=draw.width(),sh=draw.height();var boxes=new ArrayList<Map<String,Object>>();
  for(var p:state.current(System.nanoTime())){
   int width=Math.min(p.width(),Math.max(60,sw/3)),height=20+p.rows().size()*20;
   int x=p.anchor().endsWith("right")?sw-width-8:8,y=p.anchor().startsWith("bottom")?sh-height-8-p.bottomInset():8;
   y=Math.max(8,y);if(y+height>sh-8)continue;
   draw.fill(x,y,x+width,y+height,0xAD101C29);draw.fill(x,y,x+2,y+height,0xFF77D6C8);
   draw.text(draw.fit(p.title(),width-16),x+8,y+5,0xFFD6F5EE);
   int rowY=y+20;for(var r:p.rows()){
    int color=switch(r.tone()){case "success"->0xFF9FDFAD;case "warning"->0xFFFFD182;case "error"->0xFFFFA4A0;case "muted"->0xFF9EADBE;case "active"->0xFF9DDFFF;default->0xFFE2EAF3;};
    draw.text(draw.fit(r.label(),width-16),x+8,rowY,color);
    draw.text(draw.fit(r.text(),width-16),x+8,rowY+9,0xFFE2EAF3);
    if(r.progress()!=null){draw.fill(x+8,rowY+18,x+width-8,rowY+20,0xFF304355);draw.fill(x+8,rowY+18,x+8+(int)((width-16)*r.progress()),rowY+20,color);}
    rowY+=20;
   }
   boxes.add(Map.of("x",x,"y",y,"width",width,"height",height,"rows",p.rows().size()));
  }
  if(!boxes.isEmpty()){frames++;lastDrawnAt=System.currentTimeMillis();}layout=List.copyOf(boxes);
 }
 public synchronized Map<String,Object> status(){
  var d=new LinkedHashMap<String,Object>(state.diagnostics(System.nanoTime()));d.put("schema","mcvisual.content-status/v1");d.put("version","0.2.0");d.put("recordedAt",Instant.now().toString());d.put("processId",ProcessHandle.current().pid());d.put("transport",transport);d.put("streamOpen",open.get());d.put("worldConnected",scope!=null);d.put("scope",scope);d.put("drawnFrames",frames);d.put("lastDrawnAt",lastDrawnAt);d.put("layout",layout);return d;
 }
 private void diagnostic(boolean connected){
  var d=status();d.put("worldConnected",connected);
  if(Boolean.getBoolean("mcvisual.contentOfflineCheck")){d.put("offlineDisconnected",!connected);d.put("hasAgentSdkDependency",false);}
  try{Path f=platform.gameDirectory().resolve("diagnostics/mcvisual-content.json");Files.createDirectories(f.getParent());Path temp=f.resolveSibling(f.getFileName()+".tmp");Files.writeString(temp,json.toJson(d));Files.move(temp,f,StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);}catch(Exception ignored){}
 }
 @Override public synchronized void close(){
  if(stopped.getAndSet(true))return;disconnect();state.stop();scope=null;layout=List.of();transport="stopped";
  if(http!=null)http.shutdownNow();
  if(shutdownHook!=null&&Thread.currentThread()!=shutdownHook)try{Runtime.getRuntime().removeShutdownHook(shutdownHook);}catch(IllegalStateException ignored){}
 }
}
