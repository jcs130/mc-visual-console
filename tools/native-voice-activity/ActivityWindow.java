package org.mcvisual.voiceactivity;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/** Device-frame evidence only. Raw samples are reduced immediately, not retained. */
public final class ActivityWindow {
    private record Frame(long at, double rms, double durationMs) {}
    private final Map<UUID, Frame> frames = new HashMap<>();
    private long audibleUntil;
    private String lastReason = "none";

    public synchronized void receive(UUID id, short[] pcm, long now) {
        if (id == null || pcm == null || pcm.length == 0) return;
        double sum = 0;
        for (short sample : pcm) { double value = sample / 32768.0; sum += value * value; }
        frames.put(id, new Frame(now, Math.sqrt(sum / pcm.length), pcm.length / 48.0));
        frames.entrySet().removeIf(entry -> now - entry.getValue().at > 2000);
        if (frames.size() > 64) frames.remove(frames.keySet().iterator().next());
    }

    public synchronized boolean rendered(UUID id, double audibleGain, int queued, int processed, boolean disabled, long now) {
        Frame frame = frames.remove(id);
        if (disabled) { lastReason = "disabled"; return false; }
        if (frame == null) { lastReason = "no-received-frame"; return false; }
        if (now - frame.at > 500) { lastReason = "stale-frame"; return false; }
        if (queued <= processed) { lastReason = "no-unprocessed-audio"; return false; }
        if (!Double.isFinite(audibleGain) || audibleGain <= 0) { lastReason = "inaudible-gain"; return false; }
        if (frame.rms * audibleGain < .0001) { lastReason = "silent-frame"; return false; }
        // SVC queues frames before starting a stopped OpenAL source. Include its
        // actual unprocessed frames so the very first sound wins the race too.
        long buffered = (long)Math.ceil(Math.min(1200, (queued - processed) * frame.durationMs));
        audibleUntil = Math.max(audibleUntil, now + buffered);
        lastReason = "audible";
        return true;
    }

    public synchronized String lastReason() { return lastReason; }

    public synchronized int remainingMs(long now) {
        return (int)Math.max(0, Math.min(1500, audibleUntil - now));
    }

    public static double linearGain(double gain, double listener, double minimum, double maximum,
                                    double distance, double reference, double maxDistance, double rolloff) {
        if (!Double.isFinite(gain + listener + minimum + maximum + distance + reference + maxDistance + rolloff)) return 0;
        double attenuation = maxDistance > reference ? Math.max(0, 1 - rolloff *
                (Math.max(reference, Math.min(maxDistance, distance)) - reference) / (maxDistance - reference)) : 0;
        return listener * Math.max(minimum, Math.min(maximum, gain * attenuation));
    }

    public static double flatGain(double gain, double listener, double minimum, double maximum) {
        if (!Double.isFinite(gain + listener + minimum + maximum)) return 0;
        return listener * Math.max(minimum, Math.min(maximum, gain));
    }
}
