package org.mcvisual.director.mixin;

import org.mcvisual.director.NativeDirectorClient;

import net.minecraft.*;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Transform only the rendered camera; retain the actual spectated entity and native HUD identity. */
@Mixin(value=class_4184.class,remap=false)
public abstract class DroneCameraMixin {
    @Shadow(remap=false) private boolean field_18719;
    @Shadow(remap=false) protected abstract void method_19325(float yaw,float pitch);
    @Shadow(remap=false) protected abstract void method_19327(double x,double y,double z);
    @Shadow(remap=false) protected abstract void method_19324(float back,float vertical,float side);
    @Shadow(remap=false) private float method_19318(float distance){throw new AssertionError();}
    @Inject(method="method_19321",at=@At("RETURN"),remap=false,require=1)
    private void mcvisual$follow(class_1922 world,class_1297 entity,boolean thirdPerson,boolean inverse,float delta,CallbackInfo ci){
        if(!NativeDirectorClient.droneMayRender(entity))return;
        class_243 anchor=entity.method_5836(delta);
        var pose=NativeDirectorClient.dronePose(entity,anchor);
        method_19327(anchor.field_1352,anchor.field_1351,anchor.field_1350);
        method_19325(pose.yaw(),pose.pitch());
        double dx=pose.x()-anchor.field_1352,dy=pose.y()-anchor.field_1351,dz=pose.z()-anchor.field_1350;
        float requested=(float)Math.sqrt(dx*dx+dy*dy+dz*dz);
        // Vanilla's eight near-plane rays clip the proposed boom against the real loaded world.
        float clipped=method_19318(requested);
        method_19324(-clipped,0,0);field_18719=true;
        NativeDirectorClient.droneRendered(requested,clipped);
    }
}
