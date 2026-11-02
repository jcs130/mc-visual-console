import org.mcvisual.neoforge.SpectatorHandPolicy;
import org.mcvisual.neoforge.SpectatorHandPolicy.Frame;

/** Render-boundary scenarios: stale and changed observers never lend a previous subject's hands. */
public final class SpectatorHandPolicyCheck {
 static int checks;static void check(boolean b,String why){checks++;if(!b)throw new AssertionError(why);}
 static Frame valid(){return new Frame(true,true,true,false,"observer","actor","actor",true,true,false,false);}
 public static void main(String[] args){
  check(SpectatorHandPolicy.draw(valid()),"current first-person observer draws original subject");
  check(!SpectatorHandPolicy.draw(null),"no camera is unavailable");
  check(!SpectatorHandPolicy.draw(new Frame(false,true,true,false,"observer","actor","actor",true,true,false,false)),"disabled profile");
  check(!SpectatorHandPolicy.draw(new Frame(true,false,true,false,"observer","actor","actor",true,true,false,false)),"expired authoritative target state");
  check(!SpectatorHandPolicy.draw(new Frame(true,true,false,false,"observer","actor","actor",true,true,false,false)),"ordinary gameplay untouched");
  check(!SpectatorHandPolicy.draw(new Frame(true,true,true,true,"observer","actor","actor",true,true,false,false)),"another spectator has no survival hands");
  check(!SpectatorHandPolicy.draw(new Frame(true,true,true,false,"observer","observer","observer",true,true,false,false)),"never draw spectator self");
  check(!SpectatorHandPolicy.draw(new Frame(true,true,true,false,"observer","actor","other",true,true,false,false)),"changed camera cannot borrow prior equipment");
  check(!SpectatorHandPolicy.draw(new Frame(true,true,true,false,"observer","actor","actor",false,true,false,false)),"new world/connection/entity waits for a fresh hand tick");
  check(!SpectatorHandPolicy.draw(new Frame(true,true,true,false,"observer","actor","actor",true,false,false,false)),"no duplicate arms in third-person or orthographic");
  check(!SpectatorHandPolicy.draw(new Frame(true,true,true,false,"observer","actor","actor",true,true,true,false)),"hidden GUI remains hidden");
  check(!SpectatorHandPolicy.draw(new Frame(true,true,true,false,"observer","actor","actor",true,true,false,true)),"menu does not draw an extra foreground pair");
  check(SpectatorHandPolicy.hands(false,false,false,true,false,false)==3,"sword and shield keep both hands");
  check(SpectatorHandPolicy.hands(true,true,true,true,false,false)==1,"drawing main-hand bow excludes offhand");
  check(SpectatorHandPolicy.hands(true,true,true,false,false,false)==2,"drawing offhand bow excludes main hand");
  check(SpectatorHandPolicy.hands(true,true,false,true,false,true)==1,"using main hand while offhand crossbow charged");
  check(SpectatorHandPolicy.hands(true,true,false,false,true,false)==3,"ordinary offhand use keeps original both-hand behavior");
  check(SpectatorHandPolicy.hands(true,false,false,true,true,false)==1,"charged main crossbow at rest");
  check(SpectatorHandPolicy.hands(true,false,false,true,false,true)==3,"charged offhand at rest keeps both");
  check(SpectatorHandPolicy.hands(false,true,false,true,false,false)==3,"food and tools retain original use animation selection");
  System.out.println(checks+" spectator-hand scope and animation checks passed");
 }
}
