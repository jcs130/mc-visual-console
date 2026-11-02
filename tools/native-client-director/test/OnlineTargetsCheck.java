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
  System.out.println(count+" online target checks passed");
 }
}
