package org.mcvisual.neoforge.mixin;
import net.minecraft.client.gui.GuiGraphics;import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;import net.minecraft.world.inventory.*;
import org.mcvisual.neoforge.NativeSpectatorSync;import org.spongepowered.asm.mixin.*;import org.spongepowered.asm.mixin.injection.*;import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
@Mixin(AbstractContainerScreen.class)
public abstract class SpectatorMenuGuardMixin {
 @Shadow @Final protected AbstractContainerMenu menu;
 @Shadow protected int leftPos;@Shadow protected int topPos;
 @Inject(method="slotClicked",at=@At("HEAD"),cancellable=true,require=1)
 private void readOnly(Slot slot,int id,int button,ClickType type,CallbackInfo ci){if(NativeSpectatorSync.ownsAnyMenu())ci.cancel();}
 @Inject(method="removed",at=@At("HEAD"),require=1)
 private void closed(CallbackInfo ci){NativeSpectatorSync.menuClosed(this);}
 @Inject(method="render",at=@At("TAIL"),require=1)
 private void receipt(GuiGraphics draw,int mx,int my,float delta,CallbackInfo ci){
  if(!NativeSpectatorSync.ownsAnyMenu())return;var mc=net.minecraft.client.Minecraft.getInstance();
  draw.drawString(mc.font,"观战容器 · 只读",leftPos,Math.max(2,topPos-12),0xff9ee7ff,true);
  for(var slot:menu.slots)if(slot.container==mc.player.getInventory()&&!NativeSpectatorSync.knownItem(slot.getContainerSlot()))draw.drawString(mc.font,"?",leftPos+slot.x+5,topPos+slot.y+4,0xffd7dfe8,true);
 }
}
