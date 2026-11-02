package org.mcvisual.neoforge.mixin;
import com.mojang.blaze3d.platform.Window;
import org.mcvisual.neoforge.NativeWindowRuntime;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import java.util.function.*;
@Mixin(value=Window.class,remap=false)
public abstract class ObserverWindowHintsMixin {
    @WrapOperation(method="<init>",at=@At(value="INVOKE",target="Lnet/neoforged/fml/loading/ImmediateWindowHandler;setupMinecraftWindow(Ljava/util/function/IntSupplier;Ljava/util/function/IntSupplier;Ljava/util/function/Supplier;Ljava/util/function/LongSupplier;)J"),require=1,remap=false)
    private long mcvisual$noActivation(IntSupplier width,IntSupplier height,Supplier<String> title,LongSupplier monitor,Operation<Long> original){
        NativeWindowRuntime.beforeWindowCreation();return original.call(width,height,title,monitor);
    }
}
