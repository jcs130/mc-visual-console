package org.mcvisual.content;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.fml.common.Mod;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import net.neoforged.neoforge.client.event.RenderGuiEvent;
@Mod(value="mcvisual_content",dist=Dist.CLIENT)
public final class ContentMod {
 public ContentMod(){var runtime=new ContentRuntime();NeoForge.EVENT_BUS.addListener((ClientTickEvent.Post e)->runtime.tick());NeoForge.EVENT_BUS.addListener((RenderGuiEvent.Post e)->runtime.render(e.getGuiGraphics()));}
}
