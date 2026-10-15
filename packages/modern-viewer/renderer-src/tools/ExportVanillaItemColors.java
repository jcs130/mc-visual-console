/* Offline original registry/PotionContents export. No client instance, world,
 * account, render context, GPU or network connection is created. */
import java.nio.file.*;
import java.lang.reflect.*;
import java.util.*;
import com.google.gson.Gson;

public class ExportVanillaItemColors {
    static final Map<String,String> classes=new HashMap<>(),members=new HashMap<>();
    static final String REG="net.minecraft.core.Registry",BUILT="net.minecraft.core.registries.BuiltInRegistries";
    static Class<?> type(String name)throws Exception{return Class.forName(classes.getOrDefault(name,name));}
    static Object call(String owner,String signature,Object receiver,Object... args)throws Exception{
        String parameters=signature.substring(signature.indexOf('(')+1,signature.length()-1);
        String[] names=parameters.isEmpty()?new String[0]:parameters.split(",");
        Class<?>[] types=new Class<?>[names.length];
        for(int i=0;i<names.length;i++)types[i]=type(names[i]);
        return type(owner).getMethod(members.get(owner+"."+signature),types).invoke(receiver,args);
    }
    static Object registry(String name)throws Exception{return type(BUILT).getField(members.get(BUILT+"."+name)).get(null);}
    static String key(Object registry,Object value)throws Exception{return call(REG,"getKey(java.lang.Object)",registry,value).toString();}
    static Map<String,Object> row(Object registry,Object value)throws Exception{
        Map<String,Object> row=new LinkedHashMap<>();row.put("id",call(REG,"getId(java.lang.Object)",registry,value));row.put("name",key(registry,value));return row;
    }
    static void mappings(Path path)throws Exception{
        String owner=null;
        for(String line:Files.readAllLines(path)){
            if(line.startsWith("#")||!line.contains(" -> "))continue;
            String[] pair=line.trim().split(" -> ");
            if(!line.startsWith(" ")){owner=pair[0];classes.put(owner,pair[1].replace(":",""));}
            else{String declaration=pair[0].replaceFirst("^(\\d+:\\d+:)+","");String member=declaration.substring(declaration.indexOf(' ')+1).replaceFirst(":\\d+:\\d+$","");members.put(owner+"."+member,pair[1]);}
        }
    }
    public static void main(String[] args)throws Exception{
        if(args.length!=2)throw new IllegalArgumentException("official-client-mappings.txt NEW-output-directory");
        Path output=Path.of(args[1]);if(Files.exists(output))throw new IllegalArgumentException("Choose a new output; preserve previous exports");
        mappings(Path.of(args[0]));call("net.minecraft.SharedConstants","tryDetectVersion()",null);
        try(var source=type("net.minecraft.SharedConstants").getResourceAsStream("/version.json")){
            if(source==null||!"1.21.1".equals(new Gson().fromJson(new String(source.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8),Map.class).get("id")))throw new IllegalArgumentException("Requires original vanilla 1.21.1 client");
        }
        call("net.minecraft.server.Bootstrap","bootStrap()",null);
        Object effectsRegistry=registry("MOB_EFFECT"),potionsRegistry=registry("POTION"),itemsRegistry=registry("ITEM");
        List<Map<String,Object>> effects=new ArrayList<>(),potions=new ArrayList<>(),items=new ArrayList<>();
        for(Object effect:(Iterable<?>)effectsRegistry){Map<String,Object> value=row(effectsRegistry,effect);value.put("color",call("net.minecraft.world.effect.MobEffect","getColor()",effect));effects.add(value);}
        String instance="net.minecraft.world.effect.MobEffectInstance",contents="net.minecraft.world.item.alchemy.PotionContents";
        for(Object potion:(Iterable<?>)potionsRegistry){
            List<Map<String,Object>> instances=new ArrayList<>();
            for(Object effect:(List<?>)call("net.minecraft.world.item.alchemy.Potion","getEffects()",potion)){
                Object holder=call(instance,"getEffect()",effect),value=call("net.minecraft.core.Holder","value()",holder);
                Map<String,Object> item=new LinkedHashMap<>();item.put("id",key(effectsRegistry,value));
                item.put("amplifier",call(instance,"getAmplifier()",effect));item.put("duration",call(instance,"getDuration()",effect));
                item.put("showParticles",call(instance,"isVisible()",effect));instances.add(item);
            }
            Object holder=call(REG,"wrapAsHolder(java.lang.Object)",potionsRegistry,potion);
            Object state=type(contents).getConstructor(type("net.minecraft.core.Holder")).newInstance(holder);
            Map<String,Object> value=row(potionsRegistry,potion);value.put("effects",instances);value.put("color",call(contents,"getColor()",state));potions.add(value);
        }
        // Full positive item-registration census. A class name alone is not
        // evidence that an item has no color, model-property or special pass.
        Map<String,String> originalClasses=new HashMap<>();classes.forEach((name,obfuscated)->originalClasses.put(obfuscated,name));
        for(Object item:(Iterable<?>)itemsRegistry){Map<String,Object> value=row(itemsRegistry,item);value.put("itemClass",originalClasses.get(item.getClass().getName()));items.add(value);}
        Object empty=type(contents).getConstructor(Optional.class,Optional.class,List.class).newInstance(Optional.empty(),Optional.empty(),List.of());
        Map<String,Object> data=new LinkedHashMap<>();data.put("schemaVersion",1);data.put("minecraftVersion","1.21.1");
        data.put("source","original_BuiltInRegistries_and_PotionContents_getColor");data.put("effects",effects);data.put("potions",potions);data.put("items",items);
        data.put("emptyPotionColor",call(contents,"getColor()",empty));
        Files.createDirectories(output);Files.writeString(output.resolve("client-item-colors.json"),new Gson().toJson(data)+"\n",java.nio.charset.StandardCharsets.UTF_8);
        System.out.println("Original effects="+effects.size()+" potions="+potions.size()+" items="+items.size());
    }
}
