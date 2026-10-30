package org.mcvisual.director;

import java.util.*;

/** Observer-only camera requests. No arbitrary command surface or invented ACK. */
public final class DirectorPolicy {
    public record Config(boolean enabled,String server,String observer,Set<String> targets,long minSwitchMs) {}
    public record Request(String id,String lease,String target,String view,long issuedAt,long expiresAt) {}
    public record Frame(String server,String observer,boolean authenticated,boolean spectator,
                        String targetUuid,boolean targetNear,String cameraUuid,String observerUuid) {}
    public record OfferReceipt(String id,String lease,String target,long at,boolean accepted,String reason) {}
    public record Action(String command,String view) {
        static Action none(){return new Action(null,null);}
    }
    private final Config config;
    private final LinkedHashSet<String> seen=new LinkedHashSet<>();
    private Request request;
    private OfferReceipt offerReceipt;
    private String expectedUuid,phase="idle",reason="disabled",heldLease;
    private long phaseAt,lastSwitchAt=Long.MIN_VALUE/2;
    private int commands;
    public DirectorPolicy(Config config){this.config=config;}
    public String target(){return request==null?null:request.target();}
    public String requestId(){return request==null?null:request.id();}
    public String phase(){return phase;}
    public String reason(){return reason;}
    public int commands(){return commands;}
    public OfferReceipt offerReceipt(){return offerReceipt;}
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
    private boolean pending(){return Set.of("mode","detach","position","attach","ready").contains(phase);}
    private boolean cameraSelf(Frame f){return f.observerUuid()!=null&&f.observerUuid().equals(f.cameraUuid());}
    private boolean attached(Frame f){return f.spectator()&&expectedUuid!=null&&expectedUuid.equals(f.cameraUuid());}
    private boolean refuse(String why){reason=why;return false;}
    public boolean offer(Request r,Frame f,long now){
        boolean accepted=offerChecked(r,f,now);
        // A refused new offer must not be mistaken for the previous camera request's result.
        offerReceipt=new OfferReceipt(r==null?null:bounded(r.id()),r==null?null:bounded(r.lease()),
            r!=null&&allowed(r.target())?r.target():null,now,accepted,reason);
        return accepted;
    }
    private static String bounded(String value){return value!=null&&value.matches("[A-Za-z0-9:_-]{1,80}")?value:null;}
    private boolean offerChecked(Request r,Frame f,long now){
        if(!scoped(f))return refuse("wrong_profile");
        if(!f.authenticated())return refuse("await_authentication");
        if(r==null||r.id()==null||r.lease()==null||!r.id().matches("[A-Za-z0-9:_-]{1,80}")
            ||!r.lease().matches("[A-Za-z0-9_-]{1,80}")||!allowed(r.target())
            ||r.view()==null||!Set.of("first_person","third_person_back","third_person_front","drone_follow","drone_overview").contains(r.view()))
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
        request=r;expectedUuid=f.targetUuid();commands=0;phase="ready";reason="accepted";phaseAt=now;
        return true;
    }
    public Action step(Frame f,long now){
        if(request==null)return Action.none();
        // Preserve manual/unknown terminal state even if the old target later disconnects.
        if(Set.of("paused","stopped","unknown").contains(phase))return Action.none();
        if(!scoped(f)||!f.authenticated()){phase="stopped";reason="scope_or_auth_lost";return Action.none();}
        if(!Objects.equals(expectedUuid,f.targetUuid())){phase="stopped";reason="target_identity_lost";return Action.none();}
        if("attached".equals(phase)){
            if(!attached(f)){heldLease=request.lease();phase="paused";reason="manual_or_native_detach";}
            return Action.none();
        }
        if(!pending())return Action.none();
        if(now-phaseAt>8000){phase="unknown";reason="native_attachment_timeout";return Action.none();}
        if(attached(f)){phase="attached";reason="native_camera_confirmed";lastSwitchAt=now;return new Action(null,request.view());}
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
