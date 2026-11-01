package org.mcvisual.director;

import com.google.gson.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.message.v1.ClientReceiveMessageEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents;
import net.minecraft.*;

/** Explicit opt-in companion for one existing authenticated spectator client. */
public final class NativeDirectorClient implements ClientModInitializer {
    private static NativeDirectorClient instance;
    private static final CinematicRig DRONE=new CinematicRig();
    private static final CloseView CLOSE=new CloseView();
    private static final NativeOrthographic ORTHO=new NativeOrthographic();
    private static boolean droneEnabled,droneActive,worldTransitionActive,cinematicEnabled,autoCloseEnabled;
    private static String droneUuid,droneReason="disabled";
    private static double droneDistance=7,droneHeight=3;
    private static String droneView="drone_follow";
    private static long droneRenderedAt;
    private static float droneRequestedDistance,droneClippedDistance;
    private DirectorPolicy policy;
    private boolean authenticated,diagnosticsFailed,requireConnectionEpoch;
    private long tick,lastFileTime=-1,lastCancelFileTime=-1,frames,frameWindowAt,lastRenderedAt;
    private Map<String,Object> cancelReceipt;
    private final Map<String,String> cancelledIntents=new LinkedHashMap<>();
    private Double hudFramesPerSecond;
    private String configProblem,requestProblem,connectionEpoch;
    private Object observedWorld;
    private class_1297 attachedCameraEntity;
    private Object attachedCameraWorld;
    private long attachedCameraEpoch;
    private String attachedCameraRequest;
    private long attachedCameraObservedAt;
    private boolean manualDetachRequested;
    private long nativeWorldEpoch;
    private Set<String> trackedTargets=Set.of();
    @Override public void onInitializeClient(){
        instance=this;
        ClientPlayConnectionEvents.JOIN.register((handler,sender,client)->join(client));
        ClientPlayConnectionEvents.DISCONNECT.register((handler,client)->{
            authenticated=false;stopDrone("disconnected");ORTHO.stop("disconnected");FrameBlend.abort();diagnostics(client,false);policy=null;});
        ClientReceiveMessageEvents.GAME.register((message,overlay)->{
            if(policy==null)return;
            authenticated=DirectorPolicy.authReceipt(authenticated,message.getString());
        });
        ClientTickEvents.END_CLIENT_TICK.register(this::tick);
        // Register after normal mod initialization so the frozen frame also
        // covers the native observer HUD while a remote camera is loading.
        ClientLifecycleEvents.CLIENT_STARTED.register(client->HudRenderCallback.EVENT.register((draw,delta)->renderTransition(client,draw)));
        ClientLifecycleEvents.CLIENT_STOPPING.register(client->FrameBlend.close());
        WorldRenderEvents.END.register(context->{if(policy!=null&&authenticated&&"attached".equals(policy.phase()))ORTHO.confirmRendered(class_310.method_1551());});
        HudRenderCallback.EVENT.register((draw,delta)->{
            if(policy==null)return;long now=System.currentTimeMillis();lastRenderedAt=now;
            if(frameWindowAt==0)frameWindowAt=now;
            frames++;if(now-frameWindowAt>=1000){hudFramesPerSecond=frames*1000.0/(now-frameWindowAt);frames=0;frameWindowAt=now;}
            var c=class_310.method_1551();if(authenticated&&c.field_1755==null&&c.field_1724!=null&&c.field_1724.method_7325()){
                String mode=ORTHO.projecting()?(ORTHO.roomClip()?"正交 · 房间剖视":"正交 · 等距全景"):CLOSE.firstPerson()?"透视 · 近墙避挡":"透视 · 自动跟随";
                draw.method_25294(78,8,78+c.field_1772.method_1727(mode)+12,25,0xb0000000);
                draw.method_51433(c.field_1772,mode,84,12,ORTHO.projecting()?0xff80f5d2:0xfff3d9a1,true);
            }
        });
    }
    private void join(class_310 client){
        attachedCameraEntity=null;attachedCameraWorld=null;attachedCameraEpoch=0;attachedCameraRequest=null;attachedCameraObservedAt=0;manualDetachRequested=false;
        droneEnabled=false;requireConnectionEpoch=false;stopDrone("new_connection");ORTHO.configure(false);trackedTargets=Set.of();
        policy=null;authenticated=false;tick=0;lastFileTime=-1;lastCancelFileTime=-1;cancelReceipt=null;cancelledIntents.clear();frames=0;frameWindowAt=0;connectionEpoch=UUID.randomUUID().toString();
        hudFramesPerSecond=null;configProblem=null;requestProblem=null;diagnosticsFailed=false;
        observedWorld=client.field_1687;nativeWorldEpoch=observedWorld==null?0:1;worldTransitionActive=false;
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
            trackedTargets=Set.copyOf(config.targets());
            var extra=JsonParser.parseString(source).getAsJsonObject();
            FrameBlend.configure(extra.has("transitionsEnabled")&&extra.get("transitionsEnabled").getAsBoolean(),extra.has("transitionMs")?extra.get("transitionMs").getAsInt():350);
            requireConnectionEpoch=extra.has("requireConnectionEpoch")&&extra.get("requireConnectionEpoch").getAsBoolean();
            droneEnabled=extra.has("droneEnabled")&&extra.get("droneEnabled").getAsBoolean();
            cinematicEnabled=extra.has("cinematicEnabled")&&extra.get("cinematicEnabled").getAsBoolean();
            autoCloseEnabled=extra.has("autoCloseView")&&extra.get("autoCloseView").getAsBoolean();
            ORTHO.configure(extra.has("orthographicEnabled")&&extra.get("orthographicEnabled").getAsBoolean());
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
        DirectorPolicy.CameraLife life=null;
        if(attachedCameraEntity!=null&&attachedCameraWorld==client.field_1687&&attachedCameraEpoch==nativeWorldEpoch
                &&Objects.equals(attachedCameraRequest,policy.requestId())
                &&Objects.equals(uuid,attachedCameraEntity.method_5667().toString())){
            boolean dead=attachedCameraEntity instanceof class_1309 living&&living.method_29504();
            var removal=attachedCameraEntity.method_35049();
            dead|=removal==class_1297.class_5529.field_26998;
            life=new DirectorPolicy.CameraLife(attachedCameraEntity.method_5667().toString(),
                attachedCameraEntity.method_5628(),attachedCameraEpoch,dead,attachedCameraRequest,attachedCameraObservedAt);
        }
        return new DirectorPolicy.Frame(server,observer,authenticated,
            client.field_1724!=null&&client.field_1724.method_7325(),uuid,near,
            camera==null?null:camera.method_5667().toString(),
            client.field_1724==null?null:client.field_1724.method_5667().toString(),nativeWorldEpoch,life,manualDetachRequested);
    }
    private void observeRequestCamera(class_310 client,long now){
        if(policy.requestId()==null||Set.of("paused","unknown","stopped","cancelled").contains(policy.phase()))return;
        var camera=client.method_1560();var network=client.method_1562();
        var entry=network==null||policy.target()==null?null:network.method_2874(policy.target());
        if(camera==null||camera==client.field_1724||entry==null||client.field_1687==null
                ||!entry.method_2966().getId().equals(camera.method_5667()))return;
        // Only the active request's actual camera is observed here. Offer/diagnostic
        // frame reads are pure and can never retag a past request's corpse.
        attachedCameraEntity=camera;attachedCameraWorld=client.field_1687;attachedCameraEpoch=nativeWorldEpoch;
        attachedCameraRequest=policy.requestId();attachedCameraObservedAt=now;
    }
    private static boolean inputScope(long window){
        var self=instance;var client=class_310.method_1551();
        return self!=null&&self.policy!=null&&self.authenticated&&client.field_1755==null
            &&client.field_1724!=null&&client.field_1724.method_7325()
            &&client.method_22683().method_4490()==window
            &&Set.of("attached","world_transition","target_death_transition").contains(self.policy.phase());
    }
    public static void keyboardDetach(long window,int key,int scan){
        if(inputScope(window)&&class_310.method_1551().field_1690.field_1832.method_1417(key,scan))
            instance.manualDetachRequested=true;
    }
    public static void mouseDetach(long window,int button){
        if(inputScope(window)&&class_310.method_1551().field_1690.field_1832.method_1433(button))
            instance.manualDetachRequested=true;
    }
    public static boolean hideObserverBody(class_1297 entity){
        var client=class_310.method_1551();
        return DirectorPolicy.hideObserverBody(instance!=null&&instance.policy!=null,
            client.field_1724!=null&&client.field_1724.method_7325(),entity!=null&&entity==client.field_1724);
    }
    private void tick(class_310 client){
        if(policy==null)return;
        long now=System.currentTimeMillis();
        readCancel(client,now);
        if(ORTHO.manual())manualDetachRequested=true;
        // A world object replacement is native evidence; coordinates/distance are not.
        if(client.field_1687!=null&&client.field_1687!=observedWorld){
            observedWorld=client.field_1687;nativeWorldEpoch++;
        }
        if(droneActive&&client.field_1690.method_31044()!=(CLOSE.firstPerson()?class_5498.field_26664:class_5498.field_26665)){
            manualDetachRequested=true;stopDrone("manual_perspective");
        }
        if(client.field_1755!=null){if(++tick%20==0)diagnostics(client,true);return;}
        if(++tick%10==0){
            Path file=FabricLoader.getInstance().getConfigDir().resolve("mcvisual-director-request.json");
            try{
                if(Files.isRegularFile(file)&&Files.size(file)<=4096){
                    long changed=Files.getLastModifiedTime(file).toMillis();
                    if(changed!=lastFileTime){
                        lastFileTime=changed;
                        var request=new Gson().fromJson(Files.readString(file),DirectorPolicy.Request.class);
                        if(request!=null&&Objects.equals(cancelledIntents.get(request.id()),request.lease()))throw new IllegalArgumentException("cancelled_before_admission");
                        if(request!=null&&request.view()!=null&&request.view().startsWith("drone_")&&!droneEnabled)
                            throw new IllegalArgumentException("drone_rig_not_explicitly_enabled");
                        if(request!=null&&request.view()!=null&&CinematicRig.VIEWS.contains(request.view())
                            &&!Set.of("drone_follow","drone_overview").contains(request.view())&&!cinematicEnabled)
                            throw new IllegalArgumentException("cinematic_rig_not_explicitly_enabled");
                        if(request!=null&&OrthographicRig.supportsView(request.view())&&!ORTHO.ready())
                            throw new IllegalArgumentException("orthographic_backend_unavailable");
                        if(policy.offer(request,frame(client,request==null?null:request.target()),now,connectionEpoch,requireConnectionEpoch)){
                            manualDetachRequested=false;
                            boolean sameRig=droneActive&&request.view().startsWith("drone_")
                                &&Objects.equals(droneUuid,frame(client,request.target()).targetUuid());
                            if(!sameRig)FrameBlend.begin(client,request.id());
                        }
                        requestProblem=null;
                    }
                }
            }catch(Exception failure){requestProblem=failure.getClass().getSimpleName();}
        }
        observeRequestCamera(client,now);
        var action=policy.step(frame(client,policy.target()),now);
        worldTransitionActive="world_transition".equals(policy.phase());
        if(worldTransitionActive){DRONE.reset();ORTHO.stop("native_world_replacement");droneReason="native_world_replacement";}
        else if(!"attached".equals(policy.phase())){stopDrone("native_"+policy.phase());ORTHO.stop("native_"+policy.phase());}
        if(action.command()!=null&&client.method_1562()!=null){
            client.method_1562().method_45730(action.command());
            System.out.println("[MCVisualDirector] Observer-only camera request: "+policy.requestId());
        }
        if(action.view()!=null){
            boolean orthographic=OrthographicRig.supportsView(action.view());
            boolean preserveRig=droneActive&&action.view().startsWith("drone_")
                &&Objects.equals(droneUuid,frame(client,policy.target()).cameraUuid());
            if(!preserveRig)stopDrone("normal_perspective");
            class_5498 view=switch(action.view()){
                case "third_person_back"->class_5498.field_26665;
                case "third_person_front"->class_5498.field_26666;
                default->action.view().startsWith("drone_")||orthographic?class_5498.field_26665:class_5498.field_26664;
            };
            client.field_1690.method_31043(view);
            if(orthographic){if(!ORTHO.begin(policy.requestId(),action.view(),client,nativeWorldEpoch,now))perspectiveFallback(client,"orthographic_preflight_failed");}
            else ORTHO.stop("perspective_requested");
            if(action.view().startsWith("drone_")&&droneEnabled){
                droneView=action.view();DRONE.begin(policy.requestId(),droneView,System.nanoTime());CLOSE.begin();
                droneUuid=frame(client,policy.target()).cameraUuid();droneActive=true;droneReason="awaiting_render";
            }
        }
        if("attached".equals(policy.phase())&&client.field_1755==null){
            if(!ORTHO.active())ORTHO.observe(client,client.method_1560(),nativeWorldEpoch,now,false,null);
            if(!ORTHO.tick(client,nativeWorldEpoch,now))perspectiveFallback(client,"orthographic_occlusion_fallback");
        }
        if(tick%20==0)diagnostics(client,true);
    }
    private static void stopDrone(String reason){droneActive=false;droneUuid=null;droneReason=reason;DRONE.reset();CLOSE.stop();}
    private void perspectiveFallback(class_310 client,String reason){
        FrameBlend.begin(client,policy.requestId());client.field_1690.method_31043(class_5498.field_26665);
        if(droneEnabled){droneView="drone_eye";DRONE.begin(policy.requestId(),droneView,System.nanoTime());CLOSE.begin();
            droneUuid=frame(client,policy.target()).cameraUuid();droneActive=true;droneReason=reason;}
    }
    private void readCancel(class_310 client,long now){
        try{
            Path file=FabricLoader.getInstance().getConfigDir().resolve("mcvisual-director-cancel.json");
            if(!Files.isRegularFile(file)||Files.size(file)>4096)return;
            long modified=Files.getLastModifiedTime(file).toMillis();if(modified==lastCancelFileTime)return;lastCancelFileTime=modified;
            var r=JsonParser.parseString(Files.readString(file)).getAsJsonObject();
            long issued=r.get("issuedAt").getAsLong(),expires=r.get("expiresAt").getAsLong();
            if(issued>now+1000||expires<now||expires-issued>10000||expires<issued||!connectionEpoch.equals(r.get("connectionEpoch").getAsString()))return;
            String id=r.get("id").getAsString(),lease=r.get("lease").getAsString(),target=r.get("target").getAsString();
            if(!id.matches("[A-Za-z0-9:_-]{1,80}")||!lease.matches("[A-Za-z0-9_-]{1,80}")||!trackedTargets.contains(target)||!authenticated)return;
            var frame=frame(client,target);if(frame.targetUuid()==null||!frame.targetUuid().equals(r.get("targetUuid").getAsString()))return;
            if(cancelledIntents.size()>=256&&!cancelledIntents.containsKey(id))throw new IllegalStateException("cancel_archive_required");
            String outcome=null;
            if(!policy.hasSeen(id)){cancelledIntents.put(id,lease);outcome="cancelled";}
            else if(policy.cancelRig(id,lease,frame)){cancelledIntents.put(id,lease);stopDrone("local_rig_cancelled");ORTHO.stop("cancelled");outcome="cancelled";}
            else if(policy.stopPendingRig(id,lease,frame)){cancelledIntents.put(id,lease);stopDrone("cancel_pending_reconciliation");ORTHO.stop("cancelled");outcome="unknown";}
            if(outcome!=null){
                cancelReceipt=Map.of("id",id,"lease",lease,"connectionEpoch",connectionEpoch,
                    "nativeWorldEpoch",nativeWorldEpoch,"targetUuid",frame.targetUuid(),"at",now,"phase",outcome);
            }
        }catch(Exception error){requestProblem="cancel_"+error.getClass().getSimpleName();}
    }
    private void renderTransition(class_310 client,class_332 draw){
        if(policy==null||!authenticated){FrameBlend.abort();return;}
        var f=frame(client,policy.target());
        boolean ready="attached".equals(policy.phase())&&f.targetUuid()!=null&&f.targetUuid().equals(f.cameraUuid());
        boolean terminal=manualDetachRequested||Set.of("paused","unknown","stopped","cancelled").contains(policy.phase());
        if(ready&&droneActive&&System.currentTimeMillis()-droneRenderedAt<200)DRONE.confirmRendered();
        FrameBlend.draw(client,draw,policy.requestId(),ready,terminal);
    }
    public static boolean droneMayRender(class_1297 target){
        if(worldTransitionActive){DRONE.reset();return false;}
        if(!droneEnabled||!droneActive||target==null||!target.method_5667().toString().equals(droneUuid))return false;
        var client=class_310.method_1551();
        if(client.field_1724==null||!client.field_1724.method_7325()) {stopDrone("not_spectator");return false;}
        if(client.field_1690.method_31044()!=(CLOSE.firstPerson()?class_5498.field_26664:class_5498.field_26665)){stopDrone("manual_perspective");return false;}
        if(client.field_1755!=null){DRONE.suspend();return false;}
        return true;
    }
    public static DroneFollow.Pose dronePose(class_1297 target,class_243 eye){
        return DRONE.next(droneUuid,eye.field_1352,eye.field_1351,eye.field_1350,target.method_36454(),
            System.nanoTime(),droneDistance,droneHeight);
    }
    public static java.util.List<DroneFollow.Pose> dronePath(){return DRONE.path();}
    public static boolean finiteShotActive(){return DRONE.finiteActive();}
    public static void dronePathResult(boolean clear){DRONE.pathResult(clear,System.nanoTime());}
    public static void dronePathBlocked(){DRONE.abort("native_path_changed");DRONE.closeFallback();}
    public static boolean closeView(float clipped,boolean known){
        if(!autoCloseEnabled)return false;
        boolean first=CLOSE.update(System.currentTimeMillis(),clipped,known);
        if(first)DRONE.closeFallback();
        var client=class_310.method_1551();client.field_1690.method_31043(first?class_5498.field_26664:class_5498.field_26665);
        return first;
    }
    public static double closeRecovery(){return CLOSE.recovery(System.currentTimeMillis());}
    public static void droneRendered(float requested,float clipped){
        droneRequestedDistance=requested;droneClippedDistance=clipped;
        droneRenderedAt=System.currentTimeMillis();droneReason="rendered_with_native_collision";
    }
    private void diagnostics(class_310 client,boolean connected){
        if(policy==null)return;
        try{
            Map<String,Object> data=new LinkedHashMap<>();
            data.put("schema","mcvisual-native-director/v1");data.put("recordedAt",Instant.now().toString());
            data.put("nativeVersion","0.1.12");
            data.put("transition",FrameBlend.status());
            data.put("positionFailure",policy.positionFailure());
            data.put("connected",connected);data.put("authenticated",authenticated);data.put("phase",policy.phase());
            data.put("connectionEpoch",connectionEpoch);data.put("connectionBoundRequests",requireConnectionEpoch);
            data.put("reason",policy.reason());data.put("requestId",policy.requestId());data.put("target",policy.target());
            data.put("activeLease",policy.activeLease());data.put("cancelReceipt",cancelReceipt);data.put("rigCancelSupported",true);data.put("renderedAt",lastRenderedAt);
            var f=frame(client,policy.target());data.put("targetUuid",f.targetUuid());data.put("cameraUuid",f.cameraUuid());
            data.put("server",f.server());data.put("observer",f.observer());
            data.put("observerUuid",f.observerUuid());data.put("offer",policy.offerReceipt());
            data.put("nativeWorldEpoch",nativeWorldEpoch);data.put("detachObservation",policy.detachObservation());
            data.put("cameraLife",f.cameraLife());data.put("manualDetachRequested",f.manualDetachRequested());
            data.put("observerBodyHidden",hideObserverBody(client.field_1724));
            // Tab presence is not position. Unloaded/other-world players have no invented coordinates.
            List<Map<String,Object>> targets=new ArrayList<>();long sampledAt=System.currentTimeMillis();
            for(String name:trackedTargets){
                Map<String,Object> target=new LinkedHashMap<>();target.put("name",name);target.put("sampledAt",sampledAt);
                var entry=client.method_1562()==null?null:client.method_1562().method_2874(name);
                String uuid=entry==null?null:entry.method_2966().getId().toString();
                target.put("uuid",uuid);target.put("loaded",false);
                if(uuid!=null&&client.field_1687!=null)for(var player:client.field_1687.method_18456()){
                    if(!uuid.equals(player.method_5667().toString()))continue;
                    target.put("loaded",true);
                    target.put("entityId",player.method_5628());
                    target.put("alive",player.method_5805()&&!player.method_29504()
                        &&player.method_35049()!=class_1297.class_5529.field_26998);
                    target.put("position",List.of(player.method_23317(),player.method_23318(),player.method_23321()));
                    target.put("scope",connectionEpoch+":"+client.field_1687.method_27983().toString());break;
                }
                targets.add(target);
            }
            data.put("targets",targets);
            data.put("spectator",f.spectator());data.put("commandsSent",policy.commands());
            data.put("perspective",client.field_1690.method_31044().name());
            data.put("drone",Map.of("enabled",droneEnabled,"active",droneActive,
                "reason",droneReason,"lastRenderedAt",droneRenderedAt,
                "requestedDistance",droneRequestedDistance,"clippedDistance",droneClippedDistance));
            data.put("droneShot",droneView);data.put("shotExecution",OrthographicRig.supportsView(policy.view())?ORTHO.status():DRONE.status());
            data.put("effectiveView",ORTHO.active()?policy.view():CLOSE.firstPerson()?"first_person":DRONE.status().get("effectiveView"));
            var ortho=ORTHO.status();data.put("orthographic",ortho);data.put("projection",ortho.get("projection"));data.put("projectionProfile",ortho.get("projectionProfile"));data.put("spatial",ORTHO.spatial());
            data.put("closeView",Map.of("enabled",autoCloseEnabled,"firstPerson",CLOSE.firstPerson(),"reason",CLOSE.reason()));
            Set<String> views=new LinkedHashSet<>(Set.of("first_person","third_person_back","third_person_front"));
            if(droneEnabled)views.addAll(cinematicEnabled?CinematicRig.VIEWS:Set.of("drone_follow","drone_overview"));if(ORTHO.ready())views.addAll(OrthographicRig.PRESETS.keySet());data.put("availableViews",views);
            data.put("screenOpen",client.field_1755!=null);
            data.put("hudFramesPerSecond",System.currentTimeMillis()-lastRenderedAt<3000?hudFramesPerSecond:null);
            data.put("configProblem",configProblem);data.put("requestProblem",requestProblem);
            Path out=FabricLoader.getInstance().getGameDir().resolve("diagnostics/mcvisual-native-director.json");
            Files.createDirectories(out.getParent());Path temporary=out.resolveSibling(out.getFileName()+".tmp");
            Files.writeString(temporary,new Gson().toJson(data));
            Files.move(temporary,out,StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);
        }catch(Exception failure){
            if(!diagnosticsFailed)System.out.println("[MCVisualDirector] Diagnostics unavailable: "+failure.getClass().getSimpleName());
            diagnosticsFailed=true;
        }
    }
}
