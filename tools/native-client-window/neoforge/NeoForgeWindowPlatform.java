package org.mcvisual.window.neoforge;
import java.nio.file.Path;
import net.minecraft.client.Minecraft;
import net.minecraft.client.MouseHandler;
import net.minecraft.client.renderer.GameRenderer;
import com.mojang.blaze3d.platform.Window;
import org.mcvisual.window.WindowPlatform;
public final class NeoForgeWindowPlatform implements WindowPlatform {
 public Path gameDirectory(){return Minecraft.getInstance().gameDirectory.toPath();}
 public String loader(){return "neoforge";}
 public Snapshot snapshot(){
  var mc=Minecraft.getInstance();if(mc==null||mc.getWindow()==null)return null;
  var window=mc.getWindow();var target=mc.getMainRenderTarget();
  return new Snapshot(window.getWindow(),window.isFullscreen(),mc.mouseHandler.isMouseGrabbed(),mc.level!=null,mc.getConnection()!=null,
   target.width,target.height,mc.getFps(),mc.options.framerateLimit().get(),window.getFramerateLimit());
 }
 public void disablePauseOnLostFocus(){Minecraft.getInstance().options.pauseOnLostFocus=false;}
 public void frameLimit(int cap){Minecraft.getInstance().getWindow().setFramerateLimit(cap);}
 public Class<?>[] hookTargets(){return new Class<?>[]{MouseHandler.class,Window.class,GameRenderer.class};}
}
