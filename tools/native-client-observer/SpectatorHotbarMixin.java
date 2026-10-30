package org.mcvisual.observer.mixin;
import org.mcvisual.observer.NativeObserverClient;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import com.hpfxd.spectatorplus.fabric.sync.packet.ClientboundHotbarSyncPacket;
/** Optional integration; no duplicate payload receiver or replacement item model. */
@Pseudo
@Mixin(targets="com.hpfxd.spectatorplus.fabric.client.sync.ClientSyncController",remap=false)
public abstract class SpectatorHotbarMixin {
    @Inject(method="handle(Lcom/hpfxd/spectatorplus/fabric/sync/packet/ClientboundHotbarSyncPacket;Lnet/fabricmc/fabric/api/client/networking/v1/ClientPlayNetworking$Context;)V",at=@At("TAIL"),require=1,remap=false)
    private static void hotbar(ClientboundHotbarSyncPacket packet,ClientPlayNetworking.Context context,CallbackInfo ci) {
        NativeObserverClient.targetInventory(packet.playerId(),packet.items(),false);
    }
}
