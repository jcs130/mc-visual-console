package org.mcvisual.window.neoforge.mixin;
import net.minecraft.client.MouseHandler;
import org.mcvisual.window.WindowRuntime;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
@Mixin(value=MouseHandler.class,remap=false)
public abstract class MouseCaptureMixin {
 @Inject(method="grabMouse",at=@At("HEAD"),cancellable=true,require=1,remap=false)
 private void mcvisual$independentFreeCursor(CallbackInfo ci){if(WindowRuntime.suppressMouseGrab())ci.cancel();}
}
