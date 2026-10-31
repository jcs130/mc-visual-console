package org.mcvisual.observer.mixin;
import java.util.*;
import net.minecraft.*;
import org.mcvisual.observer.NativeObserverClient;
import org.spongepowered.asm.mixin.*;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
/** Prevent vanilla's unknown-UUID update NPE; preserve every complete original bar. */
@Mixin(targets="net.minecraft.class_337",remap=false)
public abstract class ObserverBossBarMixin {
    @Shadow(remap=false) @Final private Map<UUID,class_345> field_2060;
    @Inject(method="method_1795",at=@At("HEAD"),cancellable=true,require=1,remap=false)
    private void packet(class_2629 packet,CallbackInfo ci) {
        if(!NativeObserverClient.scoped())return;
        boolean[] valid={true};
        packet.method_34091(new class_2629.class_5881(){
            private void update(UUID id,boolean complete){valid[0]=NativeObserverClient.nativeBarPacket(id,complete,field_2060.containsKey(id));}
            @Override public void method_34103(UUID id,class_2561 name,float progress,class_1259.class_1260 color,class_1259.class_1261 style,boolean dark,boolean music,boolean fog){update(id,true);}
            @Override public void method_34099(UUID id){update(id,true);}
            @Override public void method_34100(UUID id,float progress){update(id,false);}
            @Override public void method_34102(UUID id,class_2561 name){update(id,false);}
            @Override public void method_34101(UUID id,class_1259.class_1260 color,class_1259.class_1261 style){update(id,false);}
            @Override public void method_34104(UUID id,boolean dark,boolean music,boolean fog){update(id,false);}
        });
        if(!valid[0])ci.cancel();
    }
    @Inject(method="method_1801",at=@At("TAIL"),require=1,remap=false)
    private void clear(CallbackInfo ci){NativeObserverClient.nativeBarsCleared();}
}
