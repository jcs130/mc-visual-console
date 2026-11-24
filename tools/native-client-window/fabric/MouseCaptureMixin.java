package org.mcvisual.window.fabric.mixin;
import net.minecraft.class_312;
import org.mcvisual.window.WindowRuntime;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
@Mixin(value=class_312.class,remap=false)
public abstract class MouseCaptureMixin {
 @Inject(method="method_1612",at=@At("HEAD"),cancellable=true,require=1,remap=false)
 private void mcvisual$independentFreeCursor(CallbackInfo ci){if(WindowRuntime.suppressMouseGrab())ci.cancel();}
}
