package org.mcvisual.content.fabric;
import java.nio.file.Path;
import net.minecraft.*;
import org.mcvisual.content.ContentPlatform;

/** Exact Fabric 1.21.1 intermediary bindings; shared transport owns no game classes. */
public final class FabricContentPlatform implements ContentPlatform {
 public Path gameDirectory(){return class_310.method_1551().field_1697.toPath();}
 public boolean hidden(){var mc=class_310.method_1551();return mc.field_1755!=null||mc.field_1690.field_1842;}
 public Scene scene(){
  var mc=class_310.method_1551();var e=mc.method_1560();var c=mc.method_1562();
  if(mc.field_1687==null||mc.field_1724==null||c==null||e==null)return null;
  return new Scene(mc.field_1687,c,e,mc.method_1558()==null?"singleplayer":mc.method_1558().field_3761,
   mc.field_1724.method_5667().toString(),e.method_5667().toString(),e.method_5628(),mc.field_1687.method_27983().method_29177().toString(),
   e instanceof class_1657 p?p.method_7334().getName():e.method_5477().getString());
 }
 public Canvas canvas(class_332 draw){return new Canvas(){
  public int width(){return draw.method_51421();}public int height(){return draw.method_51443();}
  public String fit(String text,int width){return class_310.method_1551().field_1772.method_27523(text,width);}
  public void fill(int l,int t,int r,int b,int color){draw.method_25294(l,t,r,b,color);}
  public void text(String text,int x,int y,int color){draw.method_51433(class_310.method_1551().field_1772,text,x,y,color,false);}
 };}
}
