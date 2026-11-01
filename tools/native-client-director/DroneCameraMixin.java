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
    private class_1297 mcvisual$lastEntity;private class_1922 mcvisual$lastWorld;private class_243 mcvisual$lastPosition;
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
        var path=NativeDirectorClient.dronePath();
        boolean verifiedPath=true;
        if(!path.isEmpty()){
            boolean clear=true;class_243 previous=null;
            for(var point:path){
                var position=new class_243(point.x(),point.y(),point.z());
                if(!mcvisual$known(world,anchor,position)||previous!=null&&!mcvisual$sweep(world,entity,previous,position)){clear=false;break;}
                method_19327(anchor.field_1352,anchor.field_1351,anchor.field_1350);method_19325(point.yaw(),point.pitch());
                float length=(float)anchor.method_1022(position);
                if(method_19318(length)<length-.08f){clear=false;break;}previous=position;
            }
            NativeDirectorClient.dronePathResult(clear);
            if(!clear){NativeDirectorClient.dronePathBlocked();verifiedPath=false;}
        }
        method_19327(anchor.field_1352,anchor.field_1351,anchor.field_1350);
        method_19325(pose.yaw(),pose.pitch());
        double dx=pose.x()-anchor.field_1352,dy=pose.y()-anchor.field_1351,dz=pose.z()-anchor.field_1350;
        float requested=(float)Math.sqrt(dx*dx+dy*dy+dz*dz);
        // Vanilla's eight near-plane rays clip the proposed boom against the real loaded world.
        float clipped=method_19318(requested);
        var desired=new class_243(pose.x(),pose.y(),pose.z());
        boolean known=mcvisual$known(world,anchor,desired);
        boolean swept=mcvisual$lastEntity!=entity||mcvisual$lastWorld!=world||pose.snapped()||mcvisual$lastPosition==null
            ||mcvisual$sweep(world,entity,mcvisual$lastPosition,desired);
        if(!known||!swept||!verifiedPath||NativeDirectorClient.finiteShotActive()&&clipped<requested-.08f){NativeDirectorClient.dronePathBlocked();known=false;}
        boolean first=NativeDirectorClient.closeView(clipped,known);
        if(first||!known){
            method_19327(anchor.field_1352,anchor.field_1351,anchor.field_1350);method_19325(entity.method_36454(),entity.method_36455());field_18719=false;
            mcvisual$lastPosition=anchor;
        }else{
            float distance=(float)(clipped*NativeDirectorClient.closeRecovery());method_19324(-distance,0,0);field_18719=distance>=1.25f;
            double ratio=requested>0?distance/requested:0;mcvisual$lastPosition=new class_243(anchor.field_1352+dx*ratio,anchor.field_1351+dy*ratio,anchor.field_1350+dz*ratio);
        }
        mcvisual$lastEntity=entity;mcvisual$lastWorld=world;
        NativeDirectorClient.droneRendered(requested,clipped);
    }
    private static boolean mcvisual$known(class_1922 world,class_243 from,class_243 to){
        if(!(world instanceof class_638 loaded))return false;
        int steps=Math.max(1,(int)Math.ceil(from.method_1022(to)/.5));if(steps>64)return false;
        for(int i=0;i<=steps;i++)for(double[] edge:new double[][]{{-.25,-.25},{-.25,.25},{.25,-.25},{.25,.25}}){
            double t=i/(double)steps,x=from.field_1352+(to.field_1352-from.field_1352)*t+edge[0],z=from.field_1350+(to.field_1350-from.field_1350)*t+edge[1];
            if(!loaded.method_8393(((int)Math.floor(x))>>4,((int)Math.floor(z))>>4))return false;
        }
        return true;
    }
    private static boolean mcvisual$sweep(class_1922 world,class_1297 entity,class_243 from,class_243 to){
        if(!mcvisual$known(world,from,to))return false;
        for(double[] offset:new double[][]{{0,0,0},{.18,0,0},{-.18,0,0},{0,.18,0},{0,-.18,0},{0,0,.18},{0,0,-.18}}){
            var a=new class_243(from.field_1352+offset[0],from.field_1351+offset[1],from.field_1350+offset[2]);
            var b=new class_243(to.field_1352+offset[0],to.field_1351+offset[1],to.field_1350+offset[2]);
            if(world.method_17742(new class_3959(a,b,class_3959.class_3960.valueOf("VISUAL"),class_3959.class_242.valueOf("NONE"),entity)).method_17783()!=class_239.class_240.valueOf("MISS"))return false;
        }
        return true;
    }
}
