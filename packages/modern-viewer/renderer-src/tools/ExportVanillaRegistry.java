/* Offline registry export from the matching Mojang server and official mappings.
 * No server socket, game world, account or client is started. Run on Java 21.
 */
import java.nio.file.*;
import java.lang.reflect.*;
import java.util.*;
import com.google.gson.Gson;

public class ExportVanillaRegistry {
    static final Map<String, String> classes = new HashMap<>();
    static final Map<String, String> members = new HashMap<>();
    static final String BASE = "net.minecraft.world.level.block.state.BlockBehaviour$BlockStateBase";
    static final String BLOCK = "net.minecraft.world.level.block.Block";
    static final String REG = "net.minecraft.core.Registry";
    static final String BUILT = "net.minecraft.core.registries.BuiltInRegistries";
    static final String FLUID = "net.minecraft.world.level.material.FluidState";
    static Class<?> type(String name) throws Exception { return Class.forName(classes.getOrDefault(name, name)); }
    static Object field(String owner, String name, Object instance) throws Exception {
        return type(owner).getField(members.get(owner + "." + name)).get(instance);
    }
    static Object call(String owner, String signature, Object instance, Object... args) throws Exception {
        String parameterText = signature.substring(signature.indexOf('(') + 1, signature.length() - 1);
        String[] names = parameterText.isEmpty() ? new String[0] : parameterText.split(",");
        Class<?>[] parameters = new Class<?>[names.length];
        for (int i = 0; i < names.length; i++) parameters[i] = type(names[i]);
        return type(owner).getMethod(members.get(owner + "." + signature), parameters).invoke(instance, args);
    }
    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("official-server-mappings.txt new-output-directory");
        String owner = null;
        for (String line : Files.readAllLines(Path.of(args[0]))) {
            if (line.startsWith("#") || !line.contains(" -> ")) continue;
            String[] pair = line.trim().split(" -> ");
            if (!line.startsWith(" ")) {
                owner = pair[0]; classes.put(owner, pair[1].replace(":", ""));
            } else {
                String declaration = pair[0].replaceFirst("^(\\d+:\\d+:)+", "");
                String member = declaration.substring(declaration.indexOf(' ') + 1).replaceFirst(":\\d+:\\d+$", "");
                members.put(owner + "." + member, pair[1]);
            }
        }
        Path out = Path.of(args[1]);
        if (Files.exists(out)) throw new IllegalArgumentException("Preserve previous exports; choose a new output directory");
        call("net.minecraft.SharedConstants", "tryDetectVersion()", null);
        try (var version = type("net.minecraft.SharedConstants").getResourceAsStream("/version.json")) {
            if (version == null || !"1.21.1".equals(new Gson().fromJson(new String(version.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8), Map.class).get("id")))
                throw new IllegalArgumentException("This exporter requires the matching vanilla 1.21.1 server");
        }
        call("net.minecraft.server.Bootstrap", "bootStrap()", null);
        Object blocks = field(BUILT, "BLOCK", null), fluids = field(BUILT, "FLUID", null);
        Object empty = field("net.minecraft.world.level.EmptyBlockGetter", "INSTANCE", null);
        Object zero = field("net.minecraft.core.BlockPos", "ZERO", null);
        Gson gson = new Gson();
        List<String> blockRows = new ArrayList<>(), stateRows = new ArrayList<>(), entityRows = new ArrayList<>();
        for (Object block : (Iterable<?>) blocks) {
            String name = call(REG, "getKey(java.lang.Object)", blocks, block).toString();
            int blockId = (int) call(REG, "getId(java.lang.Object)", blocks, block);
            Object definition = call(BLOCK, "getStateDefinition()", block);
            List<?> states = (List<?>) call("net.minecraft.world.level.block.state.StateDefinition", "getPossibleStates()", definition);
            int first = Integer.MAX_VALUE;
            for (Object state : states) {
                int id = (int) call(BLOCK, "getId(net.minecraft.world.level.block.state.BlockState)", null, state);
                first = Math.min(first, id);
                Map<String, Object> row = new LinkedHashMap<>(), properties = new TreeMap<>();
                Map<?, ?> values = (Map<?, ?>) call("net.minecraft.world.level.block.state.StateHolder", "getValues()", state);
                for (var value : values.entrySet()) {
                    String key = (String) call("net.minecraft.world.level.block.state.properties.Property", "getName()", value.getKey());
                    properties.put(key, call("net.minecraft.world.level.block.state.properties.Property", "getName(java.lang.Comparable)", value.getKey(), value.getValue()));
                }
                row.put("stateId", id); row.put("name", name); row.put("properties", properties);
                row.put("renderShape", ((Enum<?>) call(BASE, "getRenderShape()", state)).name());
                row.put("hasBlockEntity", call(BASE, "hasBlockEntity()", state));
                row.put("canOcclude", call(BASE, "canOcclude()", state));
                row.put("solid", call(BASE, "isSolid()", state));
                row.put("blocksMotion", call(BASE, "blocksMotion()", state));
                boolean dynamic = (boolean) call(BLOCK, "hasDynamicShape()", block);
                row.put("dynamicShape", dynamic);
                if (!dynamic) {
                    Object shape = call(BASE, "getOcclusionShape(net.minecraft.world.level.BlockGetter,net.minecraft.core.BlockPos)", state, empty, zero);
                    List<?> boxes = (List<?>) call("net.minecraft.world.phys.shapes.VoxelShape", "toAabbs()", shape);
                    List<List<Object>> bounds = new ArrayList<>();
                    for (Object box : boxes) {
                        List<Object> b = new ArrayList<>();
                        for (String axis : List.of("minX", "minY", "minZ", "maxX", "maxY", "maxZ")) b.add(field("net.minecraft.world.phys.AABB", axis, box));
                        bounds.add(b);
                    }
                    row.put("occlusionBoxes", bounds);
                }
                Object fluid = call(BASE, "getFluidState()", state);
                Object fluidType = call(FLUID, "getType()", fluid);
                row.put("fluid", new TreeMap<>(Map.of("name", call(REG, "getKey(java.lang.Object)", fluids, fluidType).toString(),
                    "empty", call(FLUID, "isEmpty()", fluid), "source", call(FLUID, "isSource()", fluid),
                    "height", call(FLUID, "getOwnHeight()", fluid), "amount", call(FLUID, "getAmount()", fluid))));
                stateRows.add(gson.toJson(row));
            }
            blockRows.add(name + "\t" + blockId + "\t" + first + "\t" + states.size());
        }
        Object entities = field(BUILT, "ENTITY_TYPE", null);
        for (Object entity : (Iterable<?>) entities) entityRows.add(call(REG, "getKey(java.lang.Object)", entities, entity) + "\t" + call(REG, "getId(java.lang.Object)", entities, entity));
        Files.createDirectories(out);
        Files.writeString(out.resolve("blocks.tsv"), String.join("\n", blockRows) + "\n", java.nio.charset.StandardCharsets.UTF_8);
        Files.writeString(out.resolve("block-states.jsonl"), String.join("\n", stateRows) + "\n", java.nio.charset.StandardCharsets.UTF_8);
        Files.writeString(out.resolve("entities.tsv"), String.join("\n", entityRows) + "\n", java.nio.charset.StandardCharsets.UTF_8);
        System.out.println("Exported blocks=" + blockRows.size() + " states=" + stateRows.size() + " entities=" + entityRows.size());
    }
}
