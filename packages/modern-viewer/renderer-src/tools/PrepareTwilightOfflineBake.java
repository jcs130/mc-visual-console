/* Tool-only loader overlay. Model/factory bytecode is never rewritten.
 * NeoForge normally opens two LayerDefinitions fields through its shipped AT.
 * The offline environment omits only BeanContext's mod-container registration;
 * it keeps TwilightForestMod's original ResourceLocation helpers and logger.
 */
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.ZipFile;
import org.objectweb.asm.*;

public class PrepareTwilightOfflineBake {
    static String hash(byte[] b)throws Exception{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(b));}
    static byte[] read(Path jar,String key)throws Exception{try(var z=new ZipFile(jar.toFile())){return z.getInputStream(z.getEntry(key)).readAllBytes();}}
    public static void main(String[] args)throws Exception {
        if(args.length!=4)throw new IllegalArgumentException("original-twilight.jar named-client.jar neoforge-universal.jar NEW-overlay-directory");
        Path twilight=Path.of(args[0]),client=Path.of(args[1]),forge=Path.of(args[2]),output=Path.of(args[3]);
        if(Files.exists(output))throw new IllegalArgumentException("Preserve previous overlays");
        if(!hash(Files.readAllBytes(twilight)).equals(ExportTwilightModelLayers.JAR_SHA))throw new IllegalArgumentException("Unsupported Twilight source");
        String at=new String(read(forge,"META-INF/accesstransformer.cfg"),java.nio.charset.StandardCharsets.UTF_8);
        for(String name:List.of("INNER_ARMOR_DEFORMATION","OUTER_ARMOR_DEFORMATION"))
            if(!at.contains("public net.minecraft.client.model.geom.LayerDefinitions "+name+" "))throw new IllegalArgumentException("Required original NeoForge AT missing");
        Map<String,Object> record=new TreeMap<>();int[] omitted={0},opened={0};
        for(String owner:List.of("twilightforest/TwilightForestMod","net/minecraft/client/model/geom/LayerDefinitions")) {
            byte[] original=read(owner.startsWith("twilight")?twilight:client,owner+".class");ClassWriter writer=new ClassWriter(0);
            new ClassReader(original).accept(new ClassVisitor(Opcodes.ASM9,writer) {
                @Override public FieldVisitor visitField(int access,String name,String descriptor,String signature,Object value){
                    if(owner.endsWith("LayerDefinitions")&&List.of("INNER_ARMOR_DEFORMATION","OUTER_ARMOR_DEFORMATION").contains(name)) {
                        opened[0]++;access=(access&~(Opcodes.ACC_PRIVATE|Opcodes.ACC_PROTECTED))|Opcodes.ACC_PUBLIC;
                    }
                    return super.visitField(access,name,descriptor,signature,value);
                }
                @Override public MethodVisitor visitMethod(int access,String name,String descriptor,String signature,String[] exceptions){
                    MethodVisitor target=super.visitMethod(access,name,descriptor,signature,exceptions);
                    if(!owner.equals("twilightforest/TwilightForestMod")||!name.equals("<clinit>"))return target;
                    return new MethodVisitor(Opcodes.ASM9,target) {
                        @Override public void visitMethodInsn(int op,String owner,String name,String desc,boolean itf){
                            if(op==Opcodes.INVOKESTATIC&&owner.equals("twilightforest/beanification/BeanContext")&&name.equals("init")&&desc.equals("(Ljava/lang/String;)V")) {
                                omitted[0]++;super.visitInsn(Opcodes.POP);
                            } else super.visitMethodInsn(op,owner,name,desc,itf);
                        }
                    };
                }
            },0);
            byte[] bytes=writer.toByteArray();Path file=output.resolve(owner+".class");Files.createDirectories(file.getParent());Files.write(file,bytes);
            record.put(owner,Map.of("originalSha256",hash(original),"overlaySha256",hash(bytes)));
        }
        if(omitted[0]!=1||opened[0]!=2)throw new IllegalStateException("Unexpected loader transformation inventory");
        Files.writeString(output.resolve("offline-bake-environment.json"),new com.google.gson.Gson().toJson(Map.of("modelBytecodeModified",false,"modContainerRegistrationCallsOmitted",omitted[0],"originalNeoForgeAccessRulesApplied",opened[0],"classes",record))+"\n");
        System.out.println("Offline geometry-only environment prepared; original model bytecode retained");
    }
}
