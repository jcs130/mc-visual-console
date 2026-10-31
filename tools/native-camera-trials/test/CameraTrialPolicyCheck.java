import org.mcvisual.camera.CameraTrialPolicy;
import java.util.*;
public final class CameraTrialPolicyCheck {
    static int checks;
    static void check(boolean ok,String name){checks++;if(!ok)throw new AssertionError(name);}
    static CameraTrialPolicy.Request request(String mode,double radius,long end){return new CameraTrialPolicy.Request("test","lease",mode,"orbit","target","observer","epoch",2,"native",1000,end,radius,3,0,8);}
    static CameraTrialPolicy.Scope scope(String target,long epoch,boolean screen,boolean nativeRig,long time){return new CameraTrialPolicy.Scope(target,"observer","epoch",epoch,"native",true,true,true,screen,true,nativeRig,time);}
    public static void main(String[] args){
        var s=scope("target",2,false,false,1000);
        check(CameraTrialPolicy.validate(request("freecamera",4,6000),s,1000)==null,"valid independent freecamera");
        check(CameraTrialPolicy.validate(request("vcam",4,6000),s,1000)==null,"valid vcam");
        check(CameraTrialPolicy.validate(request("fpvcraft",4,6000),s,1000)==null,"valid fpv");
        check("unsupported_mode_or_shot".equals(CameraTrialPolicy.validate(request("command",4,6000),s,1000)),"no command mode");
        for(double bad:new double[]{Double.NaN,Double.POSITIVE_INFINITY,-1,11})check("invalid_pose".equals(CameraTrialPolicy.validate(request("vcam",bad,6000),s,1000)),"invalid numeric radius");
        check("expired_or_unbounded".equals(CameraTrialPolicy.validate(request("vcam",4,1000),s,1000)),"expiry");
        check("expired_or_unbounded".equals(CameraTrialPolicy.validate(request("vcam",4,100000),s,1000)),"bounded TTL");
        check("scope_changed".equals(CameraTrialPolicy.validate(request("vcam",4,6000),scope("other",2,false,false,1000),1000)),"subject ownership");
        check("scope_changed".equals(CameraTrialPolicy.validate(request("vcam",4,6000),scope("target",3,false,false,1000),1000)),"world epoch");
        check("manual_screen_or_perspective".equals(CameraTrialPolicy.validate(request("vcam",4,6000),scope("target",2,true,false,1000),1000)),"manual screen");
        check("another_camera_owner".equals(CameraTrialPolicy.validate(request("vcam",4,6000),scope("target",2,false,true,1000),1000)),"one camera owner");
        check("stale_native_scope".equals(CameraTrialPolicy.validate(request("vcam",4,6000),scope("target",2,false,false,1000),5001)),"freshness");
        var r=request("freecamera",4,6000);var a=CameraTrialPolicy.pose(r,100,64,200,1000);var b=CameraTrialPolicy.pose(r,100,64,200,2000);
        check(Math.abs(Math.hypot(a.x()-100,a.z()-200)-4)<1e-8,"bounded orbit radius");
        check(a.y()==67&&a.pitch()>0,"look down toward native subject");
        check(Math.hypot(b.x()-a.x(),b.z()-a.z())<1,"orbit velocity bounded");
        var moved=CameraTrialPolicy.pose(r,101,65,201,1000);
        check(Math.abs(moved.x()-a.x()-1)<1e-8&&Math.abs(moved.y()-a.y()-1)<1e-8,"independent target translation");
        Map<String,Object> sensor=new HashMap<>(Map.of("yaw",30,"pitch",20,"roll",2,"x",-2,"y",1,"z",3));
        check(CameraTrialPolicy.validSensor(sensor),"bounded sensor accepted");
        sensor.put("yaw","NaN");check(!CameraTrialPolicy.validSensor(sensor),"string NaN is not a numeric sensor");
        sensor.put("yaw",Double.NaN);check(!CameraTrialPolicy.validSensor(sensor),"numeric NaN rejected");
        sensor.put("yaw",Double.POSITIVE_INFINITY);check(!CameraTrialPolicy.validSensor(sensor),"infinite rotation rejected");
        sensor.put("yaw",30);sensor.put("roll",20);check(!CameraTrialPolicy.validSensor(sensor),"bounded roll");
        sensor.put("roll",0);sensor.remove("z");check(!CameraTrialPolicy.validSensor(sensor),"complete sensor required");
        System.out.println(checks+" camera trial policy checks passed");
    }
}
