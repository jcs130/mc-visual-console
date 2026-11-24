package org.mcvisual.neoforge.mixin;
import net.minecraft.client.Minecraft;import net.minecraft.client.renderer.GameRenderer;
import org.joml.Matrix4f;import org.mcvisual.neoforge.OrthographicProjection;
import org.spongepowered.asm.mixin.*;import org.spongepowered.asm.mixin.injection.*;import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
@Mixin(GameRenderer.class)
public abstract class OrthographicMatrixMixin {
 @Inject(method="getProjectionMatrix",at=@At("HEAD"),cancellable=true,require=1)
 private void projection(double fov,CallbackInfoReturnable<Matrix4f> ci){
  if(!OrthographicProjection.active())return;
  var c=OrthographicProjection.CONFIG;var w=Minecraft.getInstance().getWindow();
  float aspect=w.getWidth()/(float)Math.max(1,w.getHeight());
  ci.setReturnValue(new Matrix4f().setOrtho(-c.scale_x*aspect,c.scale_x*aspect,-c.scale_y,c.scale_y,c.min_distance,c.max_distance));
 }
}
