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
    private DirectorPolicy policy;
    private boolean authenticated,diagnosticsFailed;
    private long tick,lastFileTime=-1,frames,frameWindowAt,lastRenderedAt;
    private Double hudFramesPerSecond;
    private String configProblem,requestProblem,connectionEpoch;
    @Override public void onInitializeClient(){
        ClientPlayConnectionEvents.JOIN.register((handler,sender,client)->join(client));
        ClientPlayConnectionEvents.DISCONNECT.register((handler,client)->{
            authenticated=false;diagnostics(client,false);policy=null;});
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
        policy=null;authenticated=false;tick=0;lastFileTime=-1;frames=0;frameWindowAt=0;connectionEpoch=UUID.randomUUID().toString();
        hudFramesPerSecond=null;configProblem=null;requestProblem=null;diagnosticsFailed=false;
        try{
            Path file=FabricLoader.getInstance().getConfigDir().resolve("mcvisual-native-director.json");
            if(!Files.isRegularFile(file)||Files.size(file)>16_384)return;
            DirectorPolicy.Config config=new Gson().fromJson(Files.readString(file),DirectorPolicy.Config.class);
            if(config==null||!config.enabled()||config.server()==null||config.observer()==null
                ||config.targets()==null||config.targets().isEmpty()||config.targets().size()>16
                ||client.method_1558()==null||!config.server().equals(client.method_1558().field_3761)
                ||!config.observer().equalsIgnoreCase(client.method_1548().method_1676()))return;
            policy=new DirectorPolicy(config);
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
            camera==null?null:camera.method_5667().toString());
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
                        policy.offer(request,frame(client,request==null?null:request.target()),now);
                        requestProblem=null;
                    }
                }
            }catch(Exception failure){requestProblem=failure.getClass().getSimpleName();}
        }
        var action=policy.step(frame(client,policy.target()),now);
        if(action.command()!=null&&client.method_1562()!=null){
            client.method_1562().method_45730(action.command());
            System.out.println("[MCVisualDirector] Observer-only camera request: "+policy.requestId());
        }
        if(action.view()!=null){
            class_5498 view=switch(action.view()){
                case "third_person_back"->class_5498.field_26665;
                case "third_person_front"->class_5498.field_26666;
                default->class_5498.field_26664;
            };
            client.field_1690.method_31043(view);
        }
        if(tick%20==0)diagnostics(client,true);
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
