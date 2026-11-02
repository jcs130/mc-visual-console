import org.mcvisual.director.WindowPolicy;
public final class WindowPolicyCheck {
 private static int n;private static void check(boolean value,String name){n++;if(!value)throw new AssertionError(name);}
 public static void main(String[] args){
  var off=WindowPolicy.disabled();
  var live=new WindowPolicy.Config(WindowPolicy.SCHEMA,true,true,true,true,60,1920,1080,"1080");
  check(WindowPolicy.valid(off),"unconfigured default valid");
  check(!WindowPolicy.suppressGrab(off),"ordinary game body retains mouse behavior");
  check(!WindowPolicy.avoidFocus(off),"ordinary launcher focus unchanged");
  check(WindowPolicy.frameLimit(off,30,false,false,true)==30,"unconfigured FPS unchanged");
  check(WindowPolicy.valid(live),"explicit observer configuration");
  check(WindowPolicy.suppressGrab(live),"observer grab prevented even after menu closes");
  check(WindowPolicy.avoidFocus(live),"explicit no-activation policy");
  check(WindowPolicy.frameLimit(live,10,false,false,true)==60,"unfocused world follows chosen cap");
  check(WindowPolicy.frameLimit(live,120,true,false,true)==120,"focused user setting preserved");
  check(WindowPolicy.frameLimit(live,10,false,true,true)==10,"minimized is not claimed as supported background rendering");
  check(WindowPolicy.frameLimit(live,30,false,false,false)==30,"title/loading cap preserved");
  check(WindowPolicy.validSize(2560,1440),"1440p budget");
  check(WindowPolicy.validSize(3840,2160),"4K hard ceiling");
  check(!WindowPolicy.validSize(4096,4096),"pixel budget enforced");
  check(!WindowPolicy.validSize(1920,0),"partial dimensions refused");
  check(!WindowPolicy.validSize(-1,1080),"negative size refused");
  check(WindowPolicy.logicalSize(1920,1280,2560)==960,"high-DPI physical sizing");
  check(WindowPolicy.logicalSize(1920,1280,1280)==1920,"one-to-one physical sizing");
  check(WindowPolicy.sameStartupPolicy(live,new WindowPolicy.Config(WindowPolicy.SCHEMA,true,true,true,true,75,2560,1440,"1440")),"quality-only changes hot apply");
  check(!WindowPolicy.sameStartupPolicy(live,new WindowPolicy.Config(WindowPolicy.SCHEMA,true,false,true,true,60,1920,1080,"manual")),"capture policy cannot silently change mid-session");
  check(!WindowPolicy.valid(new WindowPolicy.Config("unknown/v2",true,true,true,true,60,1920,1080,"")),"unknown schema refused");
  check(!WindowPolicy.valid(new WindowPolicy.Config(WindowPolicy.SCHEMA,true,true,true,true,9999,1920,1080,"")),"unbounded FPS refused");
  System.out.println(n+" observer window policy checks passed");
 }
}
