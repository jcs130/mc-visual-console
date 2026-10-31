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
    static DirectorPolicy.Frame w(long epoch,String camera){
        return new DirectorPolicy.Frame("fixture:1","observer",true,true,"uuid-a",true,camera,"observer",epoch);}
    static DirectorPolicy worldPolicy(String id,long t){
        var p=policy();check(p.offer(r(id,"Alice","drone_follow",t),w(1,"uuid-a"),t),"world fixture admitted");
        p.step(w(1,"uuid-a"),t);return p;}
    static DirectorPolicy.Frame life(long epoch,String camera,String uuid,int id,boolean dead,boolean manual){
        return new DirectorPolicy.Frame("fixture:1","observer",true,true,"uuid-a",true,camera,"observer",epoch,
            new DirectorPolicy.CameraLife(uuid,id,epoch,dead),manual);
    }
    static DirectorPolicy lifePolicy(String id,long t){
        var p=policy();check(p.offer(r(id,"Alice","drone_follow",t),life(1,"uuid-a","uuid-a",31,false,false),t),"life fixture admitted");
        p.step(life(1,"uuid-a","uuid-a",31,false,false),t);return p;
    }
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
        var receipts=policy();receipts.offer(r("attached-one","Alice","first_person",t),f(true,true,true,"uuid-a"),t);
        receipts.step(f(true,true,true,"uuid-a"),t);
        check(!receipts.offer(r("offline-two","Bob","first_person",t+20000),new DirectorPolicy.Frame("fixture:1","observer",true,true,null,false,"uuid-a","observer"),t+20000),"offline offer refused");
        receipts.step(f(true,true,true,"uuid-a"),t+20001);
        check("attached-one".equals(receipts.requestId())&&"attached".equals(receipts.phase()),"refused offer does not replace attached request");
        check("offline-two".equals(receipts.offerReceipt().id())&&!receipts.offerReceipt().accepted()
            &&"target_offline".equals(receipts.offerReceipt().reason()),"matching refused offer survives following tick");
        var manual=policy();manual.offer(r("manual","Alice","first_person",t),f(true,true,true,"uuid-a"),t);manual.step(f(true,true,true,"uuid-a"),t);
        manual.step(f(true,true,true,"observer"),t+100);
        manual.step(new DirectorPolicy.Frame("fixture:1","observer",true,true,null,false,"observer","observer"),t+200);
        check("paused".equals(manual.phase()),"later target disconnect cannot turn a manual pause into recoverable identity loss");
        var missing=policy();missing.offer(r("missing","Alice","first_person",t),f(true,true,true,"uuid-a"),t);missing.step(f(true,true,true,"uuid-a"),t);
        missing.step(new DirectorPolicy.Frame("fixture:1","observer",true,true,null,false,"observer","observer"),t+20000);
        check("stopped".equals(missing.phase())&&"target_identity_lost".equals(missing.reason()),"native loss is a known stopped state");
        check(missing.offer(r("fresh","Bob","drone_follow",t+21000),f(true,true,true,"observer"),t+21000),"new request may select available actor after known loss");
        check("minecraft:spectate Bob".equals(missing.step(f(true,true,true,"observer"),t+21001).command()),"new request never replays old attachment");
        var scopedRequest=new DirectorPolicy.Request("scoped","lease-scoped","Alice","first_person",t,t+5000,"connection-a");
        var bound=policy();
        check(bound.offer(scopedRequest,f(true,true,true,"observer"),t,"connection-a",true),"matching native connection admits a fresh request");
        var replaced=policy();
        check(!replaced.offer(scopedRequest,f(true,true,true,"observer"),t,"connection-b",true),"old request cannot execute on a reconnected client");
        check("connection_epoch_mismatch".equals(replaced.offerReceipt().reason())&&replaced.commands()==0,"mismatched epoch has a refusal receipt and zero commands");
        var unbound=policy();
        check(!unbound.offer(r("legacy","Alice","first_person",t),f(true,true,true,"observer"),t,"connection-a",true),"explicit strict profile rejects unbound requests");
        check("connection_epoch_required".equals(unbound.offerReceipt().reason()),"missing epoch is explicit");
        check(policy().offer(r("compatible","Alice","first_person",t),f(true,true,true,"observer"),t),"legacy profiles retain their explicit compatibility path");
        var world=worldPolicy("world",t);
        var wait=world.step(w(2,"observer"),t+100);
        check("world_transition".equals(world.phase())&&wait.command()==null&&wait.view()==null,"native world replacement waits without control effects");
        check(world.commands()==0&&world.detachObservation().nativeWorldEpoch()==2,"world wait retains exact native evidence and no commands");
        check(!world.offer(r("world-replace","Bob","first_person",t+100),w(2,"observer"),t+100)
            &&"previous_request_pending".equals(world.offerReceipt().reason()),"selector cannot replace world settlement with another request");
        var restored=world.step(w(2,"uuid-a"),t+350);
        check("attached".equals(world.phase())&&"native_world_attachment_restored".equals(world.reason()),"original target native camera restoration confirms world settlement");
        check(restored.command()==null&&restored.view()==null&&"world".equals(world.requestId()),"passive restoration retains original request without forcing a perspective");
        world.step(w(2,"observer"),t+400);
        check("paused".equals(world.phase()),"a subsequent same-world manual detach cannot reuse a consumed settlement window");
        var delayed=worldPolicy("late-camera-gap",t);delayed.step(w(2,"uuid-a"),t+100);
        delayed.step(w(2,"observer"),t+200);
        check("world_transition".equals(delayed.phase()),"world replacement may precede its camera gap by a native tick");
        var timeout=worldPolicy("world-timeout",t);timeout.step(w(2,"observer"),t+100);
        var expired=timeout.step(w(2,"uuid-a"),t+3101);
        check("paused".equals(timeout.phase())&&"native_world_transition_unconfirmed".equals(timeout.reason())
            &&expired.command()==null&&expired.view()==null,"late attachment cannot erase a world timeout");
        check(!timeout.offer(r("timeout-steal","Alice","first_person",t+3200),w(2,"uuid-a"),t+3200),"world timeout holds original lease");
        var repeated=worldPolicy("repeated-world",t);repeated.step(w(2,"observer"),t+100);
        repeated.step(w(3,"observer"),t+200);
        check("paused".equals(repeated.phase()),"further world replacements do not extend the bounded wait");
        var oldPause=worldPolicy("old-manual",t);oldPause.step(w(1,"observer"),t+100);
        var originalDetach=oldPause.detachObservation();oldPause.step(w(2,"uuid-a"),t+200);
        check("paused".equals(oldPause.phase())&&oldPause.detachObservation()==originalDetach,"world replacement cannot erase a pre-existing manual pause or its evidence");
        var sameWorld=worldPolicy("same-world-manual",t);sameWorld.step(w(1,"observer"),t+100);
        check("paused".equals(sameWorld.phase()),"same-world detach still pauses immediately");
        var untagged=worldPolicy("untagged",t);untagged.step(w(0,"observer"),t+100);
        check("paused".equals(untagged.phase()),"unknown world epochs do not invent a transition");
        var regression=worldPolicy("regression",t);regression.step(w(2,"uuid-a"),t+100);
        regression.step(w(1,"observer"),t+200);
        check("paused".equals(regression.phase()),"regressing world epochs cannot enable passive recovery");
        var identity=worldPolicy("world-new-identity",t);identity.step(w(2,"observer"),t+100);
        identity.step(new DirectorPolicy.Frame("fixture:1","observer",true,true,"new-uuid",true,"new-uuid","observer",2),t+200);
        check("stopped".equals(identity.phase())&&"target_identity_lost".equals(identity.reason()),"world wait cannot accept another target identity");
        var foreign=worldPolicy("world-other-camera",t);foreign.step(w(2,"observer"),t+100);
        foreign.step(w(2,"another-camera"),t+200);
        check("paused".equals(foreign.phase()),"another camera during settlement is protected as a detach");
        var observerChanged=worldPolicy("world-observer",t);observerChanged.step(w(2,"observer"),t+100);
        observerChanged.step(new DirectorPolicy.Frame("fixture:1","observer",true,true,"uuid-a",true,"uuid-a","other-observer",2),t+200);
        check("paused".equals(observerChanged.phase()),"observer identity must stay exact");
        var noAuth=worldPolicy("world-auth",t);noAuth.step(w(2,"observer"),t+100);
        noAuth.step(new DirectorPolicy.Frame("fixture:1","observer",false,true,"uuid-a",true,"uuid-a","observer",2),t+200);
        check("stopped".equals(noAuth.phase())&&noAuth.commands()==0,"world transition cannot recover authentication loss");
        var noSpectator=worldPolicy("world-mode",t);noSpectator.step(w(2,"observer"),t+100);
        noSpectator.step(new DirectorPolicy.Frame("fixture:1","observer",true,false,"uuid-a",true,"uuid-a","observer",2),t+200);
        check("paused".equals(noSpectator.phase()),"world settlement cannot force spectator mode back on");
        var tabGap=worldPolicy("tab-gap",t);
        tabGap.step(new DirectorPolicy.Frame("fixture:1","observer",true,true,null,false,null,"observer",2),t+100);
        check("world_transition".equals(tabGap.phase()),"bounded native world settlement can wait for a missing tab/camera sample");
        tabGap.step(w(2,"uuid-a"),t+200);
        check("attached".equals(tabGap.phase())&&tabGap.commands()==0,"tab recovery needs exact native target and camera readback");
        var tabOnly=worldPolicy("tab-only-gap",t);
        tabOnly.step(new DirectorPolicy.Frame("fixture:1","observer",true,true,null,false,"uuid-a","observer",2),t+100);
        check("world_transition".equals(tabOnly.phase()),"a native world tab gap may retain the original exact camera");
        tabOnly.step(w(2,"uuid-a"),t+200);
        check("attached".equals(tabOnly.phase())&&tabOnly.commands()==0,"tab-only restoration remains passive");
        var death=lifePolicy("actual-death",t);
        var deathAction=death.step(life(1,"observer","uuid-a",31,true,false),t+100);
        check("stopped".equals(death.phase())&&"target_died".equals(death.reason()),"exact attached native entity death is a known loss");
        check(deathAction.command()==null&&deathAction.view()==null&&death.commands()==0,"death classification does not replay commands or change view");
        check(death.offer(r("after-death","Bob","drone_follow",t+20000),life(1,"observer","uuid-b",32,false,false),t+20000),"fresh request can select another target after native death");
        var during=lifePolicy("manual-and-death",t);
        during.step(life(1,"observer","uuid-a",31,true,true),t+100);
        check("paused".equals(during.phase())&&"manual_detach_input".equals(during.reason()),"native manual input wins simultaneous death");
        check(!during.offer(r("manual-death-steal","Alice","first_person",t+1000),life(1,"observer","uuid-a",31,true,false),t+1000),"manual input holds the original lease");
        for(var fixture:List.of(
                life(1,"observer","uuid-a",31,false,false),
                life(1,"observer","uuid-a",99,true,false),
                life(1,"observer","wrong-uuid",31,true,false),
                life(0,"observer","uuid-a",31,true,false),
                life(1,"foreign-camera","uuid-a",31,true,false))){
            var guard=lifePolicy("guard-"+checks,t);guard.step(fixture,t+100);
            check(!"target_died".equals(guard.reason())&&guard.commands()==0,"healthy/unbound/unknown-camera observation never becomes recoverable death");
        }
        var deathWorld=lifePolicy("death-world",t);deathWorld.step(life(2,"observer","uuid-a",31,true,false),t+100);
        check(!"target_died".equals(deathWorld.reason()),"different native world cannot reuse an old corpse");
        var corpse=lifePolicy("corpse-camera",t);corpse.step(life(1,"uuid-a","uuid-a",31,true,false),t+100);
        check("attached".equals(corpse.phase()),"a still-attached death animation is not a detached camera");
        var manualFirst=lifePolicy("manual-first",t);manualFirst.step(life(1,"observer","uuid-a",31,false,true),t+100);
        manualFirst.step(life(1,"observer","uuid-a",31,true,false),t+200);
        check("paused".equals(manualFirst.phase())&&"manual_detach_input".equals(manualFirst.reason()),"later death cannot erase manual intent");
        check(DirectorPolicy.hideObserverBody(true,true,true),"explicit spectator self body is hidden");
        check(!DirectorPolicy.hideObserverBody(true,true,false),"followed actors remain visible");
        check(!DirectorPolicy.hideObserverBody(true,false,true),"ordinary survival self remains visible");
        check(!DirectorPolicy.hideObserverBody(false,true,true),"disabled profile changes no body rendering");
        var newLife=lifePolicy("new-world-life",t);newLife.step(life(2,"observer","uuid-a",42,false,false),t+100);
        newLife.step(life(2,"uuid-a","uuid-a",42,false,false),t+200);
        newLife.step(life(2,"observer","uuid-a",42,true,false),t+300);
        check("target_died".equals(newLife.reason()),"newly attached healthy entity after world settlement has its own death binding");
        var unobservedLife=lifePolicy("unobserved-world-life",t);unobservedLife.step(w(2,"observer"),t+100);
        unobservedLife.step(w(2,"uuid-a"),t+200);
        unobservedLife.step(life(2,"observer","uuid-a",31,true,false),t+300);
        check(!"target_died".equals(unobservedLife.reason()),"world settlement without a healthy entity observation cannot reuse an old entity ID");
        var replacedLife=lifePolicy("same-world-new-entity",t);replacedLife.step(life(1,"uuid-a","uuid-a",42,false,false),t+100);
        replacedLife.step(life(1,"observer","uuid-a",42,true,false),t+200);
        check("target_died".equals(replacedLife.reason()),"actual attached entity replacement updates the exact healthy lifecycle binding");
        var raced=policy();raced.offer(r("dead-during-offer","Alice","drone_overview",t),life(1,"uuid-a","uuid-a",31,true,false),t);
        var detachDead=raced.step(life(1,"uuid-a","uuid-a",31,true,false),t);
        check("target_death_transition".equals(raced.phase())&&"minecraft:spectate".equals(detachDead.command())
            &&detachDead.view()==null,"death during reframe releases only the known dead camera once");
        check(raced.step(life(1,"uuid-a","uuid-a",31,true,false),t+100).command()==null&&raced.commands()==1,"dead-camera detach is never replayed while awaiting ACK");
        check(!raced.offer(r("replace-death-pending","Bob","first_person",t+100),w(1,"observer"),t+100),"dead-camera release remains a native pending operation");
        raced.step(life(1,"observer","uuid-a",31,true,false),t+200);
        check("stopped".equals(raced.phase())&&"target_died".equals(raced.reason())&&raced.commands()==1,"self readback makes raced death a known loss even without healthy attachment");
        var racedManual=policy();racedManual.offer(r("dead-manual","Alice","drone_overview",t),life(1,"uuid-a","uuid-a",31,true,false),t);
        racedManual.step(life(1,"uuid-a","uuid-a",31,true,false),t);
        racedManual.step(life(1,"observer","uuid-a",31,true,true),t+100);
        check("paused".equals(racedManual.phase())&&"manual_detach_input".equals(racedManual.reason()),"manual input wins a dead-camera pending release");
        var racedTimeout=policy();racedTimeout.offer(r("dead-timeout","Alice","drone_overview",t),life(1,"uuid-a","uuid-a",31,true,false),t);
        racedTimeout.step(life(1,"uuid-a","uuid-a",31,true,false),t);
        racedTimeout.step(life(1,"observer","uuid-a",31,true,false),t+8001);
        check("unknown".equals(racedTimeout.phase())&&racedTimeout.commands()==1,"late self ACK cannot erase an unknown dead-camera release");
        var inputRace=lifePolicy("input-before-offer",t);
        check(!inputRace.offer(r("input-racing-offer","Alice","drone_overview",t+100),life(1,"uuid-a","uuid-a",31,false,true),t+100)
            &&"paused".equals(inputRace.phase())&&"manual_detach_input".equals(inputRace.reason()),"a reframe offer cannot clear native manual input before the policy tick");
        var proven=lifePolicy("proven-current-camera",t);
        var proof=new DirectorPolicy.Frame("fixture:1","observer",true,true,"uuid-a",true,"observer","observer",1,
            new DirectorPolicy.CameraLife("uuid-a",42,1,true,"proven-current-camera",t+50),false);
        proven.step(proof,t+100);
        check("target_died".equals(proven.reason())&&proven.commands()==0,"current-request actual camera observation proves death even without an earlier healthy frame for that entity");
        for(var sample:List.of(new DirectorPolicy.CameraLife("uuid-a",42,1,true,"another-request",t+50),
                new DirectorPolicy.CameraLife("uuid-a",42,1,true,"proof-guard",t-5000),
                new DirectorPolicy.CameraLife("uuid-a",42,2,true,"proof-guard",t+50))){
            var guarded=lifePolicy("proof-guard",t);
            guarded.step(new DirectorPolicy.Frame("fixture:1","observer",true,true,"uuid-a",true,"observer","observer",1,sample,false),t+100);
            check(!"target_died".equals(guarded.reason()),"foreign/stale/wrong-world camera provenance does not recover");
        }
        var preserveReason=lifePolicy("refused-preserves-reason",t);
        preserveReason.step(life(1,"observer","uuid-a",31,false,true),t+100);
        String manualReason=preserveReason.reason();
        preserveReason.offer(r("after-pause-refused","Alice","first_person",t+200),life(1,"observer","uuid-a",31,true,false),t+200);
        check(manualReason.equals(preserveReason.reason())&&"manual_override".equals(preserveReason.offerReceipt().reason()),"refused offers retain both original terminal reason and separate refusal evidence");
        var positionFail=policy();
        var remote=new DirectorPolicy.Frame("fixture:1","observer",true,true,"uuid-a",false,"observer","observer",1);
        check(positionFail.offer(r("position-failure","Alice","first_person",t),remote,t),"positioning request admitted");
        check("minecraft:tp @s Alice".equals(positionFail.step(remote,t).command()),"only observer teleport before attachment");
        check(positionFail.step(remote,t+8001).command()==null&&"stopped".equals(positionFail.phase())
            &&"target_position_unconfirmed".equals(positionFail.reason()),"confirmed self-camera position timeout becomes a known display failure");
        check(positionFail.positionFailure()!=null&&positionFail.positionFailure().commands()==1
            &&"position-failure".equals(positionFail.positionFailure().requestId()),"position failure is request-bound evidence");
        check(positionFail.step(w(1,"observer"),t+9000).command()==null,"late target presence never replays old request");
        for(String camera:Arrays.asList(null,"another-player")){
            var unproven=policy();unproven.offer(r("position-unknown-"+(camera==null?"null":"other"),"Alice","first_person",t),remote,t);unproven.step(remote,t);
            var changedCamera=new DirectorPolicy.Frame("fixture:1","observer",true,true,"uuid-a",false,camera,"observer",1);
            unproven.step(changedCamera,t+8001);check("unknown".equals(unproven.phase())&&unproven.positionFailure()==null,"unknown/nonself camera cannot be auto-recovered");
        }
        System.out.println("Native director policy: "+checks+" checks passed");
    }
}
