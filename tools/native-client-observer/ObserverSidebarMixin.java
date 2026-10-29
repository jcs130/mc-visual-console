package org.mcvisual.observer.mixin;
import org.mcvisual.observer.NativeObserverClient;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
@Mixin(targets="net.minecraft.class_329",remap=false)
public abstract class ObserverSidebarMixin {
    @Inject(method="method_1757",at=@At("HEAD"),cancellable=true,require=1,remap=false)
    private void sidebar(net.minecraft.class_332 draw,net.minecraft.class_266 objective,CallbackInfo ci){if(NativeObserverClient.hideSidebar())ci.cancel();}
}
