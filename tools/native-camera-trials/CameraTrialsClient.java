package org.mcvisual.camera;

import com.google.gson.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.net.*;
import java.util.*;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.*;
import com.cukkoo.freecamera.state.CameraMode;
import com.cukkoo.freecamera.state.CameraStateManager;
import com.vcam.VCamController;
import com.vcam.VCamWorldSender;
import com.vcam.server.VCamWebSocketServer;
import dev.fpvcore.mc.Session;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

/** Explicit optional laboratory companion. No login, target selection, actor control or model. */
public final class CameraTrialsClient implements ClientModInitializer {
    private final Gson gson=new Gson();
    private Path game,configDir;
    private String server,observer,phase="disabled",reason="explicit_config_required",activeId,heldLease;
    private Set<String> targets=Set.of();
    private volatile CameraTrialPolicy.Request active;
    private CameraTrialPolicy.Pose requested;
    private Object activeWorld;
    private long frames,windowFrames,windowAt,lastWrite,lastRenderedAt;
    private double fps;
    private double[] rendered;
    private Loopback loopback;
    private long lastSensorAt,lastWorldAt;
    private volatile String lastLoopbackError;
    private volatile long rejectedInputs;
    private long captures,lastCaptureAt;
    private String captureId,capturePath;
    private final VCamWebSocketServer releasedParser=new VCamWebSocketServer(0);
    private VCamWorldSender worldSender;
    @Override public void onInitializeClient(){
        game=FabricLoader.getInstance().getGameDir();configDir=FabricLoader.getInstance().getConfigDir();
        try{
            JsonObject config=load(configDir.resolve("mcvisual-camera-trials.json"),16_384);
            if(config==null||!bool(config,"enabled"))return;
            server=str(config,"server");observer=str(config,"observer");
            Set<String> list=new HashSet<>();for(JsonElement e:config.getAsJsonArray("targets"))list.add(e.getAsString());
            if(server==null||observer==null||list.isEmpty()||list.size()>16)throw new IllegalArgumentException("invalid_profile");
            targets=Set.copyOf(list);phase="idle";reason="awaiting_explicit_request";
        }catch(Exception e){phase="disabled";reason=e.getClass().getSimpleName();return;}
        ClientTickEvents.END_CLIENT_TICK.register(this::tick);
        HudRenderCallback.EVENT.register((draw,delta)->{
            if(active==null)return;
            var client=class_310.method_1551();var camera=client.field_1773.method_19418();var pos=camera.method_19326();
            rendered=new double[]{pos.field_1352,pos.field_1351,pos.field_1350,camera.method_19330(),camera.method_19329()};
            lastRenderedAt=System.currentTimeMillis();frames++;windowFrames++;
            if(windowAt==0)windowAt=lastRenderedAt;
            if(lastRenderedAt-windowAt>=1000){fps=windowFrames*1000.0/(lastRenderedAt-windowAt);windowFrames=0;windowAt=lastRenderedAt;}
        });
    }
    private void tick(class_310 c){
        long now=System.currentTimeMillis();
        try{
            JsonObject n=load(game.resolve("diagnostics/mcvisual-native-director.json"),32_768);
            JsonObject input=load(configDir.resolve("mcvisual-camera-trial-request.json"),4096);
            CameraTrialPolicy.Request r=input==null?null:gson.fromJson(input,CameraTrialPolicy.Request.class);
            if(input!=null&&"off".equals(str(input,"mode"))){disable(c,"operator_release");write(c,n,now);return;}
            if(r==null){if(active!=null)disable(c,"request_removed");write(c,n,now);return;}
            if(c.field_1724==null||c.field_1687==null||c.method_1558()==null
                ||!server.equals(c.method_1558().field_3761)||!observer.equalsIgnoreCase(c.method_1548().method_1676())){
                disable(c,"profile_or_connection_changed");write(c,n,now);return;
            }
            if(n==null||!targets.contains(str(n,"target"))){disable(c,"native_target_not_allowed");write(c,n,now);return;}
            var scope=new CameraTrialPolicy.Scope(str(n,"targetUuid"),str(n,"observerUuid"),str(n,"connectionEpoch"),lng(n,"nativeWorldEpoch"),
                str(n,"requestId"),"attached".equals(str(n,"phase"))&&Objects.equals(str(n,"targetUuid"),str(n,"cameraUuid")),bool(n,"authenticated"),
                c.field_1724.method_7325(),c.field_1755!=null,c.field_1690.method_31044()==class_5498.field_26664,
                n.has("drone")&&bool(n.getAsJsonObject("drone"),"active"),java.time.Instant.parse(str(n,"recordedAt")).toEpochMilli());
            String invalid=CameraTrialPolicy.validate(r,scope,now);
            if(invalid!=null){if("manual_screen_or_perspective".equals(invalid))heldLease=r.lease();disable(c,invalid);write(c,n,now);return;}
            if(Objects.equals(heldLease,r.lease())){disable(c,"manual_lease_held");write(c,n,now);return;}
            var entity=c.method_1560();
            if(entity==null||!r.targetUuid().equals(entity.method_5667().toString())){disable(c,"camera_identity_changed");write(c,n,now);return;}
            boolean changed=active==null||!r.id().equals(activeId);
            if(!changed&&activeWorld!=c.field_1687){disable(c,"native_world_object_changed");write(c,n,now);return;}
            if(changed){disable(c,"switching_experiment");active=r;activeId=r.id();activeWorld=c.field_1687;frames=0;windowFrames=0;windowAt=0;fps=0;rendered=null;}
            var eye=entity.method_5836(1);requested=CameraTrialPolicy.pose(r,eye.field_1352,eye.field_1351,eye.field_1350,now);
            // Only camera transforms in already loaded space. The native target entity/UUID is retained.
            if("freecamera".equals(r.mode())){
                var state=CameraStateManager.getInstance();
                if(!changed&&!state.isActive()){heldLease=r.lease();disable(c,"manual_component_toggle");write(c,n,now);return;}
                if(changed){state.setMode(CameraMode.FREECAM);state.initState(requested.x(),requested.y(),requested.z(),requested.yaw(),requested.pitch(),0);state.setCinematicMode(false);}
                state.setCameraPosition(requested.x(),requested.y(),requested.z());state.setCameraYaw(requested.yaw());state.setCameraPitch(requested.pitch());state.setCameraRoll(0);
            }else if("vcam".equals(r.mode())){
                if(changed){var ctl=VCamController.getInstance();ctl.activate(0,0);ctl.setConnected(true);ctl.setRotationSmoothing(1);ctl.setPositionSmoothing(1);ctl.setPositionScale(1);
                    if(worldSender==null){worldSender=new VCamWorldSender(releasedParser);releasedParser.setWorldSender(worldSender);}loopback=new Loopback();loopback.start();}
                // Native VCam rendering uses the actual released sensor handler. The loopback caller supplies the pose.
            }else if("fpvcraft".equals(r.mode())){
                if(!Boolean.getBoolean("fpvcore.noservermod")||Session.I.serverMod())throw new IllegalStateException("fpv_server_sync_not_disabled");
                for(int joystick=0;joystick<=15;joystick++)if(org.lwjgl.glfw.GLFW.glfwJoystickPresent(joystick))throw new IllegalStateException("fpv_live_controller_present");
                var session=Session.I;
                if(!changed&&!session.flying){heldLease=r.lease();disable(c,"manual_component_toggle");write(c,n,now);return;}
                if(changed){session.spawn(c,session.cfg.preset);session.setFlying(c,true);session.view=0;session.cfg.uptiltDeg=0;session.applyConfig();}
                session.ctl.kbArm=false;
                if(session.sticks!=null)session.sticks.arm=false;
                // Deliberately unarmed kinematic camera test; no claim of autonomous physical flight/gimbal tracking.
                session.drone.reset(requested.x(),requested.y(),requested.z(),requested.yaw());
            }
            if(bool(input,"capture")&&frames>=5&&captures<20&&now-lastCaptureAt>=5000&&!r.id().equals(captureId)){
                captureId=r.id();captures++;lastCaptureAt=now;
                String name="mcvisual-trial-"+r.id()+".png";capturePath=game.resolve("screenshots").resolve(name).toString();
                class_318.method_22690(game.toFile(),name,c.method_1522(),message->{});
            }
            phase="active";reason="native_camera_component_applied";write(c,n,now);
        }catch(Exception e){disable(c,"component_error:"+e.getClass().getSimpleName());write(c,null,now);}
    }
    private void disable(class_310 c,String why){
        if(active!=null){
            CameraStateManager.getInstance().reset();VCamController.getInstance().setActive(false);VCamController.getInstance().setConnected(false);
            if(Session.I.flying&&Boolean.getBoolean("fpvcore.noservermod")&&!Session.I.serverMod())Session.I.land(c);
            if(loopback!=null)try{loopback.stop(300);}catch(Exception ignored){}loopback=null;
        }
        active=null;activeId=null;activeWorld=null;requested=null;phase="idle";reason=why;
    }
    private final class Loopback extends WebSocketServer {
        Loopback(){super(new InetSocketAddress(InetAddress.getLoopbackAddress(),0));}
        @Override public void onOpen(WebSocket conn,ClientHandshake handshake){if(getConnections().size()>1)conn.close(1013,"one local controller only");}
        @Override public void onClose(WebSocket conn,int code,String why,boolean remote){}
        @Override public void onError(WebSocket conn,Exception e){lastLoopbackError=e.getClass().getSimpleName();}
        @Override public void onStart(){}
        @Override public void onMessage(WebSocket conn,String msg){
            try{
                var request=active;
                if(request==null||!"vcam".equals(request.mode())||msg.length()>2048||!conn.getRemoteSocketAddress().getAddress().isLoopbackAddress())throw new IllegalArgumentException();
                JsonObject input=JsonParser.parseString(msg).getAsJsonObject();
                long receivedAt=System.currentTimeMillis();
                if(!Objects.equals(request.id(),str(input,"requestId"))||!Objects.equals(request.lease(),str(input,"lease"))||receivedAt>request.expiresAt())throw new IllegalArgumentException();
                String type=str(input,"type");
                if("sensor".equals(type)){
                    if(receivedAt-lastSensorAt<15)throw new IllegalArgumentException();
                    Map<String,Double> sensor=new HashMap<>();
                    for(String key:List.of("yaw","pitch","roll","x","y","z")){
                        if(!input.has(key)||!input.get(key).isJsonPrimitive()||!input.getAsJsonPrimitive(key).isNumber())throw new IllegalArgumentException();
                        sensor.put(key,input.get(key).getAsDouble());
                    }
                    if(!CameraTrialPolicy.validSensor(sensor))throw new IllegalArgumentException();lastSensorAt=receivedAt;
                }else if("request_world".equals(type)){
                    if(receivedAt-lastWorldAt<5000)throw new IllegalArgumentException();lastWorldAt=receivedAt;
                }else throw new IllegalArgumentException();
                class_310.method_1551().execute(()->{
                    var current=active;
                    var c=class_310.method_1551();
                    if(current==null||!request.id().equals(current.id())||System.currentTimeMillis()>request.expiresAt()||c.field_1687!=activeWorld
                        ||c.field_1755!=null||c.method_1560()==null||!request.targetUuid().equals(c.method_1560().method_5667().toString())){if(conn.isOpen())conn.send("{\"type\":\"rejected\"}");return;}
                    releasedParser.onMessage(conn,msg);if(conn.isOpen())conn.send("{\"type\":\"accepted\"}");
                });
            }catch(Exception e){rejectedInputs++;if(conn.isOpen())conn.send("{\"type\":\"rejected\"}");}
        }
    }
    private void write(class_310 c,JsonObject nativeStatus,long now){
        if(now-lastWrite<1000)return;lastWrite=now;
        try{
            Map<String,Object> out=new LinkedHashMap<>();out.put("schema","mcvisual-camera-trials/v1");out.put("at",java.time.Instant.ofEpochMilli(now).toString());
            out.put("phase",phase);out.put("reason",reason);out.put("activeId",activeId);out.put("mode",active==null?null:active.mode());out.put("renderedAt",lastRenderedAt);
            out.put("frames",frames);out.put("fps",fps);out.put("requested",requested);out.put("rendered",rendered);out.put("loopbackPort",loopback==null?null:loopback.getPort());
            out.put("lastLoopbackError",lastLoopbackError);out.put("rejectedInputs",rejectedInputs);
            out.put("captures",captures);out.put("captureId",captureId);out.put("capturePath",capturePath);
            out.put("fpvServerSync",Boolean.getBoolean("fpvcore.noservermod")?Session.I.serverMod():null);out.put("fpvCameraValid",Session.I.camValid);out.put("fpvFlightArmed",Session.I.drone==null?null:Session.I.drone.state().armed);
            out.put("newPlayers",0);out.put("modelCalls",0);out.put("cameraUuid",c.method_1560()==null?null:c.method_1560().method_5667().toString());
            Path dest=game.resolve("diagnostics/mcvisual-camera-trials.json"),tmp=dest.resolveSibling(dest.getFileName()+".tmp");Files.createDirectories(dest.getParent());
            Files.writeString(tmp,gson.toJson(out),StandardCharsets.UTF_8);Files.move(tmp,dest,StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);
        }catch(Exception e){System.err.println("[MCVisualCameraTrials] diagnostics "+e.getClass().getSimpleName());}
    }
    private static JsonObject load(Path p,int max)throws Exception{if(!Files.isRegularFile(p))return null;if(Files.size(p)>max)throw new IllegalArgumentException("oversized_file");return JsonParser.parseString(Files.readString(p)).getAsJsonObject();}
    private static String str(JsonObject o,String key){return o!=null&&o.has(key)&&!o.get(key).isJsonNull()?o.get(key).getAsString():null;}
    private static boolean bool(JsonObject o,String key){return o!=null&&o.has(key)&&o.get(key).getAsBoolean();}
    private static long lng(JsonObject o,String key){return o!=null&&o.has(key)?o.get(key).getAsLong():0;}
}
