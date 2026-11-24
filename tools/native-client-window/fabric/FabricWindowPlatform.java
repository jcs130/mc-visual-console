package org.mcvisual.window.fabric;
import java.nio.file.Path;
import net.minecraft.*;
import org.mcvisual.window.WindowPlatform;
public final class FabricWindowPlatform implements WindowPlatform {
 public Path gameDirectory(){return class_310.method_1551().field_1697.toPath();}
 public String loader(){return "fabric";}
 public Snapshot snapshot(){
  var mc=class_310.method_1551();if(mc==null||mc.method_22683()==null)return null;
  var window=mc.method_22683();var target=mc.method_1522();
  return new Snapshot(window.method_4490(),window.method_4498(),mc.field_1729.method_1613(),mc.field_1687!=null,mc.method_1562()!=null,
   target.field_1482,target.field_1481,mc.method_47599(),mc.field_1690.method_42524().method_41753(),window.method_16000());
 }
 public void disablePauseOnLostFocus(){class_310.method_1551().field_1690.field_1837=false;}
 public void frameLimit(int cap){class_310.method_1551().method_22683().method_15999(cap);}
 public Class<?>[] hookTargets(){return new Class<?>[]{class_312.class,class_1041.class,class_757.class};}
}
