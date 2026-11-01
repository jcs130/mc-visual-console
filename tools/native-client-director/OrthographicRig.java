package org.mcvisual.director;

import java.util.*;

/** Pure, bounded orthographic composition. A rendered native frame is a separate acknowledgement. */
public final class OrthographicRig {
    public record Pose(float yaw,float pitch,float scale) {}
    public record Candidate(float yaw,float pitch,double visibility) {}
    public record Sample(long at,String uuid,long world,String layout,boolean known,double visibility,List<Candidate> candidates) {}
    public static final Map<String,Pose> PRESETS=Map.of(
        "ortho_isometric",new Pose(45,35.264f,11),"ortho_overview",new Pose(45,55,16),
        "ortho_close",new Pose(45,30,7),"ortho_top",new Pose(0,80,12));
    private String id,view,uuid,phase="stopped",reason="disabled";
    private long world,start,duration,obstructedAt=-1,lastAvoidAt=Long.MIN_VALUE/2,renderedAt;
    private Pose from,to,pose;private boolean active;private double progress;
    private static float angle(float a){return ((a+180)%360+360)%360-180;}
    public static boolean supportsView(String view){return view!=null&&PRESETS.containsKey(view);}
    public static boolean matches(Pose a,Pose b){return a!=null&&b!=null&&Math.abs(angle(a.yaw-b.yaw))<.08&&Math.abs(a.pitch-b.pitch)<.08&&Math.abs(a.scale-b.scale)<.02;}
    public static boolean suitable(Sample s,String uuid,long world,long now){return s!=null&&Objects.equals(uuid,s.uuid)&&world==s.world
        &&s.known&&("open".equals(s.layout)||"room".equals(s.layout))&&s.at<=now&&now-s.at<=2000;}
    /** Clip behind the native actor bounds, with a margin for visible hair/clothing. */
    public static float roomClipDepth(double width,double height,double eyeHeight,float yaw,float pitch){
        double yr=Math.toRadians(yaw),pr=Math.toRadians(pitch),vertical=Math.sin(pr);
        double nearest=width*.5*Math.cos(pr)*(Math.abs(Math.sin(yr))+Math.abs(Math.cos(yr)))
            +Math.max(-eyeHeight*vertical,(height-eyeHeight)*vertical);
        return (float)Math.max(.8,nearest+.4);
    }
    private Candidate best(Sample s,Pose preferred){
        return s.candidates.stream().filter(c->Double.isFinite(c.visibility)&&c.visibility>=.8)
            .min(Comparator.comparingDouble(c->Math.abs(angle(c.yaw-preferred.yaw))*.01+Math.abs(c.pitch-preferred.pitch)*.01-c.visibility)).orElse(null);
    }
    public boolean begin(String id,String view,String uuid,long world,long now,Pose current,boolean alreadyOrtho,Sample sample){
        if(!supportsView(view)||id==null||uuid==null)throw new IllegalArgumentException("unknown_orthographic_request");
        if(Objects.equals(this.id,id)&&Set.of("blocked","cancelled","stopped","paused").contains(phase))return false;
        this.id=id;this.view=view;this.uuid=uuid;this.world=world;renderedAt=0;obstructedAt=-1;progress=0;
        if(!suitable(sample,uuid,world,now)){block("orthographic_scene_unsuitable");return false;}
        Pose preset=PRESETS.get(view);Candidate candidate=best(sample,preset);
        if(candidate==null){block("orthographic_subject_occluded");return false;}
        to=new Pose(candidate.yaw,candidate.pitch,"room".equals(sample.layout)?Math.min(7,preset.scale):preset.scale);from=alreadyOrtho&&current!=null?current:to;pose=from;
        start=now;duration=alreadyOrtho?700:0;active=true;phase="transitioning";reason="awaiting_projection_frame";return true;
    }
    public Pose advance(long now,Sample sample){
        if(!active)return null;
        if(now<start||!suitable(sample,uuid,world,now)){block("orthographic_context_lost");return null;}
        if("holding".equals(phase)){
            float sceneScale="room".equals(sample.layout)?Math.min(7,PRESETS.get(view).scale):PRESETS.get(view).scale;
            if(Math.abs(to.scale-sceneScale)>.02){from=pose;to=new Pose(to.yaw,to.pitch,sceneScale);start=now;duration=700;phase="transitioning";reason="scene_scale_changed";renderedAt=0;}
            if(!Double.isFinite(sample.visibility)){block("orthographic_visibility_unknown");return null;}
            if(sample.visibility<.8){
                if(obstructedAt<0)obstructedAt=now;
                if(now-obstructedAt>=800){
                    Candidate candidate=best(sample,PRESETS.get(view));
                    if(candidate==null){block("orthographic_subject_occluded");return null;}
                    if(now-lastAvoidAt>=2500&&candidate.visibility>=sample.visibility+.39){
                        from=pose;to=new Pose(candidate.yaw,candidate.pitch,to.scale);start=now;duration=700;progress=0;
                        phase="transitioning";reason="bounded_occlusion_avoidance";lastAvoidAt=now;renderedAt=0;obstructedAt=-1;
                    }
                }
            }else obstructedAt=-1;
        }
        progress=duration==0?1:Math.max(0,Math.min(1,(now-start)/(double)duration));double a=progress*progress*(3-2*progress);
        pose=new Pose(from.yaw+angle(to.yaw-from.yaw)*(float)a,from.pitch+(to.pitch-from.pitch)*(float)a,from.scale+(to.scale-from.scale)*(float)a);
        return pose;
    }
    public void confirmRendered(Pose actual,long now){if(active&&progress>=1&&matches(actual,to)){phase="holding";reason="orthographic_frame_rendered";renderedAt=now;}}
    public void block(String why){active=false;phase="blocked";reason=why;renderedAt=0;}
    public void stop(String why){active=false;phase=why.equals("cancelled")?"cancelled":why.equals("manual")?"paused":"stopped";reason=why;renderedAt=0;}
    public boolean active(){return active;}public String phase(){return phase;}public Pose pose(){return pose;}public long renderedAt(){return renderedAt;}
    public String view(){return view;}public String id(){return id;}
    public Map<String,Object> status(){var m=new LinkedHashMap<String,Object>();m.put("requestId",id);m.put("view",view);m.put("phase",phase);m.put("reason",reason);
        m.put("active",active);m.put("progress",progress);m.put("renderedAt",renderedAt);m.put("targetUuid",uuid);m.put("nativeWorldEpoch",world);
        if(pose!=null){m.put("yaw",pose.yaw);m.put("pitch",pose.pitch);m.put("scale",pose.scale);}return m;}
}
