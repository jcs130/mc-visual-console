import org.mcvisual.director.*;import java.util.*;
public class OrthographicRigCheck {
    static int checks;static void check(boolean ok,String text){checks++;if(!ok)throw new AssertionError(text);}
    static OrthographicRig.Sample sample(long at){return new OrthographicRig.Sample(at,"actor",1,"open",true,1,List.of(new OrthographicRig.Candidate(45,35.264f,1)));}
    static OrthographicRig start(){var r=new OrthographicRig();check(r.begin("request","ortho_isometric","actor",1,1000,null,false,sample(1000)),"scoped visible orthographic request admitted");return r;}
    public static void main(String[]args){
        check(!OrthographicRig.supportsView(null),"idle native policy has no projection view and must still publish diagnostics");
        check(!OrthographicRig.supportsView("unknown")&&OrthographicRig.supportsView("ortho_isometric"),"only explicit projection preset names are supported");
        var r=start();var p=r.advance(1000,sample(1000));check(p.scale()==11,"real orthographic scale uses the configured preset");
        check("transitioning".equals(r.phase()),"acceptance and elapsed time are not a rendered projection");
        r.confirmRendered(new OrthographicRig.Pose(45,55,11),1001);check("transitioning".equals(r.phase()),"wrong actual projection pose cannot complete");
        r.confirmRendered(p,1002);check("holding".equals(r.phase())&&r.renderedAt()==1002,"matching native projection frame confirms holding");
        for(var bad:List.of(new OrthographicRig.Sample(1000,"other",1,"open",true,1,List.of()),new OrthographicRig.Sample(1000,"actor",2,"open",true,1,List.of()),
            new OrthographicRig.Sample(1000,"actor",1,"tunnel",true,1,List.of()),new OrthographicRig.Sample(1000,"actor",1,"layered",true,1,List.of()),
            new OrthographicRig.Sample(1000,"actor",1,"open",false,1,List.of()),sample(-2000),sample(1001))){
            var guard=new OrthographicRig();check(!guard.begin("guard","ortho_isometric","actor",1,1000,null,false,bad),"identity/world/roof/unknown/stale/future contexts refused");}
        var moving=start();moving.advance(1000,sample(1000));moving.confirmRendered(moving.pose(),1001);
        check(moving.advance(1400,sample(1400))!=null,"same scoped moving subject can keep orthographic follow");
        check(moving.advance(1401,new OrthographicRig.Sample(1401,"actor",2,"open",true,1,List.of()))==null,"a new world cannot inherit the old projection");
        check(!moving.begin("request","ortho_isometric","actor",1,1500,null,false,sample(1500)),"blocked request cannot revive with fresh data");
        var smooth=new OrthographicRig();var end=new OrthographicRig.Sample(1000,"actor",1,"open",true,1,List.of(new OrthographicRig.Candidate(-170,35,1)));
        smooth.begin("smooth","ortho_isometric","actor",1,1000,new OrthographicRig.Pose(170,35,11),true,end);smooth.advance(1350,sample(1350));
        check(Math.abs(smooth.pose().yaw()-180)<.1,"yaw crosses the short 20-degree path");smooth.advance(1700,sample(1700));
        check("transitioning".equals(smooth.phase()),"settled clock still waits for the real frame");smooth.confirmRendered(smooth.pose(),1701);check("holding".equals(smooth.phase()),"same-projection easing finishes after native frame");
        var occluded=start();occluded.advance(1000,sample(1000));occluded.confirmRendered(occluded.pose(),1001);
        var alt=List.of(new OrthographicRig.Candidate(-45,55,1));
        occluded.advance(1500,new OrthographicRig.Sample(1500,"actor",1,"open",true,.2,alt));
        check("holding".equals(occluded.phase()),"brief occlusion does not spin the camera");
        occluded.advance(2299,new OrthographicRig.Sample(2299,"actor",1,"open",true,.2,alt));check("holding".equals(occluded.phase()),"occlusion dwell respected");
        occluded.advance(2300,new OrthographicRig.Sample(2300,"actor",1,"open",true,.2,alt));check("transitioning".equals(occluded.phase()),"bounded better azimuth chosen after persistent obstruction");
        occluded.advance(3000,sample(3000));occluded.confirmRendered(occluded.pose(),3001);check("holding".equals(occluded.phase()),"avoidance waits for actual adjusted frame");
        var blocked=start();blocked.advance(1000,sample(1000));blocked.confirmRendered(blocked.pose(),1001);
        blocked.advance(1500,new OrthographicRig.Sample(1500,"actor",1,"open",true,0,List.of()));
        check(blocked.advance(2300,new OrthographicRig.Sample(2300,"actor",1,"open",true,0,List.of()))==null&&"blocked".equals(blocked.phase()),"no clear angle refuses projection rather than hiding the actor");
        var unknown=start();unknown.advance(1000,sample(1000));unknown.confirmRendered(unknown.pose(),1001);
        check(unknown.advance(1500,new OrthographicRig.Sample(1500,"actor",1,"open",true,Double.NaN,List.of()))==null,"unknown ray path is not clear terrain");
        r.stop("cancelled");check(r.advance(1500,sample(1500))==null,"cancelled projection cannot advance");r.confirmRendered(p,1501);check("cancelled".equals(r.phase()),"late frame cannot revive cancellation");
        var roomSample=new OrthographicRig.Sample(1000,"actor",1,"room",true,1,List.of(new OrthographicRig.Candidate(45,55,1)));
        var room=new OrthographicRig();check(room.begin("room","ortho_overview","actor",1,1000,null,false,roomSample),"a verified room is not rejected solely because a roof exists");
        room.advance(1000,roomSample);check(room.pose().scale()==7,"room view frames the current room rather than the whole village");
        room.confirmRendered(room.pose(),1001);check("holding".equals(room.phase()),"room projection still requires native rendered confirmation");
        float near=OrthographicRig.roomClipDepth(.6,1.8,1.62,45,55);check(near>=.8&&near<1.2,"actor-bound near plane retains the body and clips a distant ceiling");
        check(OrthographicRig.roomClipDepth(2,3,2.5,45,55)>near,"larger actors reserve a larger unclipped depth");
        System.out.println(checks+" orthographic-rig checks passed");
    }
}
