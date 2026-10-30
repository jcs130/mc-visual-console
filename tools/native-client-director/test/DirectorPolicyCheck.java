import org.mcvisual.director.DirectorPolicy;
import java.util.*;
public class DirectorPolicyCheck {
    static int checks;
    static void check(boolean value,String label){checks++;if(!value)throw new AssertionError(label);}
    static DirectorPolicy policy(){return new DirectorPolicy(new DirectorPolicy.Config(true,"fixture:1","observer",Set.of("Alice","Bob"),10_000));}
    static DirectorPolicy.Frame f(boolean auth,boolean spectator,boolean near,String camera){
        return new DirectorPolicy.Frame("fixture:1","observer",auth,spectator,"uuid-a",near,camera,"observer");}
    static DirectorPolicy.Request r(String id,String target,String view,long t){
        return new DirectorPolicy.Request(id,"lease-one",target,view,t,t+5000);}
    public static void main(String[] args){
        var p=policy();long t=100_000;
        var drone=policy();check(drone.offer(r("drone","Alice","drone_follow",t),f(true,true,true,"uuid-a"),t),"explicit drone request admitted");
        check("drone_follow".equals(drone.step(f(true,true,true,"uuid-a"),t).view()),"drone requires native UUID attachment");
        var overview=policy();check(overview.offer(r("overview","Alice","drone_overview",t),f(true,true,true,"uuid-a"),t),"explicit overhead view admitted");
        check(DirectorPolicy.authReceipt(false,"§a[MC_AUTH_SUCCESS] native"),"native authentication receipt");
        check(!DirectorPolicy.authReceipt(true,"[MC_AUTH_UNAVAILABLE] wait"),"unavailable invalidates authentication");
        check(!DirectorPolicy.authReceipt(true,"[MC_AUTH_LOGIN] required"),"login challenge invalidates authentication");
        check(!DirectorPolicy.authReceipt(false,"[Alice] [MC_AUTH_SUCCESS] fake"),"quoted player text is not authentication");
        check(!p.offer(r("auth","Alice","first_person",t),f(false,true,true,null),t),"authentication is required");
        check(!p.offer(r("injection","Alice;op Bob","first_person",t),f(true,true,true,null),t),"no command injection");
        check(!p.offer(r("foreign","Eve","first_person",t),f(true,true,true,null),t),"explicit target allowlist");
        check(!p.offer(r("self","observer","first_person",t),f(true,true,true,null),t),"no observer self target");
        check(!p.offer(r("view","Alice","run-command",t),f(true,true,true,null),t),"no arbitrary view/action");
        check(!p.offer(r("null-view","Alice",null,t),f(true,true,true,null),t),"missing view is rejected");
        check(!p.offer(r("expired","Alice","first_person",t),f(true,true,true,null),t+6000),"expiry is checked");
        check(!p.offer(r("future","Alice","first_person",t+2000),f(true,true,true,null),t),"future request refused");
        check(!p.offer(r("profile","Alice","first_person",t),new DirectorPolicy.Frame("other:1","observer",true,true,"uuid-a",true,null,"observer"),t),"server scope");
        check(!p.offer(r("identity","Alice","first_person",t),new DirectorPolicy.Frame("fixture:1","other",true,true,"uuid-a",true,null,"observer"),t),"observer scope");
        check(!p.offer(r("offline","Alice","first_person",t),new DirectorPolicy.Frame("fixture:1","observer",true,true,null,false,null,"observer"),t),"offline identity refused");
        check(p.offer(r("one","Alice","third_person_back",t),f(true,false,false,"observer"),t),"valid camera request admitted");
        check("minecraft:gamemode spectator".equals(p.step(f(true,false,false,"observer"),t).command()),"only own spectator mode");
        check(p.step(f(true,false,false,"observer"),t+100).command()==null,"mode command not replayed");
        check(!p.offer(r("two","Bob","first_person",t),f(true,true,false,"observer"),t+100),"pending request cannot be replaced");
        check("minecraft:tp @s Alice".equals(p.step(f(true,true,false,"observer"),t+200).command()),"teleport only observer");
        check(p.step(f(true,true,false,"observer"),t+300).command()==null,"teleport not replayed");
        check("minecraft:spectate Alice".equals(p.step(f(true,true,true,"observer"),t+400).command()),"native follow request");
        check(p.step(f(true,true,true,"observer"),t+500).view()==null,"accepted is not attachment");
        check("third_person_back".equals(p.step(f(true,true,true,"uuid-a"),t+600).view()),"actual UUID attachment confirms view");
        check("attached".equals(p.phase())&&p.commands()==3,"bounded command chain");
        check(!p.offer(r("one","Alice","first_person",t),f(true,true,true,"uuid-a"),t+700),"dedupe");
        check(!p.offer(r("fast","Bob","first_person",t),f(true,true,true,"uuid-a"),t+800),"switch cooldown");
        check(p.step(f(true,true,true,"observer"),t+900).command()==null&&"paused".equals(p.phase()),"native detach pauses");
        check(!p.offer(r("steal","Alice","first_person",t),f(true,true,true,"observer"),t+1000),"same lease cannot steal camera back");
        var next=new DirectorPolicy.Request("renew","lease-two","Alice","first_person",t+1100,t+6100);
        check(p.offer(next,f(true,true,true,"observer"),t+1100),"explicit new lease can resume");
        check("minecraft:spectate Alice".equals(p.step(f(true,true,true,"observer"),t+1200).command()),"resume uses native command");
        check(p.step(f(true,true,true,"observer"),t+9300).command()==null&&"unknown".equals(p.phase()),"timeout remains unknown");
        var lost=policy();check(lost.offer(r("lost","Alice","first_person",t),f(true,true,false,null),t),"loss fixture admitted");
        check(lost.step(f(false,true,false,null),t+100).command()==null,"auth loss sends nothing");
        check("stopped".equals(lost.phase()),"auth loss stops pending");
        var changed=policy();check(changed.offer(r("changed","Alice","first_person",t),f(true,true,false,null),t),"identity fixture");
        check(changed.step(new DirectorPolicy.Frame("fixture:1","observer",true,true,"new-uuid",false,null,"observer"),t+100).command()==null,"changed UUID not followed");
        check("target_identity_lost".equals(changed.reason()),"identity loss stays explicit");
        var disabled=new DirectorPolicy(new DirectorPolicy.Config(false,"fixture:1","observer",Set.of("Alice"),10_000));
        check(!disabled.offer(r("disabled","Alice","first_person",t),f(true,true,true,null),t),"disabled default has no effects");
        var switching=policy();
        check(switching.offer(r("same-world","Alice","first_person",t),f(true,true,false,"previous-player"),t),"same-world remote switch admitted");
        check("minecraft:spectate".equals(switching.step(f(true,true,false,"previous-player"),t).command()),"detach old camera before moving observer");
        check(switching.step(f(true,true,false,"previous-player"),t+100).command()==null,"sent detach is not confirmation and is not replayed");
        check("minecraft:tp @s Alice".equals(switching.step(f(true,true,false,"observer"),t+200).command()),"native self camera confirms safe teleport stage");
        check(switching.step(f(true,true,false,"observer"),t+300).command()==null,"teleport waits for actual target tracking");
        check("minecraft:spectate Alice".equals(switching.step(f(true,true,true,"observer"),t+400).command()),"tracked new target may attach");
        check("first_person".equals(switching.step(f(true,true,true,"uuid-a"),t+500).view()),"new camera UUID confirms completed switch");
        check(switching.commands()==3,"remote switch sends detach teleport attach only");
        var detachTimeout=policy();detachTimeout.offer(r("timeout-detach","Alice","first_person",t),f(true,true,false,"previous-player"),t);
        detachTimeout.step(f(true,true,false,"previous-player"),t);
        check(detachTimeout.step(f(true,true,false,"previous-player"),t+8001).command()==null
                &&"unknown".equals(detachTimeout.phase())&&detachTimeout.commands()==1,"unconfirmed detach never advances or retries");
        var unknownSelf=policy();unknownSelf.offer(r("unknown-self","Alice","first_person",t),f(true,true,false,"previous-player"),t);
        unknownSelf.step(f(true,true,false,"previous-player"),t);
        check(unknownSelf.step(new DirectorPolicy.Frame("fixture:1","observer",true,true,"uuid-a",false,"observer",null),t+100).command()==null,"missing native observer UUID cannot confirm detach");
        System.out.println("Native director policy: "+checks+" checks passed");
    }
}
