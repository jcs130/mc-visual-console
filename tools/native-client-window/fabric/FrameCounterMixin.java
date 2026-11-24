package org.mcvisual.window.fabric.mixin;
import net.minecraft.class_757;
import org.mcvisual.window.WindowRuntime;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
@Mixin(value=class_757.class,remap=false)
public abstract class FrameCounterMixin {
 @Inject(method="method_3192",at=@At("RETURN"),require=1,remap=false)
 private void mcvisual$independentFrame(CallbackInfo ci){WindowRuntime.renderedFrame();}
 @Inject(method="method_3188",at=@At("RETURN"),require=1,remap=false)
 private void mcvisual$independentWorld(CallbackInfo ci){WindowRuntime.renderedWorld();}
}
