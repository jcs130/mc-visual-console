import java.util.*;
import org.mcvisual.director.*;
public final class OnlineTargetsCheck {
 static int count;static void check(boolean b,String why){count++;if(!b)throw new AssertionError(why);}
 public static void main(String[] args){
  String self="11111111-1111-1111-1111-111111111111",alice="22222222-2222-2222-2222-222222222222",bob="33333333-3333-3333-3333-333333333333";
  var roster=OnlineTargets.collect(List.of(new OnlineTargets.Player("live",self),new OnlineTargets.Player("Alice",alice),new OnlineTargets.Player("Bob",bob)),self,"live",Set.of());
  check(roster.size()==2,"ordinary players included; observer excluded by original UUID");check(roster.containsKey("Bob"),"ordinary player needs no Agent event source");
  check(OnlineTargets.collect(List.of(new OnlineTargets.Player("OtherName",self)),self,"live",Set.of()).isEmpty(),"observer rename cannot bypass exclusion");
  check(OnlineTargets.collect(List.of(new OnlineTargets.Player("Bob",bob)),self,"live",Set.of("bob")).isEmpty(),"explicit case-insensitive exclusions");
  check(OnlineTargets.collect(List.of(new OnlineTargets.Player("Alice",alice),new OnlineTargets.Player("ALICE",bob)),self,"live",Set.of()).isEmpty(),"ambiguous names excluded rather than guessing identity");
  check(!OnlineTargets.validName("Bob;op")&&!OnlineTargets.validName("@a")&&!OnlineTargets.validUuid("fake"),"no arbitrary command token or invented UUID");
  var config=new DirectorPolicy.Config(true,"fixture","live",Set.of("Alice"),10000);
  var legacy=new DirectorPolicy(config);legacy.observeOnlineTargets(roster);
  var discovered=new DirectorPolicy(config,true);discovered.observeOnlineTargets(roster);
  var request=new DirectorPolicy.Request("bob-one","fixture-lease","Bob","first_person",1000,5000);
  var frame=new DirectorPolicy.Frame("fixture","live",true,true,bob,false,self,self,1);
  check(!legacy.offer(request,frame,1000),"configured mode stays explicit and unchanged");
  check(discovered.offer(request,frame,1000),"explicit discovery mode admits the native ordinary player");
  discovered.observeOnlineTargets(Map.of());check("ready".equals(discovered.phase()),"roster refresh does not fabricate completion or reset operation state");
  var wrongIdentity=new DirectorPolicy(config,true);wrongIdentity.observeOnlineTargets(roster);
  check(!wrongIdentity.offer(request,new DirectorPolicy.Frame("fixture","live",true,true,alice,false,self,self,1),1000),"candidate name must match the native online UUID");
  var serverAccess=ObserverAccess.server();var boundAccess=new ObserverAccess.Config(ObserverAccess.SCHEMA,"bound-player",alice);
  check(ObserverAccess.valid(serverAccess)&&ObserverAccess.valid(boundAccess),"versioned server and bound-player scopes");
  check(!ObserverAccess.valid(new ObserverAccess.Config(ObserverAccess.SCHEMA,"server",alice)),"server scope cannot silently inherit an eye binding");
  check(!ObserverAccess.valid(new ObserverAccess.Config("other/v1","server",null)),"unknown scope version rejected");
  check(!ObserverAccess.discoveryAllowed(boundAccess,true),"eye cannot enable all-online discovery");
  var observed=List.of(new OnlineTargets.Player("Alice",alice,false),new OnlineTargets.Player("OtherEye",bob,true),new OnlineTargets.Player("UnknownMode","44444444-4444-4444-4444-444444444444",null));
  var serverTargets=OnlineTargets.collect(observed,self,"live",Set.of(),serverAccess);
  check(serverTargets.size()==1&&serverTargets.containsKey("Alice"),"live excludes spectator and unknown game modes from actual native list");
  check(OnlineTargets.collect(List.of(new OnlineTargets.Player("OrdinaryName",bob,true)),self,"live",Set.of(),serverAccess).isEmpty(),"spectator filtering uses received mode, never an eye name prefix");
  check(OnlineTargets.collect(List.of(new OnlineTargets.Player("EyeNamedNormal",bob,false)),self,"live",Set.of(),serverAccess).containsKey("EyeNamedNormal"),"names do not define permissions");
  var eye=new DirectorPolicy(config,false,boundAccess);eye.observeOnlineTargets(roster);
  check(!eye.offer(request,frame,1000)&&eye.commands()==0,"bound eye refuses an unrelated target even in an overbroad supplied roster");
  var aliceRequest=new DirectorPolicy.Request("alice-one","eye-lease","Alice","first_person",1000,5000);
  check(eye.offer(aliceRequest,new DirectorPolicy.Frame("fixture","live",true,true,alice,true,self,self,1),1000),"bound eye accepts only its corresponding UUID");
  var renamed=OnlineTargets.collect(List.of(new OnlineTargets.Player("RenamedOwner",alice,false),new OnlineTargets.Player("Alice",bob,false)),self,"live",Set.of(),boundAccess);
  check(renamed.size()==1&&renamed.containsKey("RenamedOwner"),"eye UUID binding survives rename and rejects name reuse");
  boolean scopeConflict=false;try{new DirectorPolicy(config,true,boundAccess);}catch(IllegalArgumentException expected){scopeConflict=true;}
  check(scopeConflict,"conflicting bound and global configuration fails closed");
  System.out.println(count+" online target checks passed");
 }
}
