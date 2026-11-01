package local.orthopreview;

import com.dimaskama.orthocamera.client.OrthoCamera;
import com.google.gson.*;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.*;
import org.lwjgl.opengl.GL11;
import org.lwjgl.glfw.GLFW;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;

/** Explicit isolated-singleplayer experiment. No connections, game commands or model calls. */
public final class OrthoPreviewClient implements ClientModInitializer {
  private static final Gson GSON=new GsonBuilder().setPrettyPrinting().create();
  private final Path game=FabricLoader.getInstance().getGameDir();
  private long ticks,startMs,durationMs,lastAvoidAt; private int obstructed;
  private String lastId,lease,phase="waiting_singleplayer",problem,scope=UUID.randomUUID().toString();
  private Object world; private boolean local,avoid,rendered,settled;
  private float fromYaw,fromPitch,fromScale,toYaw,toPitch,toScale,baseYaw,basePitch;
  private String transition="cut",projectionProfile; private boolean requestedProjection; private double visible=Double.NaN;
  private final Set<String> cancelled=new LinkedHashSet<>();
  private JsonArray candidates=new JsonArray();
  public void onInitializeClient(){
    ClientTickEvents.END_CLIENT_TICK.register(this::tick);
    WorldRenderEvents.END.register(context->{
      if(local&&settled&&"transitioning".equals(phase)) {rendered=true;phase="applied";OrthoCamera.CONFIG.save();}
    });
  }
  private void tick(class_310 client){
    local=client.field_1724!=null&&client.method_1576()!=null&&client.method_1558()==null;
    if(world!=client.field_1687){world=client.field_1687;scope=UUID.randomUUID().toString();avoid=false;phase="waiting_request";rendered=false;settled=false;}
    if(client.field_1729.method_1613())client.field_1729.method_1610();
    ++ticks;
    if(local) {
      try { readCancel(client);if(ticks%2==0)readRequest(client);step();
        if(ticks%10==0&&OrthoCamera.isEnabled())visibility(client);
      }catch(Exception e){phase="rejected";problem=e.getClass().getSimpleName()+":"+String.valueOf(e.getMessage());avoid=false;}
    }
    if(ticks%5==0)writeStatus(client);
  }
  private void checkBinding(JsonObject r,class_310 client){
    if(!"mcvisual.camera/v1".equals(r.get("schema").getAsString())||!scope.equals(r.get("scope").getAsString())||!client.field_1724.method_5667().toString().equals(r.get("subjectUuid").getAsString()))throw new IllegalArgumentException("binding_mismatch");
    long now=System.currentTimeMillis(),issued=r.get("issuedAt").getAsLong(),expires=r.get("expiresAt").getAsLong();
    if(issued>now+1000||expires<now||expires-issued>10000||expires<issued)throw new IllegalArgumentException("expired_or_invalid_request");
    if(!r.get("lease").getAsString().matches("[A-Za-z0-9_-]{1,72}"))throw new IllegalArgumentException("invalid_lease");
  }
  private void readCancel(class_310 client)throws Exception{
    Path file=game.resolve("ortho-preview/cancel.json");if(!Files.exists(file))return;
    JsonObject r=JsonParser.parseString(Files.readString(file)).getAsJsonObject();
    String id=r.get("id").getAsString();if(cancelled.contains(id))return;
    checkBinding(r,client);if(!id.matches("[A-Za-z0-9_-]{1,72}"))throw new IllegalArgumentException("invalid_id");
    if(cancelled.size()>=256)throw new IllegalArgumentException("cancel_archive_required");cancelled.add(id);
    if(id.equals(lastId)&&r.get("lease").getAsString().equals(lease)){
      avoid=false;settled=false;phase="cancelled";rendered=false;problem=null;
    }
  }
  private void readRequest(class_310 client)throws Exception{
    Path file=game.resolve("ortho-preview/request.json");if(!Files.exists(file))return;
    JsonObject r=JsonParser.parseString(Files.readString(file)).getAsJsonObject();String id=r.get("id").getAsString();
    if(id.equals(lastId)||cancelled.contains(id))return;
    if(!id.matches("[A-Za-z0-9_-]{1,72}"))throw new IllegalArgumentException("invalid_id");
    if(r.has("schema"))checkBinding(r,client);
    else if(r.get("expiresAt").getAsLong()<System.currentTimeMillis()){lastId=id;return;}
    float scale=range(r,"scale",3,32),yaw=range(r,"yaw",-180,180),pitch=range(r,"pitch",10,85);
    boolean enabled=r.get("enabled").getAsBoolean(),was=OrthoCamera.isEnabled();
    String profile=r.has("projectionProfile")?r.get("projectionProfile").getAsString():null;
    if(profile!=null&&!profile.matches("[A-Za-z0-9_-]{1,72}"))throw new IllegalArgumentException("invalid_projection_profile");
    fromYaw=OrthoCamera.CONFIG.fixed_yaw;fromPitch=OrthoCamera.CONFIG.fixed_pitch;fromScale=OrthoCamera.CONFIG.scale_y;
    OrthoCamera.CONFIG.setFixed(true);OrthoCamera.CONFIG.enabled=enabled;
    OrthoCamera.CONFIG.setFixedYaw(fromYaw);OrthoCamera.CONFIG.setFixedPitch(fromPitch);
    OrthoCamera.CONFIG.min_distance=-128;OrthoCamera.CONFIG.max_distance=256;
    lastId=id;lease=r.has("lease")?r.get("lease").getAsString():"manual-preview";projectionProfile=profile;requestedProjection=enabled;
    baseYaw=yaw;basePitch=pitch;avoid=enabled&&r.has("autoAvoid")&&r.get("autoAvoid").getAsBoolean();obstructed=0;
    long ms=r.has("transitionMs")?(long)range(r,"transitionMs",0,2500):700;
    // Orthographic <-> perspective is an explicit cut, never described as a crossfade.
    transition=(was!=enabled||!enabled)?"cut":"smooth";
    begin(yaw,pitch,scale,"cut".equals(transition)?0:ms);
    client.field_1690.method_31043(class_5498.field_26665);
    client.field_1690.field_1842=r.has("hideHud")&&r.get("hideHud").getAsBoolean();problem=null;
  }
  private void begin(float yaw,float pitch,float scale,long ms){
    fromYaw=OrthoCamera.CONFIG.fixed_yaw;fromPitch=OrthoCamera.CONFIG.fixed_pitch;fromScale=OrthoCamera.CONFIG.scale_y;
    toYaw=yaw;toPitch=pitch;toScale=scale;durationMs=ms;startMs=System.currentTimeMillis();settled=false;rendered=false;phase="transitioning";
  }
  private static float angle(float value){return ((value+180)%360+360)%360-180;}
  private void step(){
    if(!"transitioning".equals(phase))return;
    float t=durationMs==0?1:Math.min(1,(System.currentTimeMillis()-startMs)/(float)durationMs);float a=t*t*(3-2*t);
    OrthoCamera.CONFIG.setFixedYaw(fromYaw+angle(toYaw-fromYaw)*a);
    OrthoCamera.CONFIG.setFixedPitch(fromPitch+(toPitch-fromPitch)*a);
    float scale=fromScale+(toScale-fromScale)*a;OrthoCamera.CONFIG.setScaleX(scale);OrthoCamera.CONFIG.setScaleY(scale);
    settled=t>=1;
  }
  private double score(class_310 client,float yaw,float pitch){
    var player=client.field_1724;double x=player.method_23317(),y=player.method_23318(),z=player.method_23321();
    double yr=Math.toRadians(yaw),pr=Math.toRadians(pitch),dx=Math.sin(yr)*Math.cos(pr),dy=Math.sin(pr),dz=-Math.cos(yr)*Math.cos(pr);
    double height=player.method_17682(),side=player.method_17681()*.38;
    double[][] points={{x,y+height*.9,z},{x,y+height*.55,z},{x,y+.15,z},{x+Math.cos(yr)*side,y+height*.65,z+Math.sin(yr)*side},{x-Math.cos(yr)*side,y+height*.65,z-Math.sin(yr)*side}};
    int clear=0;
    for(double[] p:points){
      for(int distance=0;distance<=48;distance+=8)if(!client.field_1687.method_8393(((int)Math.floor(p[0]+dx*distance))>>4,((int)Math.floor(p[2]+dz*distance))>>4))return Double.NaN;
      class_243 start=new class_243(p[0]+dx*.05,p[1]+dy*.05,p[2]+dz*.05),end=new class_243(p[0]+dx*48,p[1]+dy*48,p[2]+dz*48);
      var hit=client.field_1687.method_17742(new class_3959(start,end,class_3959.class_3960.valueOf("VISUAL"),class_3959.class_242.valueOf("NONE"),player));
      if(hit.method_17783()==class_239.class_240.valueOf("MISS"))clear++;
    }
    return clear/5.0;
  }
  private void visibility(class_310 client){
    visible=score(client,OrthoCamera.CONFIG.fixed_yaw,OrthoCamera.CONFIG.fixed_pitch);
    if(!avoid||!"applied".equals(phase)||!Double.isFinite(visible))return;
    if(visible>=.8){obstructed=0;return;}if(++obstructed<2||System.currentTimeMillis()-lastAvoidAt<2500)return;
    double best=visible;float bestYaw=OrthoCamera.CONFIG.fixed_yaw,bestPitch=OrthoCamera.CONFIG.fixed_pitch;
    candidates=new JsonArray();
    for(float pitch:new float[]{basePitch,Math.max(basePitch,55)})for(float offset:new float[]{0,45,-45,90,-90,135,-135,180}){
      float yaw=angle(baseYaw+offset);double s=score(client,yaw,pitch);JsonObject c=new JsonObject();c.addProperty("yaw",yaw);c.addProperty("pitch",pitch);if(Double.isFinite(s))c.addProperty("visibleFraction",s);else c.add("visibleFraction",JsonNull.INSTANCE);candidates.add(c);
      if(Double.isFinite(s)&&s>best+.01){best=s;bestYaw=yaw;bestPitch=pitch;}
    }
    if(best>=.8&&best>=visible+.39){lastAvoidAt=System.currentTimeMillis();obstructed=0;transition="smooth";begin(bestYaw,bestPitch,toScale,700);}
  }
  private void writeStatus(class_310 client){try{
    GLFW.glfwSetWindowTitle(client.method_22683().method_4490(),"OrthoCamera Preview - local singleplayer");
    JsonObject d=new JsonObject();d.addProperty("schema","ortho-preview/v1");d.addProperty("recordedAt",Instant.now().toString());
    d.addProperty("localSingleplayer",local);d.addProperty("scope",scope);d.addProperty("phase",phase);d.addProperty("id",lastId);d.addProperty("lease",lease);d.addProperty("problem",problem);
    d.addProperty("rendered",rendered);d.addProperty("transition",transition);d.addProperty("autoAvoid",avoid);
    if(Double.isFinite(visible))d.addProperty("visibleFraction",visible);else d.add("visibleFraction",JsonNull.INSTANCE);d.add("avoidanceCandidates",candidates);
    d.addProperty("enabled",OrthoCamera.isEnabled());d.addProperty("scale",OrthoCamera.CONFIG.scale_y);d.addProperty("yaw",OrthoCamera.CONFIG.fixed_yaw);d.addProperty("pitch",OrthoCamera.CONFIG.fixed_pitch);
    d.addProperty("projection",OrthoCamera.isEnabled()?"orthographic":"perspective");
    boolean projectionMatches=OrthoCamera.isEnabled()==requestedProjection&&Math.abs(OrthoCamera.CONFIG.scale_y-toScale)<.01
      &&Math.abs(angle(OrthoCamera.CONFIG.fixed_yaw-toYaw))<.01&&Math.abs(OrthoCamera.CONFIG.fixed_pitch-toPitch)<.01;
    if(rendered&&"applied".equals(phase)&&requestedProjection&&projectionMatches&&projectionProfile!=null)d.addProperty("projectionProfile",projectionProfile);
    else d.add("projectionProfile",JsonNull.INSTANCE);
    d.addProperty("fps",client.method_47599());d.addProperty("renderer",GL11.glGetString(GL11.GL_RENDERER));d.addProperty("systemMouseCaptured",client.field_1729.method_1613());
    if(client.field_1724!=null){d.addProperty("username",client.field_1724.method_5477().getString());d.addProperty("uuid",client.field_1724.method_5667().toString());}
    Path dir=game.resolve("ortho-preview");Files.createDirectories(dir);Path temp=dir.resolve("status.tmp.json");Files.writeString(temp,GSON.toJson(d));Files.move(temp,dir.resolve("status.json"),StandardCopyOption.REPLACE_EXISTING);
  }catch(Exception ignored){}}
  private static float range(JsonObject r,String name,float min,float max){float v=r.get(name).getAsFloat();if(!Float.isFinite(v)||v<min||v>max)throw new IllegalArgumentException("invalid_"+name);return v;}
}
