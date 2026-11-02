package org.mcvisual.window.fabric.mixin;
import net.minecraft.class_1041;
import org.lwjgl.glfw.GLFW;
import org.mcvisual.window.WindowRuntime;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
@Mixin(value=class_1041.class,remap=false)
public abstract class WindowHintsMixin {
 @WrapOperation(method="<init>",at=@At(value="INVOKE",target="Lorg/lwjgl/glfw/GLFW;glfwCreateWindow(IILjava/lang/CharSequence;JJ)J"),require=1,remap=false)
 private long mcvisual$independentNoActivation(int width,int height,CharSequence title,long monitor,long share,Operation<Long> original){WindowRuntime.beforeWindowCreation();return original.call(width,height,title,monitor,share);}
}
