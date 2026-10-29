package org.mcvisual.observer.mixin;
import org.mcvisual.observer.NativeObserverClient;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
@Mixin(targets="net.minecraft.class_634",remap=false)
public abstract class ObserverInventoryMixin {
    @Inject(method="method_11153",at=@At("TAIL"),require=1,remap=false)
    private void inventory(net.minecraft.class_2649 packet,CallbackInfo ci){NativeObserverClient.inventoryChanged(packet.method_11440());}
    @Inject(method="method_11109",at=@At("TAIL"),require=1,remap=false)
    private void slot(net.minecraft.class_2653 packet,CallbackInfo ci){NativeObserverClient.inventoryChanged(packet.method_11452());}
}
