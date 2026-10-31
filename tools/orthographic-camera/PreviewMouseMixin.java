package local.orthopreview.mixin;
import net.minecraft.class_312;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
/** Install only in the explicitly isolated camera lab. */
@Mixin(class_312.class)
public abstract class PreviewMouseMixin {
  @Inject(method="method_1612",at=@At("HEAD"),cancellable=true)
  private void noSystemMouseCapture(CallbackInfo info){info.cancel();}
}
