import java.nio.file.*;
import java.lang.reflect.*;
import java.util.*;
import com.google.gson.Gson;
import sun.misc.Unsafe;

/** CPU-only original client animation reference. No world, connection or window. */
public class ProbeVanillaFlyingModels {
 static class Allay extends cgk {
  float holding;Allay(){super(null,null);}
  @Override public boolean gk(){return false;}
  @Override public boolean gl(){return false;}
  @Override public float H(float partial){return holding;}
 }
 static class Vex extends ckr {
  boolean charge;Vex(){super(null,null);}
  @Override public boolean gl(){return charge;}
  @Override public cuq eT(){return cuq.l;}
  @Override public cuq eU(){return cuq.l;}
 }
 static final Map<String,Object> result=new LinkedHashMap<>();
 static Object field(Object owner,String name)throws Exception{var f=owner.getClass().getDeclaredField(name);f.setAccessible(true);return f.get(owner);}
 static void read(Object root,String path,Map<String,Object> values)throws Exception{
  values.put(path,Map.of("position",List.of(field(root,"b"),field(root,"c"),field(root,"d")),"rotation",List.of(field(root,"e"),field(root,"f"),field(root,"g"))));
  for(var e:((Map<String,Object>)field(root,"n")).entrySet())read(e.getValue(),path+"/"+e.getKey(),values);
 }
 public static void main(String[]args)throws Exception{
  ab.a();akt.a();var f=Unsafe.class.getDeclaredField("theUnsafe");f.setAccessible(true);var unsafe=(Unsafe)f.get(null);
  var rows=new ArrayList<Object>();
  for(String type:List.of("allay","vex"))for(float age:new float[]{0,1,20,80.5f})for(float speed:new float[]{0,.2f,.8f})for(float variant:new float[]{0,1}){
   var modelClass=type.equals("allay")?fug.class:fxt.class;
   Object definition=modelClass.getMethod("b").invoke(null),root=definition.getClass().getMethod("a").invoke(definition),model=modelClass.getConstructor(fyk.class).newInstance(root);
   Object entity;
   if(type.equals("allay")){var a=(Allay)unsafe.allocateInstance(Allay.class);a.holding=variant;a.ai=(int)age;entity=a;modelClass.getMethod("a",cgk.class,float.class,float.class,float.class,float.class,float.class).invoke(model,a,3.25f,speed,age,17f,-12f);}
   else{var v=(Vex)unsafe.allocateInstance(Vex.class);v.charge=variant>0;entity=v;modelClass.getMethod("a",ckr.class,float.class,float.class,float.class,float.class,float.class).invoke(model,v,3.25f,speed,age,17f,-12f);}
   var parts=new LinkedHashMap<String,Object>();read(modelClass.getMethod("a").invoke(model),"root/root",parts);
   rows.add(Map.of("name","minecraft:"+type,"age",age,"speed",speed,"walk",3.25f,"headYaw",17f,"pitch",-12f,"holding",type.equals("allay")?variant:0,"charging",type.equals("vex")&&variant>0,"parts",parts));
  }
  Files.writeString(Path.of(args[0]),new Gson().toJson(Map.of("clientSha256","499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99","rows",rows))+"\n");
  System.out.println("originalFlyingCases="+rows.size());
 }
}
