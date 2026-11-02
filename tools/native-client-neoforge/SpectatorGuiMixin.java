package org.mcvisual.neoforge.mixin;
import net.minecraft.client.*;import net.minecraft.client.gui.*;import net.minecraft.client.multiplayer.MultiPlayerGameMode;import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.NonNullList;import net.minecraft.world.entity.player.*;import net.minecraft.world.food.FoodData;import net.minecraft.world.item.ItemStack;
import org.mcvisual.neoforge.NativeSpectatorSync;import org.spongepowered.asm.mixin.*;import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.*;
@Mixin(Gui.class)
public abstract class SpectatorGuiMixin {
 @Shadow @Final private Minecraft minecraft;
 @Shadow private void renderItemHotbar(GuiGraphics draw,DeltaTracker delta){throw new AssertionError();}
 @Inject(method="renderHotbar",at=@At("HEAD"),cancellable=true,require=1)
 private void hotbar(GuiGraphics draw,DeltaTracker delta,CallbackInfo ci){if(NativeSpectatorSync.hotbarReady()&&!minecraft.gui.getSpectatorGui().isMenuActive()){renderItemHotbar(draw,delta);ci.cancel();}}
 // NeoForge 21.1.252 splits vanilla status into named GUI layers and two constructor lambdas.
 @Redirect(method={"maybeRenderPlayerHealth","lambda$new$3","lambda$new$4"},at=@At(value="INVOKE",target="Lnet/minecraft/client/multiplayer/MultiPlayerGameMode;canHurtPlayer()Z"),require=3)
 private boolean status(MultiPlayerGameMode mode){return NativeSpectatorSync.target()!=null||mode.canHurtPlayer();}
 @Inject(method="isExperienceBarVisible",at=@At("HEAD"),cancellable=true,require=1)
 private void xp(CallbackInfoReturnable<Boolean> ci){if(NativeSpectatorSync.scope()!=null)ci.setReturnValue(NativeSpectatorSync.experience()!=null);}
 @Inject(method="renderFood",at=@At("HEAD"),cancellable=true,require=1)
 private void foodKnown(GuiGraphics draw,Player player,int y,int x,CallbackInfo ci){if(NativeSpectatorSync.scope()!=null&&NativeSpectatorSync.food()==null)ci.cancel();}
 @Redirect(method="renderFood",at=@At(value="INVOKE",target="Lnet/minecraft/world/entity/player/Player;getFoodData()Lnet/minecraft/world/food/FoodData;"),require=1)
 private FoodData food(Player player){var value=NativeSpectatorSync.foodData();return value==null?player.getFoodData():value;}
 @Redirect(method="renderItemHotbar",at=@At(value="FIELD",target="Lnet/minecraft/world/entity/player/Inventory;selected:I"),require=1)
 private int selected(Inventory inventory){var slot=NativeSpectatorSync.selected();return slot==null?inventory.selected:slot;}
 @Redirect(method="renderItemHotbar",at=@At(value="INVOKE",target="Lnet/minecraft/core/NonNullList;get(I)Ljava/lang/Object;",ordinal=0),require=1)
 private Object items(NonNullList<?> items,int index){return NativeSpectatorSync.hotbarReady()?NativeSpectatorSync.hotbar(index):items.get(index);}
 @Redirect(method="renderExperienceBar",at=@At(value="INVOKE",target="Lnet/minecraft/client/player/LocalPlayer;getXpNeededForNextLevel()I"),require=1)
 private int xpNeeded(LocalPlayer player){var value=NativeSpectatorSync.experience();return value==null?player.getXpNeededForNextLevel():value.needed();}
 @Redirect(method="renderExperienceBar",at=@At(value="FIELD",target="Lnet/minecraft/client/player/LocalPlayer;experienceProgress:F"),require=1)
 private float xpProgress(LocalPlayer player){var value=NativeSpectatorSync.experience();return value==null?player.experienceProgress:value.progress();}
 @Redirect(method="renderExperienceLevel",at=@At(value="FIELD",target="Lnet/minecraft/client/player/LocalPlayer;experienceLevel:I"),require=1)
 private int xpLevel(LocalPlayer player){var value=NativeSpectatorSync.experience();return value==null?player.experienceLevel:value.level();}
}
