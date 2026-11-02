package org.mcvisual.director;
import java.util.*;

/** Read-only frame admission. No renderer, file, network, controller or actor mutation. */
public final class CapturePolicy {
    public record Request(String id,String server,String observerUuid,String connectionEpoch,long nativeWorldEpoch,
        String targetUuid,String cameraRequestId,long issuedAt,long expiresAt,int maxWidth,int maxHeight,String stage) {
        public Request(String id,String server,String observerUuid,String connectionEpoch,long nativeWorldEpoch,String targetUuid,String cameraRequestId,long issuedAt,long expiresAt,int maxWidth,int maxHeight){this(id,server,observerUuid,connectionEpoch,nativeWorldEpoch,targetUuid,cameraRequestId,issuedAt,expiresAt,maxWidth,maxHeight,null);}
        public boolean composited(){return "composited".equals(stage);}
    }
    public record Scope(String server,String observerUuid,String connectionEpoch,long nativeWorldEpoch,String targetUuid,
        String cameraUuid,String cameraRequestId,boolean authenticated,boolean attached,boolean spectator,boolean screenOpen,boolean transitionActive) {}
    public static String refusal(Request r,Scope s,long now){
        if(r==null||r.id==null||!r.id.matches("[A-Za-z0-9_-]{1,80}")||r.issuedAt<0||r.issuedAt>now+1000||r.expiresAt<=now
            ||r.expiresAt<=r.issuedAt||r.expiresAt-r.issuedAt>5000)return "invalid_or_expired_capture";
        if(r.maxWidth<64||r.maxWidth>512||r.maxHeight<64||r.maxHeight>512)return "capture_size_invalid";
        if(r.stage!=null&&!Set.of("world","composited").contains(r.stage))return "capture_stage_invalid";
        if(s==null||!s.authenticated||!s.attached||!s.spectator)return "capture_body_unavailable";
        if(s.screenOpen&&!r.composited()||s.transitionActive)return "capture_program_not_clear";
        if(r.server==null||r.observerUuid==null||r.connectionEpoch==null||r.targetUuid==null||r.cameraRequestId==null
            ||!Objects.equals(r.server,s.server)||!Objects.equals(r.observerUuid,s.observerUuid)
            ||!Objects.equals(r.connectionEpoch,s.connectionEpoch)||r.nativeWorldEpoch!=s.nativeWorldEpoch
            ||!Objects.equals(r.targetUuid,s.targetUuid)||!Objects.equals(r.targetUuid,s.cameraUuid)
            ||!Objects.equals(r.cameraRequestId,s.cameraRequestId)||Objects.equals(s.observerUuid,s.cameraUuid))return "capture_scope_changed";
        return null;
    }
    public static int[] fit(int width,int height,int maxWidth,int maxHeight){
        if(width<1||height<1||maxWidth<1||maxHeight<1||maxWidth>512||maxHeight>512)throw new IllegalArgumentException("capture_size_invalid");
        double scale=Math.min(1,Math.min(maxWidth/(double)width,maxHeight/(double)height));
        return new int[]{Math.max(1,(int)Math.floor(width*scale)),Math.max(1,(int)Math.floor(height*scale))};
    }
}
