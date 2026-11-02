package org.mcvisual.neoforge;
import java.util.Objects;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import org.mcvisual.observer.NativeObserverClient;

/** Original native ItemStack rendering, with no Slot, click, drag, drop or recipe operation. */
public final class ReadOnlyInventoryScreen extends Screen {
 private final Object scope;private final int window;String status;
 ReadOnlyInventoryScreen(Object scope,int window,String status){super(Component.literal("观战背包 · 只读"));this.scope=scope;this.window=window;this.status=status;}
 void checkScope(){if(!Objects.equals(scope,NativeSpectatorSync.scope()))Minecraft.getInstance().setScreen(null);}
 @Override public boolean isPauseScreen(){return false;}
 @Override public void removed(){NativeSpectatorSync.close(scope,window);}
 @Override public boolean keyPressed(int key,int scan,int mods){if(Minecraft.getInstance().options.keyInventory.matches(key,scan)){onClose();return true;}return super.keyPressed(key,scan,mods);}
 @Override public void render(GuiGraphics draw,int mx,int my,float delta){
  checkScope();if(!Objects.equals(scope,NativeSpectatorSync.scope()))return;
  renderBackground(draw,mx,my,delta);int x=(width-212)/2,y=(height-156)/2;
  draw.fill(x-1,y-1,x+213,y+157,0xff101820);draw.fill(x,y,x+212,y+156,0xffccd0d4);
  var mc=Minecraft.getInstance();var actor=mc.getCameraEntity();String label=actor==null?title.getString():actor.getName().getString()+" · 背包只读";
  draw.drawString(font,font.plainSubstrByWidth(label,196),x+8,y+7,0xff20252b,false);
  var view=NativeSpectatorSync.inventory();String sync=view==null?"等待真实库存同步":view.full()?"36 格增量同步":"快捷栏已同步，其余等待回执";
  draw.drawString(font,sync,x+8,y+21,0xff405061,false);
  net.minecraft.world.item.ItemStack hovered=null;
  for(int row=0;row<4;row++)for(int col=0;col<9;col++){
   int index=row==3?col:9+row*9+col,px=x+17+col*20,py=y+39+row*20+(row==3?5:0);
   draw.fill(px-1,py-1,px+18,py+18,0xff68717a);draw.fill(px,py,px+17,py+17,0xff9fa7af);
   if(!NativeSpectatorSync.knownItem(index)){draw.drawString(font,"?",px+5,py+4,0xff414b55,false);continue;}
   var stack=NativeSpectatorSync.menuItem(index);draw.renderItem(stack,px,py);draw.renderItemDecorations(font,stack,px,py);
   if(mx>=px&&mx<px+18&&my>=py&&my<py+18&&!stack.isEmpty())hovered=stack;
  }
  draw.drawString(font,font.plainSubstrByWidth(status,196),x+8,y+133,0xff405061,false);
  draw.drawString(font,"E / Esc 关闭",x+8,y+145,0xff405061,false);
  if(!NativeSpectatorSync.cursor().isEmpty()){draw.renderItem(NativeSpectatorSync.cursor(),x+187,y+5);draw.renderItemDecorations(font,NativeSpectatorSync.cursor(),x+187,y+5);}
  if(hovered!=null)draw.renderTooltip(font,hovered,mx,my);
 }
}
