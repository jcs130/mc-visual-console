package org.mcvisual.voiceactivity;

import org.lwjgl.openal.ALC10;
import org.lwjgl.openal.ALC11;
import java.lang.reflect.Modifier;
import java.util.Arrays;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;

/** Optional adapter to SVC 2.6.27 public methods. No config writes or microphone operations. */
public final class SvcOutputDeviceRecovery {
    private final OutputDeviceRecovery recovery = new OutputDeviceRecovery();
    private final AtomicBoolean scheduled = new AtomicBoolean();
    private volatile boolean unavailable;
    private volatile String lastStatus = "";

    public String status() { return unavailable ? "adapter-unavailable" : lastStatus; }

    public void poll() {
        if (unavailable || !scheduled.compareAndSet(false, true)) return;
        try {
            // Minecraft names are loader-mapped; the public singleton's return
            // type and Executor interface are stable in the targeted 1.21.1 client.
            Class<?> minecraft = Class.forName("net.minecraft.client.Minecraft");
            Object instance = Arrays.stream(minecraft.getMethods()).filter(m ->
                    Modifier.isStatic(m.getModifiers()) && m.getParameterCount() == 0
                    && m.getReturnType() == minecraft).findFirst().orElseThrow().invoke(null);
            if (!(instance instanceof Executor executor)) throw new IllegalStateException("Render executor unavailable");
            executor.execute(() -> { try { onClientThread(); }
                catch (ReflectiveOperationException | LinkageError error) { unavailable(error); }
                catch (RuntimeException error) { status("device-query-unavailable"); }
                finally { scheduled.set(false); }
            });
        } catch (ReflectiveOperationException | RuntimeException | LinkageError error) {
            unavailable(error); scheduled.set(false);
        }
    }

    private void onClientThread() throws ReflectiveOperationException {
        Class<?> cm = Class.forName("de.maxhenkel.voicechat.voice.client.ClientManager");
        Object client = cm.getMethod("getClient").invoke(null);
        Object state = cm.getMethod("getPlayerStateManager").invoke(null);
        Object config = Class.forName("de.maxhenkel.voicechat.VoicechatClient").getField("CLIENT_CONFIG").get(null);
        Object speaker = config.getClass().getField("speaker").get(config);
        String configured = (String)Class.forName("de.maxhenkel.voicechat.configbuilder.entry.ConfigEntry").getMethod("get").invoke(speaker);
        boolean connected = state != null && !(boolean)call(state, "isDisconnected");
        boolean disabled = state == null || (boolean)call(state, "isDisabled");
        Object manager = client == null ? null : call(client, "getSoundManager");
        boolean ready = manager != null && !(boolean)call(manager, "isClosed") && !(boolean)call(manager, "isClosing");
        String defaultDevice = connected && !disabled && configured != null && configured.isBlank()
                ? ALC10.alcGetString(0L, ALC11.ALC_DEFAULT_ALL_DEVICES_SPECIFIER) : null;
        if (recovery.observe(new OutputDeviceRecovery.Sample(client, manager, configured, defaultDevice, connected, disabled, ready),
                System.nanoTime() / 1_000_000L)) {
            // Output only. reloadAudio also recreates the microphone and must not be used.
            call(client, "reloadSoundManager");
        }
        status(recovery.status());
    }

    private static Object call(Object object, String method) throws ReflectiveOperationException {
        return object.getClass().getMethod(method).invoke(object);
    }
    private void unavailable(Throwable error) {
        unavailable = true;
        System.err.println("[mcvisual-voice-activity] output-device recovery unavailable: " + error.getClass().getSimpleName());
    }
    private void status(String next) {
        if (!next.equals(lastStatus)) {
            lastStatus = next;
            System.out.println("[mcvisual-voice-activity] output-device recovery: " + next);
        }
    }
}
