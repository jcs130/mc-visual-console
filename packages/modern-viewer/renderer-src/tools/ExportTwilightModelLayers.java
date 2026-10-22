/* Offline bake of the original, hash-locked Twilight Forest model factories.
 * No Minecraft instance, account, world, window, renderer or GPU is created.
 * Model registration is read from actual bytecode rather than an upstream tip.
 */
import java.nio.file.*;
import java.lang.reflect.*;
import java.security.MessageDigest;
import java.util.*;
import com.google.gson.Gson;
import org.objectweb.asm.*;

public class ExportTwilightModelLayers {
    static final String JAR_SHA="493da16d10210f9f53a3c33b3d8fcb4ae9b14016ee420d753c894562bd9aba35";
    static final String OWNER="twilightforest/client/event/ClientRegistrationEvents";
    record Factory(String name,Handle method) {}
    static Object field(Object value,String name)throws Exception {
        Field f=value.getClass().getDeclaredField(name);f.setAccessible(true);return f.get(value);
    }
    static List<Object> fields(Object value,String... names)throws Exception {
        List<Object> out=new ArrayList<>();for(String name:names)out.add(field(value,name));return out;
    }
    static List<Object> vector(Object value)throws Exception {
        List<Object> out=new ArrayList<>();for(String name:List.of("x","y","z"))out.add(value.getClass().getMethod(name).invoke(value));return out;
    }
    static void part(Object model,String name,String path,String parent,List<Map<String,Object>> out)throws Exception {
        Map<String,Object> row=new LinkedHashMap<>();row.put("name",name);row.put("path",path);if(parent!=null)row.put("parent",parent);
        row.put("pivot",fields(model,"x","y","z"));row.put("rotationZYX",fields(model,"xRot","yRot","zRot"));
        row.put("scale",fields(model,"xScale","yScale","zScale"));row.put("visible",field(model,"visible"));row.put("skipDraw",field(model,"skipDraw"));
        List<Object> polygons=new ArrayList<>();
        for(Object cube:(List<?>)field(model,"cubes"))for(Object face:(Object[])field(cube,"polygons")) {
            if(face==null)continue;List<Object> positions=new ArrayList<>(),uv=new ArrayList<>();
            for(Object vertex:(Object[])field(face,"vertices")) {
                positions.addAll(vector(field(vertex,"pos")));uv.add(field(vertex,"u"));uv.add(field(vertex,"v"));
            }
            polygons.add(Map.of("positions",positions,"uv",uv,"normal",vector(field(face,"normal"))));
        }
        row.put("polygons",polygons);out.add(row);
        for(var child:((Map<String,?>)field(model,"children")).entrySet())part(child.getValue(),child.getKey(),path+"/"+child.getKey(),path,out);
    }
    static List<Factory> factories(byte[] code) {
        List<Factory> out=new ArrayList<>();
        new ClassReader(code).accept(new ClassVisitor(Opcodes.ASM9) {
            @Override public MethodVisitor visitMethod(int access,String name,String desc,String sig,String[] exceptions) {
                if(!name.equals("registerLayerDefinitions"))return null;
                return new MethodVisitor(Opcodes.ASM9) {
                    String key;Handle factory;
                    @Override public void visitFieldInsn(int op,String owner,String name,String desc) {
                        if(op==Opcodes.GETSTATIC&&owner.endsWith("/TFModelLayers")){key=name;factory=null;}
                    }
                    @Override public void visitInvokeDynamicInsn(String name,String desc,Handle bootstrap,Object... args) {
                        if(desc.equals("()Ljava/util/function/Supplier;")&&args.length>=2&&args[1] instanceof Handle h)factory=h;
                    }
                    @Override public void visitMethodInsn(int op,String owner,String name,String desc,boolean face) {
                        if(name.equals("registerLayerDefinition")) {
                            if(key==null||factory==null)throw new IllegalStateException("Unrecognized original layer registration");
                            out.add(new Factory(key,factory));key=null;factory=null;
                        }
                    }
                };
            }
        },ClassReader.SKIP_DEBUG|ClassReader.SKIP_FRAMES);
        if(out.size()<40||new HashSet<>(out.stream().map(Factory::name).toList()).size()!=out.size())throw new IllegalStateException("Incomplete original layer registrations");
        return out;
    }
    public static void main(String[] args)throws Exception {
        if(args.length!=2)throw new IllegalArgumentException("original-twilight.jar NEW-output.json");
        Path jar=Path.of(args[0]),output=Path.of(args[1]);if(Files.exists(output))throw new IllegalArgumentException("Preserve old exports; choose a new file");
        if(!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(jar))).equals(JAR_SHA))throw new IllegalArgumentException("Unsupported Twilight JAR");
        byte[] code;try(var zip=new java.util.zip.ZipFile(jar.toFile())){code=zip.getInputStream(zip.getEntry(OWNER+".class")).readAllBytes();}
        Map<String,Object> layers=new TreeMap<>(),errors=new TreeMap<>();
        for(Factory f:factories(code)) {
            try {
                Handle h=f.method();if(h.getTag()!=Opcodes.H_INVOKESTATIC||!h.getDesc().equals("()Lnet/minecraft/client/model/geom/builders/LayerDefinition;"))throw new IllegalStateException("Unsupported factory signature");
                Class<?> owner=Class.forName(h.getOwner().replace('/','.'));Method method=owner.getDeclaredMethod(h.getName());method.setAccessible(true);
                Object layer=method.invoke(null),model=layer.getClass().getMethod("bakeRoot").invoke(layer),material=field(layer,"material");
                List<Map<String,Object>> parts=new ArrayList<>();part(model,"root","root",null,parts);
                var definition=Map.of("textureSize",fields(material,"xTexSize","yTexSize"),"parts",parts,"factory",h.getOwner()+"."+h.getName()+h.getDesc());
                // A bad original layer cannot poison every other model. Keep
                // non-finite factories explicitly unavailable, never emit NaN.
                new Gson().toJson(definition);layers.put(f.name(),definition);
            } catch(Throwable e) {
                while(e.getCause()!=null)e=e.getCause();errors.put(f.name(),e.getClass().getName()+": "+e.getMessage());
            }
        }
        Map<String,Object> data=new LinkedHashMap<>();data.put("schemaVersion",1);data.put("minecraftVersion","1.21.1");data.put("sourceJarSha256",JAR_SHA);
        data.put("modelUnits","original_Y_down_pixels");data.put("rotationOrder","ZYX");data.put("source","original_registered_LayerDefinition_bakeRoot");data.put("layers",layers);data.put("unavailable",errors);
        Files.writeString(output,new Gson().toJson(data)+"\n",java.nio.charset.StandardCharsets.UTF_8);
        System.out.println(new Gson().toJson(Map.of("layers",layers.size(),"unavailable",errors)));
    }
}
