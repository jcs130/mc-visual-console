package org.mcvisual.voiceactivity;

import java.util.Objects;

/** Follows a changed OS default only when SVC itself is configured to follow it. */
public final class OutputDeviceRecovery {
    public record Sample(Object client, Object manager, String configured, String systemDefault,
                         boolean connected, boolean disabled, boolean ready) {}
    private Object client, requestedManager;
    private String boundDefault, candidate, requestedDefault;
    private long candidateSince, requestedAt, retryAfter;
    private int attempts;
    private String status = "unobserved";

    public String status() { return status; }

    /** Returns a request, never completion. Call again with the actual new sound manager. */
    public boolean observe(Sample sample, long now) {
        if (sample == null || sample.client() == null || !sample.connected() || sample.disabled()
                || sample.configured() == null || !sample.configured().isBlank()) {
            reset(); status = "inactive-or-explicit-device"; return false;
        }
        if (client != sample.client()) { reset(); client = sample.client(); }
        String device = sample.systemDefault();
        if (device == null || device.isBlank()) { status = "default-unavailable"; return false; }
        if (boundDefault == null) {
            if (sample.ready()) { boundDefault = device; status = "baseline"; }
            return false; // SVC owns startup, reconnect and its initial retry.
        }
        if (requestedDefault != null) {
            if (sample.ready() && sample.manager() != requestedManager) {
                boundDefault = requestedDefault;
                requestedDefault = null;
                attempts = 0;
                retryAfter = 0;
                status = "new-output-manager-observed";
            } else if (now - requestedAt < 10000) {
                status = "waiting-output-manager"; return false;
            } else {
                requestedDefault = null;
                status = "output-reload-unconfirmed";
            }
        }
        if (Objects.equals(device, boundDefault)) {
            candidate = null; attempts = 0; status = "following-default"; return false;
        }
        if (!Objects.equals(device, candidate)) {
            candidate = device; candidateSince = now; attempts = 0;
        }
        if (now - candidateSince < 1500 || now < retryAfter || attempts >= 3) {
            status = attempts >= 3 ? "retry-exhausted" : "stabilizing-default"; return false;
        }
        requestedDefault = device;
        requestedManager = sample.manager();
        requestedAt = now;
        retryAfter = now + 30000;
        attempts++;
        status = "request-output-reload";
        return true;
    }

    private void reset() {
        client = requestedManager = null;
        boundDefault = candidate = requestedDefault = null;
        candidateSince = requestedAt = retryAfter = 0;
        attempts = 0;
    }
}
