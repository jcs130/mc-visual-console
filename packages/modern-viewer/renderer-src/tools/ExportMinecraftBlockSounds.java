import java.lang.reflect.*;
import java.nio.file.*;

/** Read native SoundType and sound registry facts from a verified client, without joining a world.
 * The mapped member names below are specific to that version. No game code or
 * launcher assets are redistributed with this source. */
class ExportMinecraftBlockSounds {
  static String quote(Object value) {
    return "\"" + value.toString().replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
  }
  public static void main(String[] args) throws Exception {
    String version = args.length > 2 ? args[2] : "1.20.6";
    String[] names = switch(version) {
      case "1.20.6" -> new String[]{"aa","alh","lp","jv","dfb","dsd$a","dmo","avz"};
      case "1.21.1" -> new String[]{"ab","akt","lt","jz","dfy","dtb$a","dnm","avo"};
      default -> throw new IllegalArgumentException("Unverified original reflection layout");
    };
    Class.forName(names[0]).getMethod("a").invoke(null); // SharedConstants.tryDetectVersion
    Class.forName(names[1]).getMethod("a").invoke(null); // Bootstrap.bootStrap
    Object blocks = Class.forName(names[2]).getField("e").get(null); // BuiltInRegistries.BLOCK
    Method key = Class.forName(names[3]).getMethod("b", Object.class); // Registry.getKey
    Method state = Class.forName(names[4]).getMethod("o"); // Block.defaultBlockState
    Method sound = Class.forName(names[5]).getMethod("w"); // BlockStateBase.getSoundType
    Class<?> sounds = Class.forName(names[6]); // SoundType
    Method location = Class.forName(names[7]).getMethod("a"); // SoundEvent.getLocation
    StringBuilder result = new StringBuilder("{\"schemaVersion\":1,\"minecraftVersion\":"+quote(version)+",\"blocks\":{");
    int count = 0;
    String[] fields = {"break", "step", "place", "hit", "fall"};
    String[] methods = {"c", "d", "e", "f", "g"};
    for (Object block : (Iterable<?>)blocks) {
      if (count++ > 0) result.append(',');
      Object soundType = sound.invoke(state.invoke(block));
      result.append(quote(key.invoke(blocks,block))).append(":{\"volume\":")
        .append(sounds.getMethod("a").invoke(soundType)).append(",\"pitch\":")
        .append(sounds.getMethod("b").invoke(soundType));
      for(int i=0;i<fields.length;i++) result.append(',').append(quote(fields[i])).append(':')
        .append(quote(location.invoke(sounds.getMethod(methods[i]).invoke(soundType))));
      result.append('}');
    }
    result.append("}}\n");
    Files.writeString(Path.of(args[0]),result);
    System.err.println("Exported block sound types: " + count);
    Object registry = Class.forName(names[2]).getField("b").get(null); // BuiltInRegistries.SOUND_EVENT
    Method id = Class.forName(names[3]).getMethod("a", Object.class); // Registry.getId
    StringBuilder soundRegistry = new StringBuilder("{\"schemaVersion\":1,\"minecraftVersion\":"+quote(version)+",\"events\":{");
    int soundCount = 0;
    for (Object event : (Iterable<?>)registry) {
      if (soundCount++ > 0) soundRegistry.append(',');
      soundRegistry.append(quote(id.invoke(registry,event))).append(":{\"name\":")
        .append(quote(key.invoke(registry,event))).append('}');
    }
    soundRegistry.append("}}\n");
    Files.writeString(Path.of(args[1]),soundRegistry);
    System.err.println("Exported sound registry: " + soundCount);
  }
}
