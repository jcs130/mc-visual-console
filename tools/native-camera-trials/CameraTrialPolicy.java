package org.mcvisual.camera;

import java.util.*;

/** Bounded, observer-only experiment input. It never issues game commands. */
public final class CameraTrialPolicy {
    public record Request(String id,String lease,String mode,String shot,String targetUuid,
        String observerUuid,String connectionEpoch,long nativeWorldEpoch,String nativeRequestId,
        long issuedAt,long expiresAt,double radius,double height,double azimuthDeg,double orbitDegPerSecond) {}
    public record Scope(String targetUuid,String observerUuid,String connectionEpoch,long nativeWorldEpoch,
        String nativeRequestId,boolean attached,boolean authenticated,boolean spectator,
        boolean screenOpen,boolean firstPerson,boolean nativeDroneActive,long recordedAt) {}
    public record Pose(double x,double y,double z,float yaw,float pitch) {}
    public static String validate(Request r,Scope s,long now){
        if(r==null||s==null)return "missing_request_or_scope";
        if(r.id()==null||!r.id().matches("[A-Za-z0-9_-]{1,80}")||r.lease()==null||!r.lease().matches("[A-Za-z0-9_-]{1,80}"))return "invalid_identifier";
        if(r.mode()==null||r.shot()==null||!Set.of("freecamera","vcam","fpvcraft").contains(r.mode())||!Set.of("tripod","orbit").contains(r.shot()))return "unsupported_mode_or_shot";
        if(r.issuedAt()>now+1000||r.expiresAt()<=now||r.expiresAt()-r.issuedAt()>90_000||r.expiresAt()<=r.issuedAt())return "expired_or_unbounded";
        if(!Double.isFinite(r.radius())||r.radius()<1||r.radius()>10||!Double.isFinite(r.height())||r.height()<0||r.height()>9
            ||!Double.isFinite(r.azimuthDeg())||Math.abs(r.azimuthDeg())>360||!Double.isFinite(r.orbitDegPerSecond())||Math.abs(r.orbitDegPerSecond())>12)return "invalid_pose";
        if(now-s.recordedAt()<0||now-s.recordedAt()>3000)return "stale_native_scope";
        if(!s.attached()||!s.authenticated()||!s.spectator())return "not_authenticated_attached_observer";
        if(s.screenOpen()||!s.firstPerson())return "manual_screen_or_perspective";
        if(s.nativeDroneActive())return "another_camera_owner";
        if(r.targetUuid()==null||r.observerUuid()==null||r.targetUuid().equals(r.observerUuid())
            ||!r.targetUuid().equals(s.targetUuid())||!r.observerUuid().equals(s.observerUuid())
            ||!Objects.equals(r.connectionEpoch(),s.connectionEpoch())||r.nativeWorldEpoch()!=s.nativeWorldEpoch()
            ||!Objects.equals(r.nativeRequestId(),s.nativeRequestId()))return "scope_changed";
        return null;
    }
    public static boolean validSensor(Map<String,?> values){
        for(String key:List.of("yaw","pitch","roll","x","y","z")){
            if(!(values.get(key) instanceof Number n))return false;
            double v=n.doubleValue();double limit=switch(key){case "yaw"->360;case "pitch"->85;case "roll"->10;case "y"->9;default->10;};
            if(!Double.isFinite(v)||Math.abs(v)>limit)return false;
        }
        double x=((Number)values.get("x")).doubleValue(),y=((Number)values.get("y")).doubleValue(),z=((Number)values.get("z")).doubleValue();
        return x*x+y*y+z*z<=196;
    }
    /** Subject-relative composition; the subject is a native, already loaded camera entity. */
    public static Pose pose(Request r,double x,double y,double z,long now){
        double elapsed=Math.max(0,Math.min(90,(now-r.issuedAt())/1000.0));
        double angle=Math.toRadians(r.azimuthDeg()+("orbit".equals(r.shot())?r.orbitDegPerSecond()*elapsed:0));
        double dx=r.radius()*Math.cos(angle),dz=r.radius()*Math.sin(angle);
        return new Pose(x+dx,y+r.height(),z+dz,(float)Math.toDegrees(Math.atan2(dx,-dz)),
            (float)Math.toDegrees(Math.atan2(r.height(),r.radius())));
    }
}
