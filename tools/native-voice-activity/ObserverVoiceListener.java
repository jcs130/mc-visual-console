package org.mcvisual.voiceactivity;

import de.maxhenkel.voicechat.api.internal.events.UpdateCameraPositionEvent;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3fc;
import java.lang.reflect.Method;
import java.util.function.Supplier;

/** Opt-in SVC 2.6.27 adapter: listen from the fresh observed body, not a moving film camera. */
final class ObserverVoiceListener {
    record Anchor(Vec3 eye, Vector3fc forward, Vector3fc up) {}
    private final Supplier<Anchor> read;
    private boolean unavailable;
    private String status = "starting";

    ObserverVoiceListener() {
        Method target = null;
        try { target = Class.forName("org.mcvisual.neoforge.NativeSpectatorSync").getMethod("target"); }
        catch (ReflectiveOperationException | LinkageError error) { unavailable = true; status("native-observer-unavailable"); }
        Method resolved = target;
        read = () -> currentAnchor(resolved);
    }
    ObserverVoiceListener(Supplier<Anchor> read) { this.read = read; }

    void update(UpdateCameraPositionEvent event) {
        if (unavailable) return;
        try {
            // This hook is internal to the verified SVC version. Respect an
            // earlier integration's position and fail closed on changed APIs.
            Method existing = event.getClass().getMethod("getPos");
            if (existing.invoke(event) != null) { status("existing-camera-override"); return; }
            Anchor anchor = read.get();
            if (anchor == null) { status("no-fresh-observed-body"); return; }
            if (!valid(anchor)) { status("invalid-observed-position"); return; }
            event.setCameraPosition(anchor.eye(), anchor.forward(), anchor.up());
            status("observed-body");
        } catch (ReflectiveOperationException | LinkageError error) {
            unavailable = true;
            status("adapter-unavailable");
        } catch (RuntimeException error) {
            // World/connection changes may invalidate this frame. Do not reuse
            // the previous body's coordinates or change ordinary playback.
            status("observation-unavailable");
        }
    }

    static boolean valid(Anchor a) {
        return a.eye() != null && Double.isFinite(a.eye().x) && Double.isFinite(a.eye().y) && Double.isFinite(a.eye().z)
                && finite(a.forward()) && finite(a.up());
    }
    private static boolean finite(Vector3fc v) {
        return v != null && Float.isFinite(v.x()) && Float.isFinite(v.y()) && Float.isFinite(v.z()) && v.lengthSquared() > .5F;
    }

    private static Anchor currentAnchor(Method readTarget) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null || !mc.player.isSpectator()) return null;
        try {
            // Optional native observer dependency. target() already checks the
            // real camera identity, world, connection and fresh target state.
            Object value = readTarget.invoke(null);
            if (!(value instanceof AbstractClientPlayer target) || target != mc.getCameraEntity()
                    || target.level() != mc.level || target.isRemoved()) return null;
            var camera = mc.gameRenderer.getMainCamera();
            if (!camera.isInitialized() || camera.getEntity() != target) return null;
            return new Anchor(target.getEyePosition(), camera.getLookVector(), camera.getUpVector());
        } catch (ReflectiveOperationException error) {
            throw new IllegalStateException("Native observer contract unavailable", error);
        }
    }

    private void status(String next) {
        if (!next.equals(status)) {
            status = next;
            System.out.println("[mcvisual-voice-activity] listener: " + next);
        }
    }
}
