import java.lang.reflect.*;
import java.nio.file.*;

/** Read native SoundType facts from a verified 1.20.6 client, without joining a world.
 * The mapped member names below are specific to that version. No game code or
 * launcher assets are redistributed with this source. */
class ExportMinecraftBlockSounds {
  static String quote(Object value) {
    return "\"" + value.toString().replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
  }
  public static void main(String[] args) throws Exception {
    Class.forName("aa").getMethod("a").invoke(null); // SharedConstants.tryDetectVersion
    Class.forName("alh").getMethod("a").invoke(null); // Bootstrap.bootStrap
    Object blocks = Class.forName("lp").getField("e").get(null); // BuiltInRegistries.BLOCK
    Method key = Class.forName("jv").getMethod("b", Object.class); // Registry.getKey
    Method state = Class.forName("dfb").getMethod("o"); // Block.defaultBlockState
    Method sound = Class.forName("dsd$a").getMethod("w"); // BlockStateBase.getSoundType
    Class<?> sounds = Class.forName("dmo"); // SoundType
    Method location = Class.forName("avz").getMethod("a"); // SoundEvent.getLocation
    StringBuilder result = new StringBuilder("{\"schemaVersion\":1,\"minecraftVersion\":\"1.20.6\",\"blocks\":{");
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
  }
}
