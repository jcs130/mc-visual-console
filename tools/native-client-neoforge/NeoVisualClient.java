package org.mcvisual.neoforge;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.fml.common.Mod;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.network.event.RegisterPayloadHandlersEvent;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.client.event.RenderFrameEvent;
/** Native loader adapter; all shot, ownership and HUD policies use their common sources. */
@Mod(value="mcvisual_native_director",dist=Dist.CLIENT)
public final class NeoVisualClient {
 public NeoVisualClient(IEventBus bus){
  new org.mcvisual.director.NativeDirectorClient().onInitializeClient();
  new org.mcvisual.observer.NativeObserverClient().onInitializeClient();
  SpectatorInventoryProtocol.initialize();
  NativeSpectatorSync.initialize();
  NativeSpectatorHands.initialize();
  org.mcvisual.director.NativeVisionCapture.declareCompositedFrameSupport();
  NeoForge.EVENT_BUS.addListener((RenderFrameEvent.Post event)->org.mcvisual.director.NativeDirectorClient.captureCompositedFrame());
  OfflineContractCheck.install();
  bus.addListener((RegisterPayloadHandlersEvent event)->NativeSpectatorSync.registerOutbound(event));
 }
}
