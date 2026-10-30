package org.mcvisual.director;

import com.google.gson.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.message.v1.ClientReceiveMessageEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.*;

/** Explicit opt-in companion for one existing authenticated spectator client. */
public final class NativeDirectorClient implements ClientModInitializer {
    private static final DroneFollow DRONE=new DroneFollow();
    private static boolean droneEnabled,droneActive;
    private static String droneUuid,droneReason="disabled";
    private static double droneDistance=7,droneHeight=3;
    private static boolean droneOverview;
    private static long droneRenderedAt;
    private static float droneRequestedDistance,droneClippedDistance;
    private DirectorPolicy policy;
    private boolean authenticated,diagnosticsFailed;
    private long tick,lastFileTime=-1,frames,frameWindowAt,lastRenderedAt;
    private Double hudFramesPerSecond;
    private String configProblem,requestProblem,connectionEpoch;
    @Override public void onInitializeClient(){
        ClientPlayConnectionEvents.JOIN.register((handler,sender,client)->join(client));
        ClientPlayConnectionEvents.DISCONNECT.register((handler,client)->{
            authenticated=false;stopDrone("disconnected");diagnostics(client,false);policy=null;});
        ClientReceiveMessageEvents.GAME.register((message,overlay)->{
            if(policy==null)return;
            authenticated=DirectorPolicy.authReceipt(authenticated,message.getString());
        });
        ClientTickEvents.END_CLIENT_TICK.register(this::tick);
        HudRenderCallback.EVENT.register((draw,delta)->{
            if(policy==null)return;long now=System.currentTimeMillis();lastRenderedAt=now;
            if(frameWindowAt==0)frameWindowAt=now;
            frames++;if(now-frameWindowAt>=1000){hudFramesPerSecond=frames*1000.0/(now-frameWindowAt);frames=0;frameWindowAt=now;}
        });
    }
    private void join(class_310 client){
        droneEnabled=false;stopDrone("new_connection");
        policy=null;authenticated=false;tick=0;lastFileTime=-1;frames=0;frameWindowAt=0;connectionEpoch=UUID.randomUUID().toString();
        hudFramesPerSecond=null;configProblem=null;requestProblem=null;diagnosticsFailed=false;
        try{
            Path file=FabricLoader.getInstance().getConfigDir().resolve("mcvisual-native-director.json");
            if(!Files.isRegularFile(file)||Files.size(file)>16_384)return;
            String source=Files.readString(file);
            DirectorPolicy.Config config=new Gson().fromJson(source,DirectorPolicy.Config.class);
            if(config==null||!config.enabled()||config.server()==null||config.observer()==null
                ||config.targets()==null||config.targets().isEmpty()||config.targets().size()>16
                ||client.method_1558()==null||!config.server().equals(client.method_1558().field_3761)
                ||!config.observer().equalsIgnoreCase(client.method_1548().method_1676()))return;
            policy=new DirectorPolicy(config);
            var extra=JsonParser.parseString(source).getAsJsonObject();
            droneEnabled=extra.has("droneEnabled")&&extra.get("droneEnabled").getAsBoolean();
            droneDistance=extra.has("droneDistance")?extra.get("droneDistance").getAsDouble():7;
            droneHeight=extra.has("droneHeight")?extra.get("droneHeight").getAsDouble():3;
            if(!Double.isFinite(droneDistance)||droneDistance<2||droneDistance>10
                ||!Double.isFinite(droneHeight)||droneHeight<0.5||droneHeight>5){
                droneEnabled=false;configProblem="invalid_drone_dimensions";
            }
            System.out.println("[MCVisualDirector] Explicit observer profile active; awaiting native authentication");
        }catch(Exception error){configProblem=error.getClass().getSimpleName();}
    }
    private DirectorPolicy.Frame frame(class_310 client,String target){
        String server=client.method_1558()==null?null:client.method_1558().field_3761;
        String observer=client.method_1548().method_1676(),uuid=null;
        boolean near=false;
        var network=client.method_1562();
        if(network!=null&&target!=null){
            var entry=network.method_2874(target);
            if(entry!=null)uuid=entry.method_2966().getId().toString();
            if(uuid!=null&&client.field_1687!=null&&client.field_1724!=null)
                for(var player:client.field_1687.method_18456())
                    if(uuid.equals(player.method_5667().toString()))near=client.field_1724.method_5858(player)<=64;
        }
        var camera=client.method_1560();
        return new DirectorPolicy.Frame(server,observer,authenticated,
            client.field_1724!=null&&client.field_1724.method_7325(),uuid,near,
            camera==null?null:camera.method_5667().toString(),
            client.field_1724==null?null:client.field_1724.method_5667().toString());
    }
    private void tick(class_310 client){
        if(policy==null)return;
        long now=System.currentTimeMillis();
        if(client.field_1755!=null){if(++tick%20==0)diagnostics(client,true);return;}
        if(++tick%10==0){
            Path file=FabricLoader.getInstance().getConfigDir().resolve("mcvisual-director-request.json");
            try{
                if(Files.isRegularFile(file)&&Files.size(file)<=4096){
                    long changed=Files.getLastModifiedTime(file).toMillis();
                    if(changed!=lastFileTime){
                        lastFileTime=changed;
                        var request=new Gson().fromJson(Files.readString(file),DirectorPolicy.Request.class);
                        if(request!=null&&request.view()!=null&&request.view().startsWith("drone_")&&!droneEnabled)
                            throw new IllegalArgumentException("drone_rig_not_explicitly_enabled");
                        policy.offer(request,frame(client,request==null?null:request.target()),now);
                        requestProblem=null;
                    }
                }
            }catch(Exception failure){requestProblem=failure.getClass().getSimpleName();}
        }
        var action=policy.step(frame(client,policy.target()),now);
        if(!"attached".equals(policy.phase()))stopDrone("native_"+policy.phase());
        if(action.command()!=null&&client.method_1562()!=null){
            client.method_1562().method_45730(action.command());
            System.out.println("[MCVisualDirector] Observer-only camera request: "+policy.requestId());
        }
        if(action.view()!=null){
            stopDrone("normal_perspective");
            class_5498 view=switch(action.view()){
                case "third_person_back","drone_follow","drone_overview"->class_5498.field_26665;
                case "third_person_front"->class_5498.field_26666;
                default->class_5498.field_26664;
            };
            client.field_1690.method_31043(view);
            if(action.view().startsWith("drone_")&&droneEnabled){
                droneOverview="drone_overview".equals(action.view());
                droneUuid=frame(client,policy.target()).cameraUuid();droneActive=true;droneReason="awaiting_render";
            }
        }
        if(tick%20==0)diagnostics(client,true);
    }
    private static void stopDrone(String reason){droneActive=false;droneUuid=null;droneReason=reason;DRONE.reset();}
    static boolean droneMayRender(class_1297 target){
        if(!droneEnabled||!droneActive||target==null||!target.method_5667().toString().equals(droneUuid))return false;
        var client=class_310.method_1551();
        if(client.field_1724==null||!client.field_1724.method_7325()) {stopDrone("not_spectator");return false;}
        if(client.field_1690.method_31044()!=class_5498.field_26665){stopDrone("manual_perspective");return false;}
        if(client.field_1755!=null){DRONE.reset();return false;}
        return true;
    }
    static DroneFollow.Pose dronePose(class_1297 target,class_243 eye){
        return DRONE.next(droneUuid,eye.field_1352,eye.field_1351,eye.field_1350,target.method_36454(),
            System.nanoTime(),droneOverview?3.5:droneDistance,droneOverview?9:droneHeight);
    }
    static void droneRendered(float requested,float clipped){
        droneRequestedDistance=requested;droneClippedDistance=clipped;
        droneRenderedAt=System.currentTimeMillis();droneReason="rendered_with_native_collision";
    }
    private void diagnostics(class_310 client,boolean connected){
        if(policy==null)return;
        try{
            Map<String,Object> data=new LinkedHashMap<>();
            data.put("schema","mcvisual-native-director/v1");data.put("recordedAt",Instant.now().toString());
            data.put("connected",connected);data.put("authenticated",authenticated);data.put("phase",policy.phase());
            data.put("connectionEpoch",connectionEpoch);
            data.put("reason",policy.reason());data.put("requestId",policy.requestId());data.put("target",policy.target());
            var f=frame(client,policy.target());data.put("targetUuid",f.targetUuid());data.put("cameraUuid",f.cameraUuid());
            data.put("spectator",f.spectator());data.put("commandsSent",policy.commands());
            data.put("perspective",client.field_1690.method_31044().name());
            data.put("drone",Map.of("enabled",droneEnabled,"active",droneActive,
                "reason",droneReason,"lastRenderedAt",droneRenderedAt,
                "requestedDistance",droneRequestedDistance,"clippedDistance",droneClippedDistance));
            data.put("droneShot",droneOverview?"overview":"follow");
            data.put("screenOpen",client.field_1755!=null);
            data.put("hudFramesPerSecond",System.currentTimeMillis()-lastRenderedAt<3000?hudFramesPerSecond:null);
            data.put("configProblem",configProblem);data.put("requestProblem",requestProblem);
            Path out=FabricLoader.getInstance().getGameDir().resolve("diagnostics/mcvisual-native-director.json");
            Files.createDirectories(out.getParent());Files.writeString(out,new Gson().toJson(data));
        }catch(Exception failure){
            if(!diagnosticsFailed)System.out.println("[MCVisualDirector] Diagnostics unavailable: "+failure.getClass().getSimpleName());
            diagnosticsFailed=true;
        }
    }
}
