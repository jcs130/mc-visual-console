package org.mcvisual.director.mixin;
import org.mcvisual.director.NativeDirectorClient;
import net.minecraft.*;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
/** Mask only this explicitly enabled spectator body; followed actors are unchanged. */
@Mixin(value=class_898.class,remap=false)
public abstract class ObserverBodyMixin {
    @Inject(method="method_3954",at=@At("HEAD"),cancellable=true,require=1,remap=false)
    private void mcvisual$body(class_1297 entity,double x,double y,double z,float yaw,float delta,
                              class_4587 matrices,class_4597 vertices,int light,CallbackInfo ci){
        if(NativeDirectorClient.hideObserverBody(entity))ci.cancel();
    }
}
