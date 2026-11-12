package org.mcvisual.voiceactivity;

import de.maxhenkel.voicechat.api.ForgeVoicechatPlugin;
import de.maxhenkel.voicechat.api.VoicechatApi;
import de.maxhenkel.voicechat.api.VoicechatPlugin;
import de.maxhenkel.voicechat.api.events.ClientReceiveSoundEvent;
import de.maxhenkel.voicechat.api.events.EventRegistration;
import de.maxhenkel.voicechat.api.events.OpenALSoundEvent;
import de.maxhenkel.voicechat.api.internal.events.UpdateCameraPositionEvent;
import org.lwjgl.openal.AL10;
import org.lwjgl.openal.AL11;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/** Optional receive-only observer integration. It never starts a microphone. */
@ForgeVoicechatPlugin
public final class VoiceActivityPlugin implements VoicechatPlugin {
    private final ActivityWindow activity = new ActivityWindow();
    private final String source = "observer-" + UUID.randomUUID();
    private final AtomicLong sequence = new AtomicLong();
    private final AtomicBoolean sending = new AtomicBoolean();
    private final AtomicLong receivedFrames = new AtomicLong(), deviceFrames = new AtomicLong(), audibleFrames = new AtomicLong();
    private volatile boolean enabled;
    private URI endpoint;
    private HttpClient http;
    private ScheduledExecutorService timer;
    private volatile long lastReport;
    private volatile boolean wasActive;
    private volatile String deliveryState = "starting";
    private volatile int lastDistanceModel = Integer.MIN_VALUE;
    private int diagnosticRemaining = 8;
    private volatile ObserverVoiceListener observerListener;

    @Override public String getPluginId() { return "mcvisual_voice_activity"; }

    @Override public void initialize(VoicechatApi api) {
        try {
            Path file = Path.of("config", "mcvisual-voice-activity.properties");
            Properties cfg = new Properties();
            if (Files.isRegularFile(file)) try (var in = Files.newInputStream(file)) { cfg.load(in); }
            if (!Boolean.parseBoolean(cfg.getProperty("enabled", "false"))) return;
            endpoint = URI.create(cfg.getProperty("endpoint", "http://127.0.0.1:18580/v1/game-audio"));
            if (!isLocalEndpoint(endpoint)) throw new IllegalArgumentException("Endpoint must be an explicit loopback HTTP activity route");
            // The loopback broker reserves HTTP upgrades for WebSockets. Do not
            // send Java's default h2c upgrade on metadata POSTs.
            http = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofMillis(500)).build();
            timer = Executors.newSingleThreadScheduledExecutor(r -> {
                Thread thread = new Thread(r, "mcvisual-voice-activity"); thread.setDaemon(true); return thread;
            });
            enabled = true;
            if (Boolean.parseBoolean(cfg.getProperty("listener_at_observed_player", "false")))
                observerListener = new ObserverVoiceListener();
            timer.scheduleAtFixedRate(this::report, 0, 100, TimeUnit.MILLISECONDS);
            if (Boolean.parseBoolean(cfg.getProperty("follow_default_output", "false"))) {
                SvcOutputDeviceRecovery recovery = new SvcOutputDeviceRecovery();
                timer.scheduleWithFixedDelay(recovery::poll, 1000, 1000, TimeUnit.MILLISECONDS);
            }
            System.out.println("[mcvisual-voice-activity] receive-only activity enabled");
        } catch (Exception error) {
            enabled = false;
            System.err.println("[mcvisual-voice-activity] disabled: " + error.getClass().getSimpleName());
        }
    }

    static boolean isLocalEndpoint(URI endpoint) {
        return "http".equals(endpoint.getScheme()) &&
                ("127.0.0.1".equals(endpoint.getHost()) || "localhost".equals(endpoint.getHost()) || "[::1]".equals(endpoint.getHost())) &&
                endpoint.getUserInfo() == null && endpoint.getQuery() == null && endpoint.getFragment() == null &&
                endpoint.getPort() > 0 && "/v1/game-audio".equals(endpoint.getPath());
    }

    @Override public void registerEvents(EventRegistration events) {
        // SVC dispatches these exact event interfaces, not their base interface.
        events.registerEvent(ClientReceiveSoundEvent.EntitySound.class, this::received);
        events.registerEvent(ClientReceiveSoundEvent.LocationalSound.class, this::received);
        events.registerEvent(ClientReceiveSoundEvent.StaticSound.class, this::received);
        events.registerEvent(OpenALSoundEvent.Post.class, this::rendered);
        try {
            events.registerEvent(UpdateCameraPositionEvent.class, event -> {
                var listener = observerListener;
                if (enabled && listener != null) listener.update(event);
            });
        } catch (LinkageError | RuntimeException unsupported) {
            observerListener = null;
            System.err.println("[mcvisual-voice-activity] observer listener hook unavailable");
        }
    }

    private void received(ClientReceiveSoundEvent event) {
        if (!enabled || event.isCancelled()) return;
        receivedFrames.incrementAndGet();
        activity.receive(event.getId(), event.getRawAudio(), System.currentTimeMillis());
    }

    private void rendered(OpenALSoundEvent.Post event) {
        if (!enabled || event.getChannelId() == null || event.isCancelled()) return;
        deviceFrames.incrementAndGet();
        try {
            int sourceId = event.getSource();
            if (!AL10.alIsSource(sourceId)) return;
            float[] sourcePosition = new float[3], listenerPosition = new float[3];
            AL10.alGetSourcefv(sourceId, AL10.AL_POSITION, sourcePosition);
            if (AL10.alGetSourcei(sourceId, AL10.AL_SOURCE_RELATIVE) == AL10.AL_FALSE)
                AL10.alGetListenerfv(AL10.AL_POSITION, listenerPosition);
            double distance = Math.sqrt(Math.pow(sourcePosition[0] - listenerPosition[0], 2) +
                    Math.pow(sourcePosition[1] - listenerPosition[1], 2) + Math.pow(sourcePosition[2] - listenerPosition[2], 2));
            int model = AL10.alGetInteger(AL10.AL_DISTANCE_MODEL);
            if (model != lastDistanceModel) {
                lastDistanceModel = model;
                System.out.println("[mcvisual-voice-activity] OpenAL distance model=" + model);
            }
            double gain = deviceGain(model, AL10.alGetSourcef(sourceId, AL10.AL_GAIN),
                    AL10.alGetListenerf(AL10.AL_GAIN), AL10.alGetSourcef(sourceId, AL10.AL_MIN_GAIN),
                    AL10.alGetSourcef(sourceId, AL10.AL_MAX_GAIN), distance,
                    AL10.alGetSourcef(sourceId, AL10.AL_REFERENCE_DISTANCE),
                    AL10.alGetSourcef(sourceId, AL10.AL_MAX_DISTANCE), AL10.alGetSourcef(sourceId, AL10.AL_ROLLOFF_FACTOR));
            int queued = AL10.alGetSourcei(sourceId, AL10.AL_BUFFERS_QUEUED), processed = AL10.alGetSourcei(sourceId, AL10.AL_BUFFERS_PROCESSED);
            boolean disabled = event.getVoicechat().isDisabled() || event.getVoicechat().isDisconnected();
            if (activity.rendered(event.getChannelId(), gain, queued, processed, disabled, System.currentTimeMillis())) {
                audibleFrames.incrementAndGet();
                // Wake the metadata sender immediately for the first frame,
                // without doing network work on the device callback thread.
                if (!wasActive) timer.execute(this::report);
            } else if (diagnosticRemaining > 0) {
                diagnosticRemaining--;
                System.out.println("[mcvisual-voice-activity] bounded device diagnostic model=" + model + " gain=" + gain +
                        " queued=" + queued + " processed=" + processed + " disabled=" + disabled + " reason=" + activity.lastReason());
            }
        } catch (RuntimeException ignored) {
            // An audio-device replacement must not crash or alter the game.
        }
    }

    static double deviceGain(int model, double gain, double listener, double minimum, double maximum,
                             double distance, double reference, double maxDistance, double rolloff) {
        // Actual SVC 2.6.27 ALSpeakerBase sets AL_LINEAR_DISTANCE (0xD003),
        // not AL_LINEAR_DISTANCE_CLAMPED (0xD004). Account for both exact enums.
        if (model == AL10.AL_NONE) return ActivityWindow.flatGain(gain, listener, minimum, maximum);
        if (model == AL11.AL_LINEAR_DISTANCE || model == AL11.AL_LINEAR_DISTANCE_CLAMPED)
            return ActivityWindow.linearGain(gain, listener, minimum, maximum, distance, reference, maxDistance, rolloff);
        return 0;
    }

    private void report() {
        if (!enabled) return;
        long now = System.currentTimeMillis();
        int remaining = activity.remainingMs(now);
        boolean active = remaining > 0;
        if (active && wasActive && now - lastReport < 100) return;
        if (!active && !wasActive && now - lastReport < 1000) return;
        if (!sending.compareAndSet(false, true)) return;
        lastReport = now; wasActive = active;
        try {
            String body = "{\"protocol\":\"game-audio-activity/v1\",\"source\":\"" + source +
                    "\",\"sequence\":" + sequence.incrementAndGet() + ",\"observedAt\":" + now +
                    ",\"active\":" + (remaining > 0) + ",\"holdMs\":" + remaining +
                    ",\"receivedFrames\":" + receivedFrames.get() + ",\"deviceFrames\":" + deviceFrames.get() +
                    ",\"audibleFrames\":" + audibleFrames.get() + "}";
            HttpRequest request = HttpRequest.newBuilder(endpoint).timeout(Duration.ofMillis(800))
                    .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body)).build();
            http.sendAsync(request, HttpResponse.BodyHandlers.discarding()).whenComplete((response, error) -> {
                String next = error != null ? "unavailable" : "HTTP " + response.statusCode();
                if (!next.equals(deliveryState)) {
                    deliveryState = next;
                    System.out.println("[mcvisual-voice-activity] local activity delivery: " + next);
                }
                sending.set(false);
            });
        } catch (RuntimeException ignored) { sending.set(false); }
    }
}
