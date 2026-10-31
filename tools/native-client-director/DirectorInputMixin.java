package org.mcvisual.director.mixin;
import org.mcvisual.director.NativeDirectorClient;
import net.minecraft.class_309;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
/** Observe only the configured detach binding, never text or unrelated keys. */
@Mixin(value=class_309.class,remap=false)
public abstract class DirectorInputMixin {
    @Inject(method="method_1466",at=@At("HEAD"),require=1,remap=false)
    private void mcvisual$detach(long window,int key,int scan,int action,int modifiers,CallbackInfo ci){
        if(action==1)NativeDirectorClient.keyboardDetach(window,key,scan);
    }
}
