package org.mcvisual.window.neoforge.mixin;
import net.minecraft.client.renderer.GameRenderer;
import org.mcvisual.window.WindowRuntime;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
@Mixin(value=GameRenderer.class,remap=false)
public abstract class FrameCounterMixin {
 @Inject(method="render",at=@At("RETURN"),require=1,remap=false)
 private void mcvisual$independentFrame(CallbackInfo ci){WindowRuntime.renderedFrame();}
 @Inject(method="renderLevel",at=@At("RETURN"),require=1,remap=false)
 private void mcvisual$independentWorld(CallbackInfo ci){WindowRuntime.renderedWorld();}
}
