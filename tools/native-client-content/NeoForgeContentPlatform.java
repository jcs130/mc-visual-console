package org.mcvisual.content;
import java.nio.file.Path;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.entity.player.Player;

/** Original Mojmap Minecraft bindings; no core companion or server API. */
public final class NeoForgeContentPlatform implements ContentPlatform {
 public Path gameDirectory(){return Minecraft.getInstance().gameDirectory.toPath();}
 public boolean hidden(){var mc=Minecraft.getInstance();return mc.screen!=null||mc.options.hideGui;}
 public Scene scene(){
  var mc=Minecraft.getInstance();var e=mc.getCameraEntity();var c=mc.getConnection();
  if(mc.level==null||mc.player==null||c==null||e==null)return null;
  return new Scene(mc.level,c,e,mc.getCurrentServer()==null?"singleplayer":mc.getCurrentServer().ip,
   mc.player.getUUID().toString(),e.getUUID().toString(),e.getId(),mc.level.dimension().location().toString(),
   e instanceof Player p?p.getGameProfile().getName():e.getName().getString());
 }
 public Canvas canvas(GuiGraphics draw){return new Canvas(){
  public int width(){return draw.guiWidth();}public int height(){return draw.guiHeight();}
  public String fit(String text,int width){return Minecraft.getInstance().font.plainSubstrByWidth(text,width);}
  public void fill(int l,int t,int r,int b,int color){draw.fill(l,t,r,b,color);}
  public void text(String text,int x,int y,int color){draw.drawString(Minecraft.getInstance().font,text,x,y,color,false);}
 };}
}
