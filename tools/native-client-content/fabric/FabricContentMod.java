package org.mcvisual.content.fabric;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import org.mcvisual.content.ContentRuntime;
public final class FabricContentMod implements ClientModInitializer {
 public void onInitializeClient(){
  var platform=new FabricContentPlatform();var runtime=new ContentRuntime(platform);
  ClientTickEvents.END_CLIENT_TICK.register(mc->runtime.tick());
  HudRenderCallback.EVENT.register((draw,delta)->runtime.render(platform.canvas(draw)));
  ClientLifecycleEvents.CLIENT_STOPPING.register(mc->runtime.close());
 }
}
