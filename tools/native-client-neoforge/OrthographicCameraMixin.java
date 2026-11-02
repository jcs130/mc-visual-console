package org.mcvisual.neoforge.mixin;
import net.minecraft.client.*;import net.minecraft.world.entity.Entity;import net.minecraft.world.level.BlockGetter;
import org.mcvisual.neoforge.OrthographicProjection;
import org.spongepowered.asm.mixin.*;import org.spongepowered.asm.mixin.injection.*;import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
@Mixin(Camera.class)
public abstract class OrthographicCameraMixin {
 @Shadow protected abstract void setRotation(float yaw,float pitch);
 @Shadow protected abstract void setPosition(double x,double y,double z);
 @Shadow private boolean detached;
 @Inject(method="setup",at=@At("TAIL"),require=1)
 private void projection(BlockGetter world,Entity entity,boolean thirdPerson,boolean inverse,float delta,CallbackInfo ci){
  if(!OrthographicProjection.active()||entity!=Minecraft.getInstance().getCameraEntity())return;
  var eye=entity.getEyePosition(delta);setPosition(eye.x,eye.y,eye.z);
  setRotation(OrthographicProjection.CONFIG.fixed_yaw,OrthographicProjection.CONFIG.fixed_pitch);detached=true;
 }
}
