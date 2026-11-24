package org.mcvisual.neoforge;

/** Fixed geometry for the high-health spectator display. Values are health units, not heart counts. */
public record SpectatorHealthGauge(int healthPixels, int absorptionPixels) {
    public static final int WIDTH = 81;
    public static final int HEIGHT = 10;

    public static SpectatorHealthGauge compact(float health, float maxHealth, float absorption) {
        if (!Float.isFinite(health) || !Float.isFinite(maxHealth) || !Float.isFinite(absorption)
                || maxHealth <= 0 || Math.max(maxHealth, health) + Math.ceil(Math.max(0, absorption)) <= 20) {
            return null;
        }
        return new SpectatorHealthGauge(pixels(health, maxHealth), pixels(absorption, maxHealth));
    }

    private static int pixels(float value, float maxHealth) {
        if (value <= 0) return 0;
        if (value >= maxHealth) return WIDTH - 2;
        return Math.max(1, (int) ((double) value / maxHealth * (WIDTH - 2)));
    }
}
