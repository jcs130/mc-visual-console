package org.mcvisual.neoforge;
import java.nio.file.*;import java.time.Instant;import java.util.*;
import com.google.gson.GsonBuilder;import net.minecraft.client.Minecraft;import net.neoforged.fml.ModList;
import net.neoforged.fml.loading.FMLPaths;import org.agentmc.platform.ClientRuntime.ClientLifecycleEvents;
/** Explicit offline diagnostic: force actual transformed classes, not just javac signatures. */
public final class OfflineContractCheck {
 public static void install(){if(Boolean.getBoolean("mcvisual.offlineContractCheck"))ClientLifecycleEvents.CLIENT_STARTED.register(OfflineContractCheck::run);}
 private static void run(Minecraft mc){
  var data=new LinkedHashMap<String,Object>();data.put("schema","mcvisual.neoforge-offline-contract/v1");data.put("at",Instant.now().toString());
  var checks=new ArrayList<String>();boolean success=false;
  try{
   if(mc.level!=null||mc.player!=null||mc.getConnection()!=null)throw new IllegalStateException("Offline diagnostic requires a disconnected title screen");
   var loader=OfflineContractCheck.class.getClassLoader();
   for(String name:List.of("net.minecraft.client.gui.Gui","net.minecraft.client.KeyboardHandler","net.minecraft.client.multiplayer.ClientPacketListener","net.minecraft.world.inventory.Slot","net.minecraft.client.gui.screens.inventory.AbstractContainerScreen","net.minecraft.client.multiplayer.MultiPlayerGameMode","net.minecraft.client.Camera","net.minecraft.client.renderer.GameRenderer","net.minecraft.client.renderer.entity.EntityRenderDispatcher","com.elfmcys.yesstevemodel.Oo0OOO00o00oOOo0O0o000O0")){
    Class.forName(name,false,loader);checks.add(name);
   }
   Class.forName("net.minecraft.client.renderer.ItemInHandRenderer",false,loader);checks.add("net.minecraft.client.renderer.ItemInHandRenderer");
   Class.forName("net.minecraft.client.MouseHandler",false,loader);checks.add("net.minecraft.client.MouseHandler");
   Class.forName("com.mojang.blaze3d.platform.Window",false,loader);checks.add("com.mojang.blaze3d.platform.Window");
   if(Boolean.getBoolean("mcvisual.offlineWindowCheck")){
    if(!NativeWindowRuntime.enabled()||!NativeWindowRuntime.freeCursor())throw new IllegalStateException("Explicit free-cursor offline policy required before grab probe");
    long attempts=NativeWindowRuntime.suppressedGrabRequests(),window=mc.getWindow().getWindow();
    int beforeMode=org.lwjgl.glfw.GLFW.glfwGetInputMode(window,org.lwjgl.glfw.GLFW.GLFW_CURSOR);
    mc.mouseHandler.grabMouse();
    int afterMode=org.lwjgl.glfw.GLFW.glfwGetInputMode(window,org.lwjgl.glfw.GLFW.GLFW_CURSOR);
    if(mc.mouseHandler.isMouseGrabbed()||NativeWindowRuntime.suppressedGrabRequests()!=attempts+1||beforeMode!=afterMode||afterMode!=org.lwjgl.glfw.GLFW.GLFW_CURSOR_NORMAL)
     throw new IllegalStateException("Actual transformed MouseHandler captured the cursor");
    data.put("mouseGrabProbe",Map.of("suppressed",true,"cursorModeBefore",beforeMode,"cursorModeAfter",afterMode));
   }
   if(ModList.get().isLoaded("iris")){Class.forName("net.irisshaders.iris.pathways.HandRenderer",false,loader);checks.add("net.irisshaders.iris.pathways.HandRenderer");}
   Class.forName("cpw.mods.bootstraplauncher.BootstrapLauncher",false,loader);
   try{Class.forName("net.fabricmc.loader.impl.launch.knot.KnotClient",false,loader);throw new IllegalStateException("Fabric Loader found in normal NeoForge client");}catch(ClassNotFoundException expected){}
   var versions=new LinkedHashMap<String,String>();for(var mod:ModList.get().getMods())versions.put(mod.getModId(),mod.getVersion().toString());
   if(!versions.containsKey("neoforge")||!versions.containsKey("touhou_little_maid")||!versions.containsKey("yes_steve_model"))throw new IllegalStateException("Required original NeoForge mods unavailable");
   data.put("mods",versions);data.put("minecraftClass",Minecraft.class.getName());data.put("loaderClass",loader.getClass().getName());
   data.put("renderer",org.lwjgl.opengl.GL11.glGetString(org.lwjgl.opengl.GL11.GL_RENDERER));data.put("fabricLoader",false);success=true;
  }catch(Throwable error){data.put("errorType",error.getClass().getName());data.put("error",String.valueOf(error.getMessage()));}
  data.put("classesTransformed",checks);data.put("passed",success);
  data.put("gameConnection",mc.getConnection()!=null);data.put("worldPresent",mc.level!=null);data.put("playerPresent",mc.player!=null);
  data.put("scope","single-client-started-observation");data.put("modelCalls",0);
  try{var out=FMLPaths.GAMEDIR.get().resolve("diagnostics/neoforge-offline-contract.json");Files.createDirectories(out.getParent());Files.writeString(out,new GsonBuilder().setPrettyPrinting().create().toJson(data));}
  catch(Exception error){throw new IllegalStateException("Cannot save offline contract check",error);}
  System.out.println("[MCVisualNeoForge] Explicit offline class check: "+success+" ("+checks.size()+" transformed targets)");
 }
}
