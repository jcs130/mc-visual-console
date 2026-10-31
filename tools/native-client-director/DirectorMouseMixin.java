package org.mcvisual.director.mixin;
import org.mcvisual.director.NativeDirectorClient;
import net.minecraft.class_312;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
@Mixin(value=class_312.class,remap=false)
public abstract class DirectorMouseMixin {
    @Inject(method="method_1601",at=@At("HEAD"),require=1,remap=false)
    private void mcvisual$detach(long window,int button,int action,int modifiers,CallbackInfo ci){
        if(action==1)NativeDirectorClient.mouseDetach(window,button);
    }
}
