import org.mcvisual.neoforge.SpectatorHealthGauge;

public final class SpectatorHealthGaugeCheck {
    public static void main(String[] args) {
        expect(SpectatorHealthGauge.compact(14, 20, 0) == null, "one-row health keeps native hearts");
        expect(SpectatorHealthGauge.compact(10, 18, 2) == null, "shield that still fits one row keeps native hearts");
        expect(SpectatorHealthGauge.compact(10, 20, 0.25f).absorptionPixels() == 1, "shield overflow uses a separate thin segment");
        expect(SpectatorHealthGauge.compact(87.5f, 87.5f, 0).healthPixels() == 79, "full fractional maximum");
        expect(SpectatorHealthGauge.compact(87, 87.5f, 0).healthPixels() == 78, "near full still leaves a gap");
        expect(SpectatorHealthGauge.compact(43.75f, 87.5f, 0).healthPixels() == 39, "half health fits one row");
        var shielded = SpectatorHealthGauge.compact(43.75f, 87.5f, 17.5f);
        expect(shielded.healthPixels() == 39 && shielded.absorptionPixels() == 15, "absorption does not fill missing health");
        expect(SpectatorHealthGauge.compact(0, 87.5f, 200).equals(new SpectatorHealthGauge(0, 79)), "empty health and capped shield");
        expect(SpectatorHealthGauge.compact(Float.NaN, 100, 0) == null, "do not draw with unavailable data");
        expect(SpectatorHealthGauge.HEIGHT == 10 && SpectatorHealthGauge.WIDTH == 81, "one native HUD row");
        System.out.println("10 spectator health geometry checks passed");
    }

    private static void expect(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
