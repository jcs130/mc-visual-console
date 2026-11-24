package org.mcvisual.window.neoforge;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.fml.common.Mod;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import org.mcvisual.window.WindowRuntime;
@Mod(value="mcvisual_window",dist=Dist.CLIENT)
public final class WindowMod {
 public WindowMod(){var platform=new NeoForgeWindowPlatform();NeoForge.EVENT_BUS.addListener((ClientTickEvent.Post event)->WindowRuntime.tick(platform));}
}
