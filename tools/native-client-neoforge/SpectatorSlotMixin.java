package org.mcvisual.neoforge.mixin;
import net.minecraft.client.Minecraft;import net.minecraft.world.inventory.Slot;import net.minecraft.world.item.ItemStack;
import org.mcvisual.neoforge.NativeSpectatorSync;import org.spongepowered.asm.mixin.*;
import org.spongepowered.asm.mixin.injection.*;import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
@Mixin(Slot.class)
public abstract class SpectatorSlotMixin {
 @Shadow @Final public net.minecraft.world.Container container;
 @Shadow public abstract int getContainerSlot();
 @Inject(method="getItem",at=@At("HEAD"),cancellable=true,require=1)
 private void originalTargetItem(CallbackInfoReturnable<ItemStack> ci){var mc=Minecraft.getInstance();if(mc.player!=null&&container==mc.player.getInventory()&&NativeSpectatorSync.ownsAnyMenu())ci.setReturnValue(NativeSpectatorSync.menuItem(getContainerSlot()));}
}
