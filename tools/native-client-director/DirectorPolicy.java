package org.mcvisual.director;

import java.util.*;

/** Observer-only camera requests. No arbitrary command surface or invented ACK. */
public final class DirectorPolicy {
    public record Config(boolean enabled,String server,String observer,Set<String> targets,long minSwitchMs) {}
    public record Request(String id,String lease,String target,String view,long issuedAt,long expiresAt,String connectionEpoch) {
        public Request(String id,String lease,String target,String view,long issuedAt,long expiresAt){
            this(id,lease,target,view,issuedAt,expiresAt,null);
        }
    }
    public record CameraLife(String uuid,int entityId,long nativeWorldEpoch,boolean dead,String requestId,long observedAttachedAt) {
        public CameraLife(String uuid,int entityId,long nativeWorldEpoch,boolean dead){this(uuid,entityId,nativeWorldEpoch,dead,null,0);}
    }
    public record Frame(String server,String observer,boolean authenticated,boolean spectator,
                        String targetUuid,boolean targetNear,String cameraUuid,String observerUuid,long nativeWorldEpoch,
                        CameraLife cameraLife,boolean manualDetachRequested) {
        public Frame(String server,String observer,boolean authenticated,boolean spectator,
                     String targetUuid,boolean targetNear,String cameraUuid,String observerUuid,long nativeWorldEpoch){
            this(server,observer,authenticated,spectator,targetUuid,targetNear,cameraUuid,observerUuid,nativeWorldEpoch,null,false);
        }
        public Frame(String server,String observer,boolean authenticated,boolean spectator,
                     String targetUuid,boolean targetNear,String cameraUuid,String observerUuid){
            this(server,observer,authenticated,spectator,targetUuid,targetNear,cameraUuid,observerUuid,0);
        }
    }
    public record DetachObservation(long at,long nativeWorldEpoch,boolean spectator,
                                    String targetUuid,String cameraUuid,String observerUuid) {}
    public record OfferReceipt(String id,String lease,String target,long at,boolean accepted,String reason) {}
    public record PositionFailure(String requestId,String lease,String targetUuid,String observerUuid,
                                  String cameraUuid,long nativeWorldEpoch,long observedAt,int commands) {}
    public record Action(String command,String view) {
        static Action none(){return new Action(null,null);}
    }
    private final Config config;
    private final LinkedHashSet<String> seen=new LinkedHashSet<>();
    private Request request;
    private OfferReceipt offerReceipt;
    private String expectedUuid,phase="idle",reason="disabled",heldLease;
    private long phaseAt,lastSwitchAt=Long.MIN_VALUE/2,nativeWorldEpoch,worldChangedAt=-1;
    private String attachedObserverUuid;
    private Integer attachedEntityId;
    private long attachedEntityWorldEpoch;
    private CameraLife deadAttachment;
    private DetachObservation detachObservation;
    private PositionFailure positionFailure;
    private String requestObserverUuid;
    private static final long WORLD_SETTLE_MS=3000;
    private int commands;
    public DirectorPolicy(Config config){this.config=config;}
    public String target(){return request==null?null:request.target();}
    public String requestId(){return request==null?null:request.id();}
    public String view(){return request==null?null:request.view();}
    public String activeLease(){return request==null?null:request.lease();}
    public boolean hasSeen(String id){return seen.contains(id);}
    /** Cancel only an already bound local camera rig. In-flight teleport/attach remains unconfirmed. */
    public boolean cancelRig(String id,String lease,Frame f){
        if(!"attached".equals(phase)||!scoped(f)||!f.authenticated()||!f.spectator()||f.manualDetachRequested()
            ||request==null||!Objects.equals(request.id(),id)||!Objects.equals(request.lease(),lease)||!Objects.equals(expectedUuid,f.targetUuid())||!attached(f))return false;
        phase="cancelled";reason="local_camera_rig_cancelled";return true;
    }
    public boolean stopPendingRig(String id,String lease,Frame f){
        if(!pending()||!scoped(f)||!f.authenticated()||request==null||!Objects.equals(request.id(),id)||!Objects.equals(request.lease(),lease)||!Objects.equals(expectedUuid,f.targetUuid()))return false;
        phase="unknown";reason="camera_cancel_requires_reconciliation";return true;
    }
    public String phase(){return phase;}
    public String reason(){return reason;}
    public int commands(){return commands;}
    public OfferReceipt offerReceipt(){return offerReceipt;}
    public DetachObservation detachObservation(){return detachObservation;}
    public PositionFailure positionFailure(){return positionFailure;}
    public static boolean hideObserverBody(boolean scoped,boolean spectator,boolean self){
        return scoped&&spectator&&self;
    }
    /** Only the actual native system-message callback supplies this input. */
    public static boolean authReceipt(boolean current,String message){
        if(message==null)return current;
        String text=message.replaceAll("§.","");
        if(text.startsWith("[MC_AUTH_SUCCESS]"))return true;
        if(text.startsWith("[MC_AUTH_LOGIN]")||text.startsWith("[MC_AUTH_REQUIRED]")
            ||text.startsWith("[MC_AUTH_KICK]")||text.startsWith("[MC_AUTH_UNAVAILABLE]"))return false;
        return current;
    }
    private boolean scoped(Frame f){return config.enabled()&&Objects.equals(config.server(),f.server())
        &&config.observer()!=null&&config.observer().equalsIgnoreCase(f.observer());}
    private boolean allowed(String target){return target!=null&&target.matches("[A-Za-z0-9_]{1,16}")
        &&!target.equalsIgnoreCase(config.observer())&&config.targets()!=null
        &&config.targets().stream().anyMatch(n->n.equalsIgnoreCase(target));}
    private boolean pending(){return Set.of("mode","detach","position","attach","ready","world_transition","target_death_transition").contains(phase);}
    private boolean cameraSelf(Frame f){return f.observerUuid()!=null&&f.observerUuid().equals(f.cameraUuid());}
    private boolean attached(Frame f){return f.spectator()&&expectedUuid!=null&&expectedUuid.equals(f.cameraUuid());}
    private void noteWorld(Frame f,long now){
        if(nativeWorldEpoch>0&&f.nativeWorldEpoch()>nativeWorldEpoch)worldChangedAt=now;
        if(f.nativeWorldEpoch()>nativeWorldEpoch)nativeWorldEpoch=f.nativeWorldEpoch();
    }
    private boolean sameObserver(Frame f){return attachedObserverUuid!=null&&attachedObserverUuid.equals(f.observerUuid());}
    private boolean mayWaitForWorld(Frame f,long now){
        return f.nativeWorldEpoch()>0&&f.nativeWorldEpoch()==nativeWorldEpoch
            &&worldChangedAt>=0&&now-worldChangedAt>=0&&now-worldChangedAt<=WORLD_SETTLE_MS
            &&sameObserver(f)&&f.spectator()&&(f.cameraUuid()==null||cameraSelf(f)||attached(f))
            &&(f.targetUuid()==null||Objects.equals(expectedUuid,f.targetUuid()));
    }
    private void observeDetach(Frame f,long now){
        detachObservation=new DetachObservation(now,f.nativeWorldEpoch(),f.spectator(),f.targetUuid(),f.cameraUuid(),f.observerUuid());
    }
    private void pause(Frame f,long now,String why){heldLease=request.lease();phase="paused";reason=why;observeDetach(f,now);}
    private boolean nativeDeadAttachment(Frame f,long now){
        var life=f.cameraLife();
        boolean healthyBinding=life!=null&&attachedEntityId!=null&&attachedEntityId==life.entityId()
            &&attachedEntityWorldEpoch==nativeWorldEpoch;
        boolean nativeRequestBinding=life!=null&&request!=null&&Objects.equals(request.id(),life.requestId())
            &&life.observedAttachedAt()>=request.issuedAt()-1000&&life.observedAttachedAt()<=now+1000
            &&now-life.observedAttachedAt()<=3000&&life.entityId()>=0;
        return sameObserver(f)&&f.spectator()&&life!=null&&life.dead()
            &&(life.requestId()==null?healthyBinding:nativeRequestBinding)
            &&Objects.equals(expectedUuid,life.uuid())&&nativeWorldEpoch>0
            &&nativeWorldEpoch==f.nativeWorldEpoch()&&life.nativeWorldEpoch()==nativeWorldEpoch;
    }
    private boolean nativeDeath(Frame f,long now){return cameraSelf(f)&&nativeDeadAttachment(f,now);}
    /** A real death screen must not block the existing, bound camera-death lifecycle. */
    public boolean shouldAdvanceDeathOverlay(Frame f,boolean deathScreen,long now){
        return deathScreen&&request!=null&&Set.of("attached","target_death_transition").contains(phase)
            &&scoped(f)&&f.authenticated()&&!f.manualDetachRequested()&&nativeDeadAttachment(f,now)
            &&(cameraSelf(f)||attached(f));
    }
    /** Dismiss only a stale followed-player overlay on a natively living spectator self. */
    public boolean shouldDismissDeathOverlay(Frame f,boolean deathScreen,boolean observerAlive,long now){
        return deathScreen&&observerAlive&&request!=null&&scoped(f)&&f.authenticated()&&!f.manualDetachRequested()
            &&nativeDeath(f,now)&&("attached".equals(phase)||"stopped".equals(phase)&&"target_died".equals(reason));
    }
    private void rememberAttachedLife(Frame f){
        var life=f.cameraLife();
        if(attached(f)&&sameObserver(f)&&life!=null&&!life.dead()&&life.entityId()>=0
                &&Objects.equals(expectedUuid,life.uuid())&&f.nativeWorldEpoch()>0
                &&life.nativeWorldEpoch()==f.nativeWorldEpoch()){
            attachedEntityId=life.entityId();attachedEntityWorldEpoch=f.nativeWorldEpoch();
        }
    }
    private boolean refuse(String why){reason=why;return false;}
    public boolean offer(Request r,Frame f,long now){
        return offer(r,f,now,null,false);
    }
    public boolean offer(Request r,Frame f,long now,String connectionEpoch,boolean requireConnectionEpoch){
        String previousPhase=phase,previousReason=reason;
        boolean accepted;
        if(requireConnectionEpoch&&(r==null||r.connectionEpoch()==null||r.connectionEpoch().isBlank()))
            accepted=refuse("connection_epoch_required");
        else if(r!=null&&r.connectionEpoch()!=null&&!Objects.equals(r.connectionEpoch(),connectionEpoch))
            accepted=refuse("connection_epoch_mismatch");
        else accepted=offerChecked(r,f,now);
        // A refused new offer must not be mistaken for the previous camera request's result.
        offerReceipt=new OfferReceipt(r==null?null:bounded(r.id()),r==null?null:bounded(r.lease()),
            r!=null&&allowed(r.target())?r.target():null,now,accepted,reason);
        if(!accepted&&request!=null&&Objects.equals(previousPhase,phase))reason=previousReason;
        return accepted;
    }
    private static String bounded(String value){return value!=null&&value.matches("[A-Za-z0-9:_-]{1,80}")?value:null;}
    private boolean offerChecked(Request r,Frame f,long now){
        if(!scoped(f))return refuse("wrong_profile");
        if(!f.authenticated())return refuse("await_authentication");
        if(request!=null&&f.manualDetachRequested()
                &&Set.of("attached","world_transition","target_death_transition").contains(phase)){
            pause(f,now,"manual_detach_input");return false;
        }
        if(r==null||r.id()==null||r.lease()==null||!r.id().matches("[A-Za-z0-9:_-]{1,80}")
            ||!r.lease().matches("[A-Za-z0-9_-]{1,80}")||!allowed(r.target())
            ||r.view()==null||!(Set.of("first_person","third_person_back","third_person_front").contains(r.view())||CinematicRig.VIEWS.contains(r.view())||OrthographicRig.supportsView(r.view())))
            return refuse("invalid_request");
        if(r.issuedAt()>now+1000||r.expiresAt()<=now||r.expiresAt()-r.issuedAt()>10_000
            ||r.expiresAt()<=r.issuedAt())return refuse("expired_request");
        if(seen.contains(r.id()))return refuse("already_seen");
        if(pending())return refuse("previous_request_pending");
        if(Objects.equals(heldLease,r.lease()))return refuse("manual_override");
        if(f.targetUuid()==null)return refuse("target_offline");
        if(request!=null&&!request.target().equalsIgnoreCase(r.target())
            &&now-lastSwitchAt<Math.max(10_000,config.minSwitchMs()))return refuse("switch_cooldown");
        seen.add(r.id());while(seen.size()>32)seen.remove(seen.iterator().next());
        request=r;expectedUuid=f.targetUuid();requestObserverUuid=f.observerUuid();positionFailure=null;commands=0;phase="ready";reason="accepted";phaseAt=now;
        nativeWorldEpoch=f.nativeWorldEpoch();worldChangedAt=-1;attachedObserverUuid=null;attachedEntityId=null;attachedEntityWorldEpoch=0;deadAttachment=null;detachObservation=null;
        return true;
    }
    public Action step(Frame f,long now){
        if(request==null)return Action.none();
        // Preserve manual/unknown terminal state even if the old target later disconnects.
        if(Set.of("paused","stopped","unknown","cancelled").contains(phase))return Action.none();
        if(!scoped(f)||!f.authenticated()){phase="stopped";reason="scope_or_auth_lost";return Action.none();}
        // A configured native detach key wins even when the target dies in the same frame.
        if(f.manualDetachRequested()&&Set.of("attached","world_transition","target_death_transition").contains(phase)){
            pause(f,now,"manual_detach_input");return Action.none();
        }
        if("target_death_transition".equals(phase)){
            if(now-phaseAt>8000||now<phaseAt){phase="unknown";reason="native_death_detach_timeout";return Action.none();}
            if(!sameObserver(f)||!f.spectator()||deadAttachment==null
                    ||f.nativeWorldEpoch()!=deadAttachment.nativeWorldEpoch()
                    ||f.cameraUuid()!=null&&!cameraSelf(f)&&!attached(f)){
                pause(f,now,"native_death_detach_scope_changed");return Action.none();
            }
            if(cameraSelf(f)){
                phase="stopped";reason="target_died";observeDetach(f,now);
            }
            return Action.none();
        }
        // Only the exact previously attached native entity can prove death. Tab presence,
        // a missing player, a changed dimension or a chat message never supplies this proof.
        if("attached".equals(phase)&&nativeDeath(f,now)){
            phase="stopped";reason="target_died";observeDetach(f,now);return Action.none();
        }
        if("world_transition".equals(phase)){
            // Passive readback only: never send a teleport/spectate or restore a view here.
            // The original deadline cannot be extended by another world replacement.
            if(f.targetUuid()!=null&&!Objects.equals(expectedUuid,f.targetUuid())){
                phase="stopped";reason="target_identity_lost";return Action.none();
            }
            if(!sameObserver(f)||!f.spectator()||f.cameraUuid()!=null&&!cameraSelf(f)&&!attached(f)){
                pause(f,now,"manual_or_native_detach");return Action.none();
            }
            if(f.nativeWorldEpoch()!=nativeWorldEpoch){
                pause(f,now,"native_world_transition_unconfirmed");return Action.none();
            }
            if(now-worldChangedAt>WORLD_SETTLE_MS||now<worldChangedAt){
                pause(f,now,"native_world_transition_unconfirmed");return Action.none();
            }
            if(attached(f)&&Objects.equals(expectedUuid,f.targetUuid())){
                nativeWorldEpoch=f.nativeWorldEpoch();worldChangedAt=-1;phase="attached";reason="native_world_attachment_restored";
                rememberAttachedLife(f);
            }
            return Action.none();
        }
        if("attached".equals(phase)){
            noteWorld(f,now);
            if(!attached(f)||f.targetUuid()==null){
                if(mayWaitForWorld(f,now)){
                    phase="world_transition";reason="native_world_replacement";observeDetach(f,now);return Action.none();
                }
            }
        }
        if(!Objects.equals(expectedUuid,f.targetUuid())){phase="stopped";reason="target_identity_lost";return Action.none();}
        if("attached".equals(phase)){
            if(!attached(f))pause(f,now,"manual_or_native_detach");
            else rememberAttachedLife(f);
            return Action.none();
        }
        if(!pending())return Action.none();
        if(now-phaseAt>8000){
            // Positioning never sent a target attachment command. Once this
            // request stops, its state machine cannot attach a late respawn.
            // Preserve the unconfirmed teleport, but publish the known self
            // camera so the host may choose another subject under a NEW id.
            if("position".equals(phase)&&f.spectator()&&!f.manualDetachRequested()
                    &&requestObserverUuid!=null&&requestObserverUuid.equals(f.observerUuid())
                    &&cameraSelf(f)&&f.nativeWorldEpoch()>0){
                positionFailure=new PositionFailure(request.id(),request.lease(),expectedUuid,
                    f.observerUuid(),f.cameraUuid(),f.nativeWorldEpoch(),now,commands);
                phase="stopped";reason="target_position_unconfirmed";observeDetach(f,now);
            }else{phase="unknown";reason="native_attachment_timeout";}
            return Action.none();
        }
        if(attached(f)){
            var life=f.cameraLife();
            if(life!=null&&life.dead()&&Objects.equals(expectedUuid,life.uuid())&&life.entityId()>=0
                    &&life.nativeWorldEpoch()>0&&life.nativeWorldEpoch()==f.nativeWorldEpoch()){
                // A reframe/attachment can race native death before any healthy bind.
                // Release only this known dead camera once, then wait for native self ACK.
                deadAttachment=life;attachedObserverUuid=f.observerUuid();nativeWorldEpoch=f.nativeWorldEpoch();
                phase="target_death_transition";reason="target_dead_at_attachment";phaseAt=now;commands++;
                return new Action("minecraft:spectate",null);
            }
            phase="attached";reason="native_camera_confirmed";lastSwitchAt=now;
            nativeWorldEpoch=f.nativeWorldEpoch();attachedObserverUuid=f.observerUuid();worldChangedAt=-1;
            rememberAttachedLife(f);
            return new Action(null,request.view());
        }
        if(!f.spectator()){
            if("ready".equals(phase)){phase="mode";phaseAt=now;commands++;return new Action("minecraft:gamemode spectator",null);}
            return Action.none();
        }
        if("mode".equals(phase)){phase="ready";phaseAt=now;}
        if("detach".equals(phase)) {
            // In the same world, a teleport does not detach the previous player.
            // Its camera tick otherwise pins the observer back to the old subject.
            if(!cameraSelf(f))return Action.none();
            phase="ready";phaseAt=now;
        }
        if(!f.targetNear()){
            if("ready".equals(phase)){
                if(!cameraSelf(f)){
                    phase="detach";phaseAt=now;commands++;return new Action("minecraft:spectate",null);
                }
                phase="position";phaseAt=now;commands++;return new Action("minecraft:tp @s "+request.target(),null);
            }
            return Action.none();
        }
        if("ready".equals(phase)||"position".equals(phase)){
            phase="attach";phaseAt=now;commands++;return new Action("minecraft:spectate "+request.target(),null);
        }
        return Action.none();
    }
}
