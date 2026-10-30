import org.mcvisual.director.DroneFollow;
public class DroneFollowCheck {
    static int checks;
    static void check(boolean value,String label){checks++;if(!value)throw new AssertionError(label);}
    static DroneFollow.Pose travel(int fps){var d=new DroneFollow();DroneFollow.Pose p=null;
        for(int i=0;i<=fps*2;i++)p=d.next("actual-target",i*3.0/fps,70,0,0,1_000_000_000L+i*1_000_000_000L/fps,7,3);
        return p;}
    public static void main(String[] args){
        var d=new DroneFollow();var a=d.next("a",0,70,0,0,1_000_000_000L,7,3);
        check(a.snapped()&&Math.abs(a.z()+7)<0.001,"first sample anchors on actual target");
        var b=d.next("a",0,70,0,170,1_033_333_333L,7,3);
        check(Math.abs(a.x()-b.x())<0.001&&Math.abs(a.z()-b.z())<0.001,"standing head turns do not spin rig");
        var teleported=d.next("a",200,80,200,90,1_066_666_666L,7,3);
        check(teleported.snapped()&&teleported.x()>190,"teleport snaps; no flight through intervening world");
        check(d.next("b",1,71,1,0,1_100_000_000L,7,3).snapped(),"new native UUID resets interpolation");
        var p30=travel(30);var p120=travel(120);
        check(Math.hypot(p30.x()-p120.x(),p30.z()-p120.z())<0.25,"movement smoothing is independent of frame rate");
        check(p30.pitch()>0&&p30.pitch()<60,"camera looks down toward target");
        check(Float.isFinite(p30.yaw())&&Double.isFinite(p30.x()),"finite camera pose");
        boolean rejected=false;try{d.next("x",Double.NaN,0,0,0,2_000_000_000L,7,3);}catch(IllegalArgumentException e){rejected=true;}
        check(rejected,"invalid observation does not invent position");
        rejected=false;try{d.next("x",0,0,0,0,2_000_000_000L,100,3);}catch(IllegalArgumentException e){rejected=true;}
        check(rejected,"explicit short boom bound");d.reset();
        check(d.next("b",1,71,1,0,3_000_000_000L,7,3).snapped(),"manual reset cannot reuse stale camera state");
        System.out.println(checks+" drone-follow checks passed");
    }
}
