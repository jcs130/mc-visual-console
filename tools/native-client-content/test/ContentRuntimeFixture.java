import com.google.gson.Gson;
import java.nio.file.Path;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import org.mcvisual.content.*;

/** Offline packaged-consumer fixture: deliberately no Minecraft, loader or Agent classes. */
public final class ContentRuntimeFixture {
 static final Gson JSON=new Gson();
 static final String VIEWER="11111111-1111-1111-1111-111111111111",A="22222222-2222-2222-2222-222222222222",B="33333333-3333-3333-3333-333333333333";
 static final class Platform implements ContentPlatform {
  final Path directory;Object world=new Object(),connection=new Object(),camera=new Object();boolean connected=true,hidden;String subject=A;
  Platform(Path p){directory=p;}
  public Path gameDirectory(){return directory;}
  public boolean hidden(){return hidden;}
  public Scene scene(){return connected?new Scene(world,connection,camera,"offline-fixture",VIEWER,subject,7,"minecraft:overworld","Fixture"):null;}
 }
 static final class Canvas implements ContentPlatform.Canvas {
  int strings;
  public int width(){return 960;}public int height(){return 540;}
  public String fit(String text,int width){return text;}
  public void fill(int l,int t,int r,int b,int color){}
  public void text(String text,int x,int y,int color){strings++;}
 }
 public static void main(String[] args)throws Exception {
  try{Class.forName("net.minecraft.client.Minecraft");throw new AssertionError("Minecraft must not be a fixture runtime dependency");}catch(ClassNotFoundException expected){}
  try{Class.forName("net.minecraft.class_310");throw new AssertionError("Fabric Minecraft must not be a fixture runtime dependency");}catch(ClassNotFoundException expected){}
  var platform=new Platform(Path.of(args[0]));var canvas=new Canvas();var commands=new LinkedBlockingQueue<String>();
  var reader=new Thread(()->{try(var input=new BufferedReader(new InputStreamReader(System.in))){String line;while((line=input.readLine())!=null)commands.add(line);commands.add("quit");}catch(IOException ignored){commands.add("quit");}},"fixture-input");reader.setDaemon(true);reader.start();
  try(var runtime=new ContentRuntime(platform)){
   long last=0;boolean quit=false;while(!quit){
    String command;while((command=commands.poll())!=null)switch(command){
     case "target-b"->{platform.camera=new Object();platform.subject=B;runtime.render(canvas);}
     case "world"->platform.world=new Object();
     case "connection"->platform.connection=new Object();
     case "loading"->platform.connected=false;
     case "resume"->platform.connected=true;
     case "hidden"->platform.hidden=true;
     case "visible"->platform.hidden=false;
     case "stop"->runtime.close();
     case "quit"->quit=true;
     default->throw new AssertionError("Unknown fixture instruction");
    }
    runtime.tick();runtime.render(canvas);
    long now=System.currentTimeMillis();if(now-last>=40){last=now;var status=new LinkedHashMap<String,Object>(runtime.status());status.put("fixtureDrawCalls",canvas.strings);status.put("fixtureNoMinecraftDependency",true);System.out.println(JSON.toJson(status));System.out.flush();}
    Thread.sleep(10);
   }
  }
 }
}
