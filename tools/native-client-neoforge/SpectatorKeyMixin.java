package org.mcvisual.neoforge.mixin;
import net.minecraft.client.*;import org.mcvisual.neoforge.NativeSpectatorSync;
import org.spongepowered.asm.mixin.Mixin;import org.spongepowered.asm.mixin.injection.*;import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
@Mixin(KeyboardHandler.class)
public abstract class SpectatorKeyMixin {
 @Inject(method="keyPress",at=@At("HEAD"),cancellable=true,require=1)
 private void inventory(long window,int key,int scan,int action,int mods,CallbackInfo ci){
  var mc=Minecraft.getInstance();if(action==1&&mc.screen==null&&window==mc.getWindow().getWindow()&&mc.options.keyInventory.matches(key,scan)&&NativeSpectatorSync.requestInventory())ci.cancel();
 }
}
