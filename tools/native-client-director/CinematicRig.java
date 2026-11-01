package org.mcvisual.director;

import java.util.*;

/** Bounded native camera recipes. No entity movement, game commands, network or model inference. */
public final class CinematicRig {
    public static final Set<String> VIEWS=Set.of("drone_follow","drone_overview","drone_eye","drone_front",
        "drone_front_left","drone_front_right","drone_side_left","drone_side_right","drone_low",
        "drone_orbit_left","drone_orbit_right","drone_push_in","drone_pull_out");
    private final DroneFollow tracking=new DroneFollow();
    private String id,view="drone_follow",identity,phase="stopped",reason="stopped";
    private long previous,start;
    private double bearing,radius=7,elevation=3,anchorX,anchorY,anchorZ,startBearing,startRadius,startElevation;
    private boolean initialized,checkedPath,startPending,fallback,settled;
    private double progress;
    private DroneFollow.Pose lastPose;
    private static double angle(double value){return ((value+180)%360+360)%360-180;}
    private static double ease(double t){return t*t*t*(10+t*(-15+6*t));}
    public static boolean finiteShot(String view){return view!=null&&(view.startsWith("drone_orbit_")||view.equals("drone_push_in")||view.equals("drone_pull_out"));}
    public void begin(String requestId,String selected,long now){
        if(requestId==null||!VIEWS.contains(selected))throw new IllegalArgumentException("Unknown native camera recipe");
        if(Objects.equals(id,requestId)&&finiteShot(selected)&&Set.of("blocked","cancelled","stopped","completed").contains(phase)){
            view=selected;fallback=true;phase="blocked";reason="previous_finite_shot_not_replayed";return;
        }
        id=requestId;view=selected;phase=finiteShot(view)?"preflight":"running";reason="awaiting_native_frame";
        previous=now;start=now;progress=0;checkedPath=false;startPending=true;fallback=false;
        // A recipe changes the same rig. Never reset its position merely because the host chose another view.
        if(initialized)startBearing=bearing;
    }
    public void reset(){tracking.reset();identity=null;initialized=false;previous=0;phase="stopped";reason="stopped";lastPose=null;fallback=false;}
    public void closeFallback(){fallback=true;if(finiteShot(view))abort("close_view_fallback");}
    public void suspend(){abort("native_screen_opened");fallback=true;tracking.reset();initialized=false;}
    public void abort(String why){if(finiteShot(view)&&!Set.of("completed","blocked","cancelled","stopped").contains(phase)){phase="blocked";reason=why;}}
    public boolean needsPath(){return "preflight".equals(phase)&&initialized&&!checkedPath;}
    public boolean finiteActive(){return finiteShot(view)&&!fallback&&Set.of("preflight","running","settling").contains(phase);}
    public void pathResult(boolean clear,long now){
        if(!needsPath())return;checkedPath=true;start=now;phase=clear?"running":"blocked";reason=clear?"native_path_verified":"native_path_blocked";
    }
    public List<DroneFollow.Pose> path(){
        if(!needsPath())return List.of();
        List<DroneFollow.Pose> poses=new ArrayList<>();
        for(int i=0;i<=64;i++)poses.add(finitePose(i/64.0));
        return poses;
    }
    private DroneFollow.Pose pose(double x,double y,double z,double b,double r,double h,boolean snapped){
        double rad=Math.toRadians(b),cx=x+Math.sin(rad)*r,cy=y+h,cz=z-Math.cos(rad)*r;
        return new DroneFollow.Pose(cx,cy,cz,(float)Math.toDegrees(Math.atan2(-(x-cx),z-cz)),
            (float)-Math.toDegrees(Math.atan2(y-cy,Math.hypot(x-cx,z-cz))),snapped);
    }
    private DroneFollow.Pose finitePose(double t){
        double a=ease(t),b=startBearing,r=startRadius,h=startElevation;
        if(view.startsWith("drone_orbit_"))b+=view.endsWith("left")?-60*a:60*a;
        else if(view.equals("drone_push_in"))r=startRadius+(Math.max(2.5,startRadius*.55)-startRadius)*a;
        else if(view.equals("drone_pull_out"))r=startRadius+(Math.min(10,startRadius+3)-startRadius)*a;
        return pose(anchorX,anchorY,anchorZ,b,r,h,false);
    }
    public DroneFollow.Pose next(String uuid,double x,double y,double z,float bodyYaw,long now,double configuredDistance,double configuredHeight){
        if("stopped".equals(phase))throw new IllegalStateException("Native camera recipe is stopped");
        if(!VIEWS.contains(view))throw new IllegalStateException("Recipe not configured");
        boolean changed=identity!=null&&!Objects.equals(identity,uuid);
        var rear=tracking.next(uuid,x,y,z,bodyYaw,now,configuredDistance,configuredHeight);
        if(changed||initialized&&rear.snapped()){
            abort(changed?"subject_changed":"subject_teleported_or_frame_gap");initialized=false;
        }
        double dt=previous==0?0:Math.max(0,Math.min(.1,(now-previous)/1_000_000_000.0));previous=now;identity=uuid;
        double base=tracking.headingDegrees(),offset=0,desiredRadius=configuredDistance,desiredHeight=configuredHeight;
        String effective=fallback?"drone_eye":view;
        switch(effective){
            case "drone_overview"->{desiredRadius=3.5;desiredHeight=9;}
            case "drone_eye"->{desiredRadius=4.8;desiredHeight=.2;}
            case "drone_front"->{offset=180;desiredRadius=4.8;desiredHeight=.3;}
            case "drone_front_left"->{offset=-145;desiredRadius=5;desiredHeight=.45;}
            case "drone_front_right"->{offset=145;desiredRadius=5;desiredHeight=.45;}
            case "drone_side_left"->{offset=-90;desiredRadius=5;desiredHeight=.4;}
            case "drone_side_right"->{offset=90;desiredRadius=5;desiredHeight=.4;}
            case "drone_low"->{offset=160;desiredRadius=5;desiredHeight=-.65;}
            default->{}
        }
        if(!initialized){initialized=true;bearing=base+offset;radius=desiredRadius;elevation=desiredHeight;
            anchorX=x;anchorY=y;anchorZ=z;startBearing=bearing;}
        if(startPending){startPending=false;anchorX=x;anchorY=y;anchorZ=z;startBearing=bearing;startRadius=radius;startElevation=elevation;}
        if(!fallback&&finiteShot(view)&&(view.equals("drone_push_in")&&startRadius<2.8||view.equals("drone_pull_out")&&startRadius>9.8)){
            abort("insufficient_dolly_range");fallback=true;
        }
        if(finiteShot(view)&&!fallback){
            if(Math.sqrt((x-anchorX)*(x-anchorX)+(y-anchorY)*(y-anchorY)+(z-anchorZ)*(z-anchorZ))>.75)abort("subject_left_verified_arc");
            if(Set.of("blocked","cancelled").contains(phase))return lastPose=pose(x,y,z,bearing,Math.max(3,radius),Math.max(.2,elevation),false);
            if("running".equals(phase)||"settling".equals(phase)||"completed".equals(phase)){
                progress=Math.max(progress,Math.min(1,(now-start)/8_000_000_000.0));
                if(progress>=1&&!"completed".equals(phase))phase="settling";
            }
            var point=finitePose(progress);double dx=point.x()-x,dz=point.z()-z;
            bearing=Math.toDegrees(Math.atan2(dx,-dz));radius=Math.hypot(dx,dz);elevation=point.y()-y;
            // Keep the verified world path, while looking at the current actual eye rather than a stale anchor.
            lastPose=new DroneFollow.Pose(point.x(),point.y(),point.z(),(float)Math.toDegrees(Math.atan2(dx,-dz)),
                (float)Math.toDegrees(Math.atan2(point.y()-y,Math.hypot(dx,dz))),point.snapped());
            return lastPose;
        }
        double change=angle(base+offset-bearing),alpha=1-Math.exp(-dt/.35);
        bearing+=Math.max(-45*dt,Math.min(45*dt,change*alpha));
        radius+=(desiredRadius-radius)*alpha;elevation+=(desiredHeight-elevation)*alpha;
        settled=Math.abs(angle(base+offset-bearing))<1&&Math.abs(desiredRadius-radius)<.05&&Math.abs(desiredHeight-elevation)<.05;
        if(!finiteShot(view))reason="native_tracking";
        return lastPose=pose(x,y,z,bearing,radius,elevation,rear.snapped());
    }
    public void confirmRendered(){
        if("settling".equals(phase)){phase="completed";reason="finite_endpoint_rendered";}
        else if(!finiteShot(view)&&"running".equals(phase)&&settled){phase="holding";reason="native_tracking_rendered";}
    }
    public Map<String,Object> status(){
        Map<String,Object> s=new LinkedHashMap<>();s.put("requestId",id);s.put("view",view);s.put("phase",phase);s.put("reason",reason);s.put("progress",progress);
        s.put("durationMs",finiteShot(view)?8000:null);s.put("arcDegrees",view.startsWith("drone_orbit_")?60:null);
        s.put("effectiveView",fallback?"drone_eye":view);s.put("fallback",fallback);return s;
    }
}
