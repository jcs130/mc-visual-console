import org.mcvisual.director.*;
public class CinematicRigCheck {
    static int checks;
    static void check(boolean ok,String text){checks++;if(!ok)throw new AssertionError(text);}
    static CinematicRig rig(String view){var r=new CinematicRig();r.begin("request",view,1_000_000_000L);return r;}
    static DroneFollow.Pose next(CinematicRig r,double seconds){return r.next("actor",0,70,0,0,1_000_000_000L+(long)(seconds*1e9),7,3);}
    public static void main(String[] args){
        var front=next(rig("drone_front"),0);check(front.z()>4,"front lead is physically in front of a +Z facing actor");
        check(Math.abs(Math.abs(front.yaw())-180)<.1,"front camera looks backwards toward the actor");
        var side=next(rig("drone_side_left"),0);check(side.x()<-4&&Math.abs(side.z())<.01,"left side camera is distinct from front and rear");
        check(next(rig("drone_low"),0).pitch()<0,"low-angle shot really looks up");
        var r=rig("drone_orbit_right");var first=next(r,0);check(r.needsPath()&&r.path().size()==65,"whole arc must be preflighted");
        next(r,.5);check(((Number)r.status().get("progress")).doubleValue()==0,"clock cannot start a movie before path validation");
        r.pathResult(true,1_500_000_000L);
        DroneFollow.Pose last=first;
        for(int i=1;i<=240;i++)last=next(r,.5+i/30.0);
        check("settling".equals(r.status().get("phase")),"elapsed duration is not rendered completion");
        r.confirmRendered();check("completed".equals(r.status().get("phase")),"actual post-world frame completes endpoint");
        check(Math.abs(Math.hypot(first.x(),first.z())-Math.hypot(last.x(),last.z()))<.001,"orbit retains radius");
        check(Math.abs(Math.atan2(last.x(),-last.z())-Math.PI/3)<.001,"orbit ends after 60 degrees rather than looping");
        var endpoint=last;next(r,8.6);next(r,8.7);check(Math.abs(next(r,8.8).x()-endpoint.x())<.001,"completed finite shot holds endpoint");
        r.begin("request","drone_orbit_right",9_800_000_000L);check("blocked".equals(r.status().get("phase")),"completed request cannot silently replay");
        r.begin("next-arc","drone_orbit_left",9_800_000_000L);var continuation=next(r,8.83);
        check(Math.hypot(continuation.x()-endpoint.x(),continuation.z()-endpoint.z())<.001,"next arc begins at rendered endpoint rather than jumping to previous start");
        r.pathResult(false,9_800_000_000L);
        var blocked=rig("drone_orbit_left");next(blocked,0);blocked.pathResult(false,1_000_000_000L);next(blocked,.1);
        check("blocked".equals(blocked.status().get("phase")),"unknown or obstructed path never runs");
        var moving=rig("drone_orbit_right");next(moving,0);moving.pathResult(true,1_000_000_000L);
        moving.next("actor",1,70,0,0,1_100_000_000L,7,3);check("blocked".equals(moving.status().get("phase")),"moving outside the verified anchor cancels arc");
        var handover=rig("drone_follow");next(handover,0);handover.begin("front-request","drone_front",1_000_000_000L);
        var a=next(handover,.02);check(a.z()<0,"same-person front change starts from existing rear rig");
        for(int i=1;i<=200;i++)a=next(handover,.02+i/30.0);check(a.z()>4,"front transition reaches the actual front side");
        handover.closeFallback();for(int i=1;i<=150;i++)a=next(handover,7+i/30.0);
        check(a.z()<0&&"drone_eye".equals(handover.status().get("effectiveView")),"close-space fallback recovers to stable rear rather than replaying front arc");
        var close=new CloseView();close.begin();check(!close.update(0,1,true),"brief tight camera does not cut immediately");
        check(!close.update(349,1,true)&&close.update(350,1,true),"persistent close camera enters first person");
        check(close.update(500,3,true)&&close.update(2500,3,true),"clear space does not defeat minimum first-person dwell");
        check(!close.update(3350,3,true)&&close.recovery(3350)==0,"recovery starts at the eyes");
        check(close.recovery(4050)==1,"recovery reaches full boom smoothly in 700ms");
        close.stop();check(!close.update(5000,.1,false),"stopped close policy cannot revive");
        close.begin();check(close.update(6000,8,false),"unknown terrain cannot admit an external camera");
        close.begin();check(close.update(7000,.2,true),"dangerously close native boom falls back immediately");
        handover.reset();boolean stopped=false;try{next(handover,20);}catch(IllegalStateException e){stopped=true;}check(stopped,"reset rig cannot render again without an explicit begin");
        for(String dolly:new String[]{"drone_push_in","drone_pull_out"}){
            var invalid=rig(dolly);invalid.next("actor",0,70,0,0,1_000_000_000L,dolly.equals("drone_push_in")?2:10,3);
            check("blocked".equals(invalid.status().get("phase")),"degenerate dolly cannot report an opposite or motionless movement: "+dolly);
        }
        System.out.println(checks+" cinematic-rig checks passed");
    }
}
