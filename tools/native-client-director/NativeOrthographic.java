package org.mcvisual.director;

import java.util.*;import java.lang.reflect.*;import java.nio.file.*;
import com.google.gson.*;import net.fabricmc.loader.api.FabricLoader;import net.minecraft.*;

/** Optional adapter to the original OrthoCamera mod. No second observer, model or control socket. */
public final class NativeOrthographic {
    private final OrthographicRig rig=new OrthographicRig();private Object config;
    private boolean ready,owned,manual;private String problem="disabled";private long sampledAt;private float lastNear=-32;
    private Map<String,Object> original;private OrthographicRig.Pose lastWritten;
    private OrthographicRig.Sample sample;private Map<String,Object> spatial=Map.of();
    public void configure(boolean enabled){
        stop("new_connection");ready=false;config=null;manual=false;problem="disabled";sample=null;sampledAt=0;lastNear=-32;
        if(!enabled)return;
        try{
            boolean nativeBackend=FabricLoader.getInstance().isModLoaded("mcvisual-native-orthographic");
            var mod=FabricLoader.getInstance().getModContainer("orthocamera");
            if(!nativeBackend&&(mod.isEmpty()||!mod.get().getMetadata().getVersion().getFriendlyString().equals("0.1.9+1.21"))){problem="matching_orthocamera_unavailable";return;}
            Path sodium=FabricLoader.getInstance().getConfigDir().resolve("sodium-options.json");
            if(FabricLoader.getInstance().isModLoaded("sodium")&&(!Files.isRegularFile(sodium)
                ||!JsonParser.parseString(Files.readString(sodium)).getAsJsonObject().getAsJsonObject("performance").has("use_block_face_culling")
                ||JsonParser.parseString(Files.readString(sodium)).getAsJsonObject().getAsJsonObject("performance").get("use_block_face_culling").getAsBoolean())){
                problem="sodium_block_face_culling_must_be_disabled";return;}
            config=Class.forName(nativeBackend?"org.mcvisual.neoforge.OrthographicProjection":"com.dimaskama.orthocamera.client.OrthoCamera").getField("CONFIG").get(null);
            for(String name:new String[]{"enabled","fixed","fixed_yaw","fixed_pitch","scale_x","scale_y","min_distance","max_distance"})config.getClass().getField(name);
            ready=true;problem=null;
        }catch(Exception e){ready=false;problem=e.getClass().getSimpleName();}
    }
    private Object get(String name)throws ReflectiveOperationException{return config.getClass().getField(name).get(config);}
    private void set(String name,Object value)throws ReflectiveOperationException{config.getClass().getField(name).set(config,value);}
    private void invoke(String name,Class<?> type,Object value)throws ReflectiveOperationException{config.getClass().getMethod(name,type).invoke(config,value);}
    private boolean enabled(){try{return config!=null&&(boolean)get("enabled");}catch(Exception e){return false;}}
    private OrthographicRig.Pose actual(){try{return new OrthographicRig.Pose((float)get("fixed_yaw"),(float)get("fixed_pitch"),(float)get("scale_y"));}catch(Exception e){return null;}}
    public boolean ready(){return ready;}public boolean active(){return owned&&rig.active();}public boolean manual(){return manual;}
    private boolean unchanged(){try{return enabled()&&(boolean)get("fixed")&&OrthographicRig.matches(actual(),lastWritten)
        &&Math.abs((float)get("scale_x")-lastWritten.scale())<.02&&(float)get("min_distance")==lastNear&&(float)get("max_distance")==96f;}catch(Exception e){return false;}}
    public void stop(String reason){
        if(owned&&unchanged()&&original!=null){try{for(var e:original.entrySet())set(e.getKey(),e.getValue());}catch(Exception e){problem=e.getClass().getSimpleName();}}
        owned=false;lastWritten=null;original=null;rig.stop(reason);
    }
    private void restoreAfterBlock(){
        if(owned&&unchanged()){try{if(original!=null)for(var e:original.entrySet())set(e.getKey(),e.getValue());}catch(Exception e){problem=e.getClass().getSimpleName();}}
        owned=false;lastWritten=null;original=null;
    }
    public boolean begin(String id,String view,class_310 client,long epoch,long now){
        if(!ready){rig.block("orthographic_backend_unavailable");return false;}
        var actor=client.method_1560();if(actor==null){rig.block("orthographic_subject_unavailable");return false;}
        observe(client,actor,epoch,now,true,OrthographicRig.PRESETS.get(view));
        try{
            boolean previous=owned&&enabled();var before=actual();
            if(!rig.begin(id,view,actor.method_5667().toString(),epoch,now,before,previous,sample)){restoreAfterBlock();return false;}
            if(!owned){original=new LinkedHashMap<>();for(String name:new String[]{"enabled","fixed","fixed_yaw","fixed_pitch","scale_x","scale_y","min_distance","max_distance"})original.put(name,get(name));}
            owned=true;manual=false;set("enabled",true);set("min_distance",lastNear);set("max_distance",96f);invoke("setFixed",boolean.class,true);
            write(rig.advance(now,sample));return true;
        }catch(Exception e){rig.block("orthographic_config_error");restoreAfterBlock();problem=e.getClass().getSimpleName();return false;}
    }
    private void write(OrthographicRig.Pose p)throws Exception{if(p==null)return;
        // OrthoCamera's near plane spans the WHOLE frame. It cannot implement local roof fading.
        // Keep the original world depth; blocked rooms must rotate or fall back to perspective.
        lastNear=OrthographicRig.UNCUT_NEAR;
        set("min_distance",lastNear);invoke("setFixedYaw",float.class,p.yaw());invoke("setFixedPitch",float.class,p.pitch());
        invoke("setScaleX",float.class,p.scale());invoke("setScaleY",float.class,p.scale());lastWritten=p;}
    /** False means a verified-owned projection needs a same-subject perspective fallback. */
    public boolean tick(class_310 client,long epoch,long now){
        if(!ready)return true;var actor=client.method_1560();
        if(!owned){if(enabled())manual=true;return true;}
        if(!unchanged()){manual=true;owned=false;original=null;lastWritten=null;rig.stop("manual");return true;}
        if(actor==null||client.field_1687==null){rig.block("orthographic_context_lost");restoreAfterBlock();return false;}
        observe(client,actor,epoch,now,false,OrthographicRig.PRESETS.get(rig.view()));
        try{var pose=rig.advance(now,sample);if(pose==null){restoreAfterBlock();return false;}write(pose);return true;}
        catch(Exception e){rig.block("orthographic_tick_error");restoreAfterBlock();problem=e.getClass().getSimpleName();return false;}
    }
    public void confirmRendered(class_310 client){if(active()&&client.field_1755==null&&enabled())rig.confirmRendered(actual(),System.currentTimeMillis());}
    public void observe(class_310 client,class_1297 actor,long epoch,long now,boolean force,OrthographicRig.Pose preferred){
        if(!ready||actor==null||client.field_1687==null)return;
        if(!force&&now-sampledAt<500&&sample!=null&&Objects.equals(sample.uuid(),actor.method_5667().toString())&&sample.world()==epoch)return;
        sampledAt=now;long start=System.nanoTime();double x=actor.method_23317(),y=actor.method_23318(),z=actor.method_23321();
        float height=actor.method_17682();var world=client.field_1687;boolean known=true;
        double extent=Math.max(20,(preferred==null?16:preferred.scale())*2.1);
        for(double dx:new double[]{-extent,0,extent})for(double dz:new double[]{-extent,0,extent})
            known&=world.method_8393(((int)Math.floor(x+dx))>>4,((int)Math.floor(z+dz))>>4);
        var eye=actor.method_5836(1);double headroom=distance(world,actor,eye,new class_243(x,eye.field_1351+12,z));boolean roof=headroom<11.99;
        double sx=distance(world,actor,eye,new class_243(x+8,eye.field_1351,z))+distance(world,actor,eye,new class_243(x-8,eye.field_1351,z));
        double sz=distance(world,actor,eye,new class_243(x,eye.field_1351,z+8))+distance(world,actor,eye,new class_243(x,eye.field_1351,z-8));
        boolean room=roof&&headroom>=.7&&Math.min(sx,sz)>=1.1;
        String layout=!known?"unknown":room?"room":roof?"tunnel":"open";
        var current=actual();double visible=current==null?Double.NaN:score(world,actor,current.yaw(),current.pitch());
        var candidates=new ArrayList<OrthographicRig.Candidate>();var base=preferred==null?OrthographicRig.PRESETS.get("ortho_isometric"):preferred;
        for(float pitch:base.pitch()>=55?new float[]{base.pitch()}:new float[]{base.pitch(),55})for(float offset:new float[]{0,45,-45,90,-90,180}){
            float yaw=((base.yaw()+offset+180)%360+360)%360-180;double v=known?score(world,actor,yaw,pitch):Double.NaN;
            candidates.add(new OrthographicRig.Candidate(yaw,pitch,v));}
        sample=new OrthographicRig.Sample(now,actor.method_5667().toString(),epoch,layout,known,visible,List.copyOf(candidates));
        var m=new LinkedHashMap<String,Object>();m.put("at",now);m.put("targetUuid",sample.uuid());m.put("nativeWorldEpoch",epoch);m.put("layout",layout);
        boolean supported=known;double foot=actor.method_17681()*.35;
        for(double dx:new double[]{-foot,foot})for(double dz:new double[]{-foot,foot})
            supported&=distance(world,actor,new class_243(x+dx,y+.2,z+dz),new class_243(x+dx,y-1,z+dz))<1.1;
        m.put("known",known);m.put("floorSafe",supported);m.put("headroom",headroom);m.put("spanX",sx);m.put("spanZ",sz);m.put("roomClip",false);m.put("worldCutawaySupported",false);m.put("visibility",Double.isFinite(visible)?visible:null);
        m.put("orthographicVisibility",candidates.stream().mapToDouble(c->c.visibility()).filter(Double::isFinite).max().orElse(-1));
        m.put("probeMicros",(System.nanoTime()-start)/1000);spatial=m;
    }
    private static boolean clear(class_638 world,class_1297 actor,class_243 from,class_243 to){
        return world.method_17742(new class_3959(from,to,class_3959.class_3960.valueOf("VISUAL"),class_3959.class_242.valueOf("NONE"),actor)).method_17783()==class_239.class_240.valueOf("MISS");}
    private static double distance(class_638 world,class_1297 actor,class_243 from,class_243 to){var hit=world.method_17742(new class_3959(from,to,class_3959.class_3960.valueOf("VISUAL"),class_3959.class_242.valueOf("NONE"),actor));return from.method_1022(hit.method_17784());}
    private static double score(class_638 world,class_1297 actor,float yaw,float pitch){
        double x=actor.method_23317(),y=actor.method_23318(),z=actor.method_23321(),height=actor.method_17682(),side=actor.method_17681()*.38;
        double yr=Math.toRadians(yaw),pr=Math.toRadians(pitch),dx=Math.sin(yr)*Math.cos(pr),dy=Math.sin(pr),dz=-Math.cos(yr)*Math.cos(pr);int visible=0;
        for(double[] p:new double[][]{{x,y+height*.9,z},{x,y+height*.55,z},{x,y+.15,z},{x+Math.cos(yr)*side,y+height*.65,z+Math.sin(yr)*side},{x-Math.cos(yr)*side,y+height*.65,z-Math.sin(yr)*side}}){
            double length=32;if(length<.05)continue;
            for(int distance=0;distance<=length;distance+=8)if(!world.method_8393(((int)Math.floor(p[0]+dx*distance))>>4,((int)Math.floor(p[2]+dz*distance))>>4))return Double.NaN;
            if(clear(world,actor,new class_243(p[0]+dx*.05,p[1]+dy*.05,p[2]+dz*.05),new class_243(p[0]+dx*length,p[1]+dy*length,p[2]+dz*length)))visible++;
        }return visible/5.0;
    }
    public Map<String,Object> spatial(){return spatial;}public boolean roomClip(){return false;}public boolean projecting(){return active()&&enabled();}
    public Map<String,Object> status(){var m=new LinkedHashMap<>(rig.status());m.put("ready",ready);m.put("problem",problem);m.put("active",active());
        m.put("projection",enabled()?"orthographic":"perspective");m.put("projectionProfile",active()&&"holding".equals(rig.phase())&&OrthographicRig.matches(actual(),rig.pose())?rig.view():null);
        var actual=actual();if(actual!=null){m.put("actualYaw",actual.yaw());m.put("actualPitch",actual.pitch());m.put("actualScale",actual.scale());try{m.put("actualNear",get("min_distance"));}catch(Exception ignored){}}m.put("roomClip",false);m.put("worldCutawaySupported",false);m.put("occlusionHandling","rotate_or_perspective");return m;}
}
