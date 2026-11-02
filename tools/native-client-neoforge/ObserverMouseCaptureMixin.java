package org.mcvisual.neoforge.mixin;
import net.minecraft.client.MouseHandler;
import org.mcvisual.neoforge.NativeWindowRuntime;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
@Mixin(value=MouseHandler.class,remap=false)
public abstract class ObserverMouseCaptureMixin {
    @Inject(method="grabMouse",at=@At("HEAD"),cancellable=true,require=1,remap=false)
    private void mcvisual$freeCursor(CallbackInfo ci){if(NativeWindowRuntime.suppressMouseGrab())ci.cancel();}
}
