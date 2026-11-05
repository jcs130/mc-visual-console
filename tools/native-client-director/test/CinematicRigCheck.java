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
        // A future obstacle must reject the move without ejecting an already safe composition.
        var safe=rig("drone_low");var safeStart=next(safe,0);
        safe.begin("blocked-move","drone_orbit_left",1_020_000_000L);
        next(safe,.02);safe.pathResult(false,1_020_000_000L);var safeEnd=next(safe,.03);
        check(Math.abs(safeEnd.y()-safeStart.y())<.001&&Math.abs(safeEnd.x()-safeStart.x())<.001&&Math.abs(safeEnd.z()-safeStart.z())<.001,"future blockage retains exact low-angle start including its negative height");
        check("drone_low".equals(safe.status().get("effectiveView"))&&Boolean.TRUE.equals(safe.status().get("retainingSafeStart")),"rejected arc reports the actual retained view, never successful motion");
        check(!safe.finiteActive()&&safe.path().isEmpty(),"failed preflight cannot run or re-preflight automatically");
        safe.closeFallback();check(Boolean.FALSE.equals(safe.status().get("retainingSafeStart")),"a real current-frame collision still overrides safe-start retention");
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
            var small=rig(dolly);small.next("actor",0,70,0,0,1_000_000_000L,dolly.equals("drone_push_in")?3.2:9.5,3);
            check("insufficient_dolly_range".equals(small.status().get("reason")),"less than one block cannot masquerade as a readable dolly: "+dolly);
            var line=rig("drone_follow");var start=next(line,0);
            line.begin("dolly",dolly,1_020_000_000L,java.util.Map.of("schema",CinematicRig.SCRIPT_PROTOCOL,"durationMs",5000,"speed",1));
            next(line,.02);var points=line.path();
            check(points.size()==65,"dolly sightline is fully checked before moving: "+dolly);
            check(points.stream().allMatch(p->Math.abs(p.pitch()-start.pitch())<.0001),"dolly preserves viewing pitch instead of dipping toward the floor: "+dolly);
            double endRadius=Math.hypot(points.getLast().x(),points.getLast().z());
            check(Math.abs(endRadius-7)>=1,"dolly endpoint changes framing by at least one block: "+dolly);
            line.pathResult(true,1_020_000_000L);for(int i=1;i<=150;i++)next(line,.02+i/30.0);
            check("settling".equals(line.status().get("phase")),"dolly waits for actual endpoint rendering: "+dolly);
            line.confirmRendered();check("completed".equals(line.status().get("phase")),"dolly ends after its real frame: "+dolly);
        }
        var adjustable=new CinematicRig();adjustable.begin("adjust","drone_follow",1_000_000_000L,java.util.Map.of("schema",CinematicRig.SCRIPT_PROTOCOL,"height",1.8,"distance",6.5,"speed",.7));
        var adjusted=next(adjustable,0);check(Math.abs(adjusted.y()-71.8)<.001&&Math.abs(adjusted.z()+6.5)<.001,"explicit height and distance reach real camera geometry");
        adjustable.begin("adjust-again","drone_follow",1_000_000_000L,java.util.Map.of("schema",CinematicRig.SCRIPT_PROTOCOL,"height",3.0,"distance",8.0,"speed",.7));
        var smooth=next(adjustable,.02);check(Math.abs(smooth.y()-adjusted.y())<.03,"new dimensions slew rather than jump on a live rig");
        var custom=new CinematicRig();custom.begin("custom","drone_orbit_right",1_000_000_000L,java.util.Map.of("schema",CinematicRig.SCRIPT_PROTOCOL,"arcDegrees",30,"durationMs",6000,"speed",1));
        next(custom,0);check(custom.path().size()==65,"parameterized whole path remains preflighted");custom.pathResult(true,1_000_000_000L);
        DroneFollow.Pose customEnd=null;for(int i=1;i<=180;i++)customEnd=next(custom,i/30.0);
        check(Math.abs(Math.atan2(customEnd.x(),-customEnd.z())-Math.PI/6)<.001,"30 degree recipe stops at the parameterized endpoint");
        check("settling".equals(custom.status().get("phase")),"parameter duration still requires actual endpoint rendering");custom.confirmRendered();
        check("completed".equals(custom.status().get("phase")),"parameterized endpoint completes only after render");
        for(var invalid:java.util.List.of(java.util.Map.<String,Object>of("schema",CinematicRig.SCRIPT_PROTOCOL,"speed",Double.NaN),java.util.Map.<String,Object>of("schema",CinematicRig.SCRIPT_PROTOCOL,"command","tp"),java.util.Map.<String,Object>of("schema",CinematicRig.SCRIPT_PROTOCOL,"durationMs",4000,"speed",1.5))){
            boolean rejected=false;try{CinematicRig.parameters("drone_orbit_left",invalid);}catch(IllegalArgumentException e){rejected=true;}check(rejected,"invalid or excessive script parameter rejected");}
        custom.reset();boolean noRevival=false;try{next(custom,20);}catch(IllegalStateException e){noRevival=true;}check(noRevival,"parameterized stopped rig cannot revive");
        var cuts=rig("drone_side_right");next(cuts,0);
        check(cuts.preservePosition("drone_side_right"),"same-preset parameter adjustment retains the live rig");
        for(String selected:new String[]{"drone_front","drone_front_left","drone_low","drone_follow","drone_overview"})
            check(!cuts.preservePosition(selected),"different static compositions use a dissolved cut rather than an obstructed interstitial flight: "+selected);
        for(String selected:new String[]{"drone_orbit_left","drone_orbit_right","drone_push_in","drone_pull_out"})
            check(cuts.preservePosition(selected),"finite trajectory starts at the actual rig position: "+selected);
        cuts.closeFallback();check(!cuts.preservePosition("drone_side_right")&&!cuts.preservePosition("drone_orbit_left"),"a fallen-back rig is never silently reused as the requested start");
        cuts.reset();check(!cuts.preservePosition("drone_side_right"),"a stopped rig cannot be kept by a view label");
        // Real client crash: a world replacement reset the recipe while its render-active flag survived.
        // A render caller must decline this frame, leaving vanilla camera setup intact.
        for(String view:new String[]{"drone_front_left","drone_low","drone_orbit_left","drone_push_in","drone_pull_out"}){
            var lifecycle=rig(view);check(lifecycle.renderable(),"explicitly begun recipe may enter the native render hook: "+view);
            next(lifecycle,0);lifecycle.reset();
            for(int frame=0;frame<3;frame++){
                if(lifecycle.renderable())next(lifecycle,1+frame*.05);
                lifecycle.confirmRendered();
            }
            check(!lifecycle.renderable()&&"stopped".equals(lifecycle.status().get("phase")),"world-gap frames neither call stopped next nor revive the recipe: "+view);
            lifecycle.begin("new-world-request","drone_front",3_000_000_000L);
            check(lifecycle.renderable()&&next(lifecycle,2).z()>0,"only a fresh explicit camera request restores a valid recipe: "+view);
        }
        System.out.println(checks+" cinematic-rig checks passed");
    }
}
