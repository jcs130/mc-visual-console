package org.mcvisual.observer.mixin;
import org.mcvisual.observer.NativeObserverClient;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import com.hpfxd.spectatorplus.fabric.sync.packet.ClientboundInventorySyncPacket;
@Pseudo
@Mixin(targets="com.hpfxd.spectatorplus.fabric.client.sync.screen.ScreenSyncController",remap=false)
public abstract class SpectatorInventoryMixin {
    @Inject(method="handle(Lcom/hpfxd/spectatorplus/fabric/sync/packet/ClientboundInventorySyncPacket;Lnet/fabricmc/fabric/api/client/networking/v1/ClientPlayNetworking$Context;)V",at=@At("TAIL"),require=1,remap=false)
    private static void inventory(ClientboundInventorySyncPacket packet,ClientPlayNetworking.Context context,CallbackInfo ci) {
        NativeObserverClient.targetInventory(packet.playerId(),packet.items(),true);
    }
}
