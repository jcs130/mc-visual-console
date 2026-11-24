package org.mcvisual.neoforge.mixin;
import net.minecraft.client.multiplayer.MultiPlayerGameMode;
import org.mcvisual.neoforge.NativeSpectatorSync;import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
/** A displayed target container cannot send inventory, recipe, button or creative mutations. */
@Mixin(MultiPlayerGameMode.class)
public abstract class SpectatorGameModeMixin {
 @Inject(method={"handleInventoryMouseClick","handlePlaceRecipe","handleInventoryButtonClick","handleCreativeModeItemAdd","handleCreativeModeItemDrop","handlePickItem"},at=@At("HEAD"),cancellable=true,require=6)
 private void readOnly(CallbackInfo ci){if(NativeSpectatorSync.ownsAnyMenu())ci.cancel();}
}
