import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.ZipFile;
import com.google.gson.*;
import org.objectweb.asm.*;

/** Read factory registrations from the pinned original class; no game startup,
 * constructors or guessed IDs. Reject delegating/anonymous/custom Item classes. */
public final class AuditTwilightItemFactories {
  static final String JAR_SHA="493da16d10210f9f53a3c33b3d8fcb4ae9b14016ee420d753c894562bd9aba35";
  static final Set<String> EXACT=Set.of("Item","SwordItem","PickaxeItem","AxeItem","ShovelItem","HoeItem","ArmorItem");
  static String sha(byte[] bytes)throws Exception{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}
  public static void main(String[] args)throws Exception{
    Path jar=Path.of(args[0]),out=Path.of(args[1]);if(!sha(Files.readAllBytes(jar)).equals(JAR_SHA))throw new IllegalArgumentException("Unpinned Twilight JAR");
    byte[] raw;try(var zip=new ZipFile(jar.toFile())){raw=zip.getInputStream(zip.getEntry("twilightforest/init/TFItems.class")).readAllBytes();}
    Map<String,String> constructors=new HashMap<>(),registrations=new LinkedHashMap<>();
    new ClassReader(raw).accept(new ClassVisitor(Opcodes.ASM9){
      public MethodVisitor visitMethod(int access,String name,String desc,String signature,String[] exceptions){
        return new MethodVisitor(Opcodes.ASM9){String id=null,factory=null,constructed=null;boolean ambiguous=false,customDefaults=false;
          public void visitLdcInsn(Object value){if(name.equals("<clinit>")&&value instanceof String s&&s.matches("[a-z0-9_]+"))id=s;}
          public void visitInvokeDynamicInsn(String dyn,String type,Handle bootstrap,Object... arguments){if(name.equals("<clinit>"))for(Object value:arguments)if(value instanceof Handle h&&h.getOwner().equals("twilightforest/init/TFItems"))factory=h.getName()+h.getDesc();}
          public void visitTypeInsn(int opcode,String type){if(opcode==Opcodes.NEW&&type.startsWith("net/minecraft/world/item/")&&EXACT.contains(type.substring(type.lastIndexOf('/')+1))){if(constructed!=null)ambiguous=true;constructed=type;}}
          public void visitFieldInsn(int op,String owner,String field,String type){if(op==Opcodes.GETSTATIC&&(owner.equals("net/minecraft/core/component/DataComponents")||owner.equals("twilightforest/init/TFDataComponents")))customDefaults=true;}
          public void visitMethodInsn(int op,String owner,String method,String type,boolean itf){
            if(name.equals("<clinit>")&&method.equals("register")&&owner.equals("net/neoforged/neoforge/registries/DeferredRegister$Items")){
              if(id!=null&&factory!=null&&registrations.put("twilightforest:"+id,factory)!=null)throw new IllegalArgumentException("Duplicate item");id=null;factory=null;
            }
          }
          public void visitEnd(){if(constructed!=null&&!ambiguous&&!customDefaults)constructors.put(name+desc,constructed.replace('/','.'));}
        };
      }
    },ClassReader.SKIP_DEBUG|ClassReader.SKIP_FRAMES);
    JsonObject result=new JsonObject();result.addProperty("schemaVersion",1);result.addProperty("sourceJarSha256",JAR_SHA);result.addProperty("classSha256",sha(raw));result.addProperty("source","original_TFItems_register_and_exact_factory_constructor");
    JsonArray items=new JsonArray();for(var row:registrations.entrySet())if(constructors.containsKey(row.getValue())){
      JsonObject item=new JsonObject();item.addProperty("id",row.getKey());item.addProperty("factory",row.getValue());item.addProperty("itemClass",constructors.get(row.getValue()));items.add(item);
    }result.add("items",items);Files.writeString(out,new GsonBuilder().setPrettyPrinting().create().toJson(result)+"\n");System.out.println("Audited exact original Item factories: "+items.size());
  }
}
