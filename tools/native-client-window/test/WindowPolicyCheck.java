import org.mcvisual.window.WindowPolicy;
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
  var work=new WindowPolicy.Area(0,0,1920,1032);var border=new WindowPolicy.Border(8,31,8,8);
  var fit=WindowPolicy.fit(work,border,0,0,1920,1080);
  check(fit.clamped(),"desktop-sized client fits inside titlebar and taskbar");
  check(fit.y()>=31&&fit.x()>=8,"negative titlebar recovered even if requested size already matches framebuffer");
  check(fit.y()+fit.height()+8<=1032&&fit.x()+fit.width()+8<=1920,"full decorated bounds visible");
  var regular=WindowPolicy.fit(work,border,40,60,1600,900);
  check(!regular.clamped()&&regular.x()==40&&regular.y()==60,"visible user window position preserved");
  var left=WindowPolicy.fit(new WindowPolicy.Area(-1920,-100,1920,1032),border,0,-999,1600,900);
  check(left.x()>=-1912&&left.x()+left.width()+8<=0&&left.y()>=-69,"negative-coordinate monitor and taskbar supported");
  var hidpi=WindowPolicy.fit(new WindowPolicy.Area(0,0,1280,688),border,-8,-31,WindowPolicy.logicalSize(1920,1280,1920),WindowPolicy.logicalSize(1080,720,1080));
  check(hidpi.width()+16<=1280&&hidpi.height()+39<=688,"high-DPI logical work area fitting");
  check(WindowPolicy.overlap(new WindowPolicy.Area(-100,0,200,100),work)==10000,"monitor overlap selects the actual window monitor");
  check(WindowPolicy.overlap(new WindowPolicy.Area(-200,-200,10,10),work)==0,"disconnected monitor positions have zero overlap");
  System.out.println(n+" observer window policy checks passed");
 }
}
