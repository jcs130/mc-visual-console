package org.mcvisual.window.fabric;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import org.mcvisual.window.WindowRuntime;
public final class WindowMod implements ClientModInitializer {
 public void onInitializeClient(){var platform=new FabricWindowPlatform();ClientTickEvents.END_CLIENT_TICK.register(mc->WindowRuntime.tick(platform));}
}
