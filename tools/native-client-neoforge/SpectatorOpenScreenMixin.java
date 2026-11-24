package org.mcvisual.neoforge.mixin;
import net.minecraft.client.multiplayer.ClientPacketListener;import net.minecraft.network.protocol.game.ClientboundOpenScreenPacket;
import org.mcvisual.neoforge.NativeSpectatorSync;import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
@Mixin(ClientPacketListener.class)
public abstract class SpectatorOpenScreenMixin {
 // After vanilla's main-thread barrier; never touch client/UI state on the Netty thread.
 @Inject(method="handleOpenScreen",at=@At(value="INVOKE",target="Lnet/minecraft/client/gui/screens/MenuScreens;create(Lnet/minecraft/world/inventory/MenuType;Lnet/minecraft/client/Minecraft;ILnet/minecraft/network/chat/Component;)V"),cancellable=true,require=1)
 private void open(ClientboundOpenScreenPacket packet,CallbackInfo ci){if(NativeSpectatorSync.openScreen(packet.getContainerId()))ci.cancel();}
 @Inject(method="handleOpenScreen",at=@At("TAIL"),require=1)
 private void confirmed(ClientboundOpenScreenPacket packet,CallbackInfo ci){NativeSpectatorSync.confirmMenu();}
}
