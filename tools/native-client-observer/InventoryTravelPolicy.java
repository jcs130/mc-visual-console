package org.mcvisual.observer;

/** Dismisses only observer-owned previews. Motion refers to the followed body. */
public final class InventoryTravelPolicy {
    public static final long IDLE_PREVIEW_MS = 15_000;
    public static final long MAX_UNATTENDED_MS = 30_000;
    private final long openedAt, idlePreviewMs;
    private long lastActivity, lastInspection, lastMotion;
    private double originX, originZ, lastX, lastZ;
    private boolean sampled, pinned;

    /** Travel-only policy for callers that do not opt into an idle deadline. */
    public InventoryTravelPolicy(long now) { this(now, 0); }

    public InventoryTravelPolicy(long now, long idlePreviewMs) {
        if (idlePreviewMs < 0) throw new IllegalArgumentException("Negative preview duration");
        this.openedAt = this.lastActivity = this.lastInspection = now;
        this.idlePreviewMs = idlePreviewMs;
    }

    public boolean pinned() { return pinned; }

    public void togglePin(long now) {
        pinned = !pinned;
        interaction(now);
    }

    public void interaction(long now) { lastInspection = lastActivity = now; }
    public void contentChanged(long now) { lastActivity = now; }

    public boolean expired(long now) {
        return !pinned && idlePreviewMs > 0 &&
            (now - lastActivity >= idlePreviewMs || now - lastInspection >= Math.max(idlePreviewMs, MAX_UNATTENDED_MS));
    }

    public boolean observe(long now, double x, double z, boolean fresh) {
        if (expired(now)) return true;
        if (!fresh || !Double.isFinite(x) || !Double.isFinite(z)) {
            sampled = false;
            return false;
        }
        if (!sampled) {
            sampled = true;
            originX = lastX = x;
            originZ = lastZ = z;
            lastMotion = now;
            return false;
        }
        double step = Math.hypot(x - lastX, z - lastZ);
        if (step > 32) { originX = x; originZ = z; }
        if (step > .04) lastMotion = now;
        lastX = x;
        lastZ = z;
        return !pinned && now - openedAt >= 6000 && now - lastInspection >= 4000 &&
            now - lastMotion <= 1500 && Math.hypot(x - originX, z - originZ) >= 8;
    }
}
