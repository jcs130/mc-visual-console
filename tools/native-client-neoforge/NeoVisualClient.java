package org.mcvisual.neoforge;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.fml.common.Mod;
/** Native loader adapter; all shot, ownership and HUD policies use their common sources. */
@Mod(value="mcvisual_native_director",dist=Dist.CLIENT)
public final class NeoVisualClient {
 public NeoVisualClient(){
  new org.mcvisual.director.NativeDirectorClient().onInitializeClient();
  new org.mcvisual.observer.NativeObserverClient().onInitializeClient();
  SpectatorInventoryProtocol.initialize();
 }
}
