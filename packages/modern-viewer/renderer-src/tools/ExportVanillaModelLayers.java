/* Offline original CPU model bake. No Minecraft instance, texture atlas,
 * renderer, world, account, window, GPU setup or game connection is created. */
import java.nio.file.*;
import java.lang.reflect.*;
import java.util.*;
import com.google.gson.Gson;

public class ExportVanillaModelLayers {
    static final Map<String,String> classes=new HashMap<>(),members=new HashMap<>();
    static Class<?> type(String name)throws Exception{return Class.forName(classes.getOrDefault(name,name));}
    static Object field(Object instance,String name)throws Exception{
        Field f=instance.getClass().getDeclaredField(name);f.setAccessible(true);return f.get(instance);
    }
    static Object staticField(String owner,String name)throws Exception{
        Field f=type(owner).getDeclaredField(members.get(owner+"."+name));f.setAccessible(true);return f.get(null);
    }
    static Object invoke(String owner,String signature,Object instance)throws Exception{
        Method method=type(owner).getDeclaredMethod(members.get(owner+"."+signature));method.setAccessible(true);return method.invoke(instance);
    }
    static List<Object> vector(Object value)throws Exception{
        List<Object> result=new ArrayList<>();
        for(String axis:List.of("x","y","z"))result.add(value.getClass().getMethod(axis).invoke(value));
        return result;
    }
    static List<Object> fields(Object value,String... names)throws Exception{
        List<Object> result=new ArrayList<>();for(String name:names)result.add(field(value,name));return result;
    }
    static int cubes=0,quads=0;
    static void part(Object model,String name,String key,String parent,List<Map<String,Object>> parts)throws Exception{
        Map<String,Object> row=new LinkedHashMap<>();row.put("path",key);row.put("name",name);
        if(parent!=null)row.put("parent",parent);
        row.put("pivot",fields(model,"b","c","d"));row.put("rotationZYX",fields(model,"e","f","g"));
        row.put("scale",fields(model,"h","i","j"));row.put("visible",field(model,"k"));row.put("skipDraw",field(model,"l"));
        List<Map<String,Object>> polygons=new ArrayList<>();
        for(Object cube:(List<?>)field(model,"m")){
            cubes++;
            for(Object polygon:(Object[])field(cube,"g")){
                if(polygon==null)continue;
                List<Object> positions=new ArrayList<>(),uv=new ArrayList<>();
                for(Object vertex:(Object[])field(polygon,"a")){
                    positions.addAll(vector(field(vertex,"a")));uv.add(field(vertex,"b"));uv.add(field(vertex,"c"));
                }
                Map<String,Object> face=new LinkedHashMap<>();face.put("positions",positions);face.put("uv",uv);
                face.put("normal",vector(field(polygon,"b")));polygons.add(face);quads++;
            }
        }
        row.put("polygons",polygons);parts.add(row);
        // Preserve original named-child iteration order, as well as polygon and
        // vertex order. Cube.min/max omit the original dilation and mirroring.
        for(var child:((Map<String,?>)field(model,"n")).entrySet())part(child.getValue(),child.getKey(),key+"/"+child.getKey(),key,parts);
    }
    static List<Map<String,Object>> registry(String name)throws Exception{
        String built="net.minecraft.core.registries.BuiltInRegistries",reg="net.minecraft.core.Registry";
        Object registry=type(built).getField(members.get(built+"."+name)).get(null);
        Method key=type(reg).getMethod(members.get(reg+".getKey(java.lang.Object)"),Object.class);
        Method id=type(reg).getMethod(members.get(reg+".getId(java.lang.Object)"),Object.class);
        List<Map<String,Object>> values=new ArrayList<>();
        for(Object entry:(Iterable<?>)registry){Map<String,Object> row=new LinkedHashMap<>();row.put("name",key.invoke(registry,entry).toString());row.put("id",id.invoke(registry,entry));values.add(row);}
        return values;
    }
    static List<Map<String,Object>> blockEntityRenderers()throws Exception{
        String built="net.minecraft.core.registries.BuiltInRegistries",reg="net.minecraft.core.Registry";
        Object registry=staticField(built,"BLOCK_ENTITY_TYPE"),blocks=staticField(built,"BLOCK");
        Map<?,?> providers=(Map<?,?>)staticField("net.minecraft.client.renderer.blockentity.BlockEntityRenderers","PROVIDERS");
        Method key=type(reg).getMethod(members.get(reg+".getKey(java.lang.Object)"),Object.class);
        List<Map<String,Object>> result=new ArrayList<>();
        for(Object entry:(Iterable<?>)registry){
            List<String> names=new ArrayList<>();
            for(Object block:(Set<?>)field(entry,members.get("net.minecraft.world.level.block.entity.BlockEntityType.validBlocks")))names.add(key.invoke(blocks,block).toString());
            Collections.sort(names);
            Map<String,Object> row=new LinkedHashMap<>();row.put("type",key.invoke(registry,entry).toString());row.put("blocks",names);row.put("hasRenderer",providers.containsKey(entry));result.add(row);
        }
        if(result.size()!=44||result.stream().filter(row->Boolean.TRUE.equals(row.get("hasRenderer"))).count()!=24)throw new IllegalStateException("Incomplete original block-entity renderer registrations");
        return result;
    }
    public static void main(String[] args)throws Exception{
        if(args.length!=2)throw new IllegalArgumentException("official-client-mappings.txt NEW-output-directory");
        Path output=Path.of(args[1]);if(Files.exists(output))throw new IllegalArgumentException("Choose a new output; preserve previous exports");
        String owner=null;
        for(String line:Files.readAllLines(Path.of(args[0]))){
            if(line.startsWith("#")||!line.contains(" -> "))continue;
            String[] pair=line.trim().split(" -> ");
            if(!line.startsWith(" ")){owner=pair[0];classes.put(owner,pair[1].replace(":",""));}
            else{String declaration=pair[0].replaceFirst("^(\\d+:\\d+:)+","");String member=declaration.substring(declaration.indexOf(' ')+1).replaceFirst(":\\d+:\\d+$","");members.put(owner+"."+member,pair[1]);}
        }
        invoke("net.minecraft.SharedConstants","tryDetectVersion()",null);
        try(var source=type("net.minecraft.SharedConstants").getResourceAsStream("/version.json")){
            if(source==null||!"1.21.1".equals(new Gson().fromJson(new String(source.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8),Map.class).get("id")))throw new IllegalArgumentException("Requires original vanilla 1.21.1 client");
        }
        invoke("net.minecraft.server.Bootstrap","bootStrap()",null);
        Map<?,?> roots=(Map<?,?>)invoke("net.minecraft.client.model.geom.LayerDefinitions","createRoots()",null);
        if(roots.size()!=213)throw new IllegalStateException("Expected every original model layer, including all boat and wood keys: "+roots.size());
        Map<String,Object> layers=new TreeMap<>();
        for(var entry:roots.entrySet()){
            String name=invoke("net.minecraft.client.model.geom.ModelLayerLocation","getModel()",entry.getKey())+"#"+invoke("net.minecraft.client.model.geom.ModelLayerLocation","getLayer()",entry.getKey());
            Object layer=entry.getValue(),material=field(layer,"b"),model=invoke("net.minecraft.client.model.geom.builders.LayerDefinition","bakeRoot()",layer);
            List<Map<String,Object>> parts=new ArrayList<>();part(model,"root","root",null,parts);
            Map<String,Object> value=new LinkedHashMap<>();value.put("textureSize",fields(material,"a","b"));value.put("parts",parts);
            if(layers.put(name,value)!=null)throw new IllegalStateException("Duplicate layer "+name);
        }
        Map<String,Object> data=new LinkedHashMap<>();data.put("schemaVersion",1);data.put("minecraftVersion","1.21.1");
        data.put("source","original_LayerDefinitions_createRoots_and_LayerDefinition_bakeRoot");data.put("modelUnits","original_Y_down_pixels");data.put("uvOrigin","original_top_left");data.put("rotationOrder","ZYX");
        data.put("layers",layers);data.put("counts",Map.of("layers",layers.size(),"cubes",cubes,"quads",quads));
        data.put("registries",Map.of("entities",registry("ENTITY_TYPE"),"particles",registry("PARTICLE_TYPE"),"blockEntities",registry("BLOCK_ENTITY_TYPE"),"menus",registry("MENU")));
        data.put("blockEntityRenderers",blockEntityRenderers());
        Files.createDirectories(output);Files.writeString(output.resolve("client-model-layers.json"),new Gson().toJson(data)+"\n",java.nio.charset.StandardCharsets.UTF_8);
        System.out.println("Original model layers="+layers.size()+" cubes="+cubes+" quads="+quads);
    }
}
