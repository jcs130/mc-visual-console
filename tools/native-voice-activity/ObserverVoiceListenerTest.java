package org.mcvisual.voiceactivity;

import de.maxhenkel.voicechat.api.internal.events.UpdateCameraPositionEvent;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3f;
import java.lang.reflect.Proxy;
import java.util.concurrent.atomic.AtomicReference;

/** Exact installed SVC event interface, injected body read; no live Minecraft or microphone. */
public final class ObserverVoiceListenerTest {
    public interface PositionInspection { Object getPos(); }
    static final AtomicReference<Object[]> applied = new AtomicReference<>();
    static UpdateCameraPositionEvent event(Object existing) {
        applied.set(null);
        return (UpdateCameraPositionEvent)Proxy.newProxyInstance(ObserverVoiceListenerTest.class.getClassLoader(),
                new Class[]{UpdateCameraPositionEvent.class, PositionInspection.class}, (proxy, method, args) -> {
                    if (method.getName().equals("getPos")) return existing;
                    if (method.getName().equals("setCameraPosition")) { applied.set(args); return null; }
                    return method.getReturnType() == boolean.class ? false : null;
                });
    }
    public static void main(String[] args) {
        var eye = new Vec3(10, 64, -20);
        var front = new Vector3f(0, 0, -1); var up = new Vector3f(0, 1, 0);
        var current = new AtomicReference<>(new ObserverVoiceListener.Anchor(eye, front, up));
        var listener = new ObserverVoiceListener(current::get);
        listener.update(event(null));
        assert applied.get()[0] == eye && applied.get()[1] == front && applied.get()[2] == up : "body position, current camera orientation";
        listener.update(event(new Vec3(30, 80, 0)));
        assert applied.get() == null : "do not overwrite another camera integration";
        current.set(null); listener.update(event(null));
        assert applied.get() == null : "stale state, detach, disconnect or another world must not replay previous body";
        current.set(new ObserverVoiceListener.Anchor(new Vec3(Double.NaN, 0, 0), front, up)); listener.update(event(null));
        assert applied.get() == null : "invalid coordinates must not affect OpenAL";
        current.set(new ObserverVoiceListener.Anchor(eye, new Vector3f(), up)); listener.update(event(null));
        assert applied.get() == null : "invalid orientation must not mute positional audio";
        current.set(new ObserverVoiceListener.Anchor(new Vec3(-50, 70, 100), front, up)); listener.update(event(null));
        assert applied.get()[0] == current.get().eye() : "a newly verified target can supply its own position";
        System.out.println("6 observer listener event cases passed; no world, output device or microphone opened");
    }
}
