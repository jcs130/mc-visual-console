package org.mcvisual.voiceactivity;

public final class OutputDeviceRecoveryTest {
    static final Object CLIENT = new Object(), OUTPUT = new Object();
    static OutputDeviceRecovery.Sample sample(String device) {
        return new OutputDeviceRecovery.Sample(CLIENT, OUTPUT, "", device, true, false, true);
    }
    static OutputDeviceRecovery baseline() {
        var recovery = new OutputDeviceRecovery();
        assert !recovery.observe(sample("A"), 0);
        return recovery;
    }
    public static void main(String[] args) {
        var recovery = baseline();
        assert !recovery.observe(sample("A"), 999999) : "no periodic reset of healthy output";
        assert !recovery.observe(sample("B"), 1000000) : "debounce device switch";
        assert !recovery.observe(sample("B"), 1001499);
        assert recovery.observe(sample("B"), 1001500) : "stable replacement requests output-only reload";
        assert !recovery.observe(sample("B"), 1001600) : "same manager is not completion";
        assert recovery.status().equals("waiting-output-manager");
        Object replacement = new Object();
        assert !recovery.observe(new OutputDeviceRecovery.Sample(CLIENT, replacement, "", "B", true, false, true), 1002000);
        assert !recovery.observe(new OutputDeviceRecovery.Sample(CLIENT, replacement, "", "B", true, false, true), 2000000) : "successful replacement does not repeat";

        recovery = baseline();
        assert !recovery.observe(sample("B"), 1000);
        assert !recovery.observe(sample("A"), 2400) : "transient change needs no reset";
        assert !recovery.observe(sample("B"), 2500);
        assert !recovery.observe(sample("B"), 3900);
        assert recovery.observe(sample("B"), 4000);

        for (int condition = 0; condition < 4; condition++) {
            recovery = baseline(); recovery.observe(sample("B"), 1000);
            var stopped = new OutputDeviceRecovery.Sample(CLIENT, OUTPUT, condition == 0 ? "chosen-device" : "",
                    "B", condition != 1, condition == 2, true);
            if (condition == 3) stopped = new OutputDeviceRecovery.Sample(null, null, "", "B", false, false, false);
            assert !recovery.observe(stopped, 3000) : "explicit device/disabled/disconnect/absent client stay untouched";
            assert !recovery.observe(sample("B"), 5000) : "reconnect establishes fresh baseline, not replay";
        }

        recovery = baseline();
        assert !recovery.observe(sample(null), 1000) : "missing OS endpoint is unknown";
        assert !recovery.observe(sample("B"), 2000);
        assert recovery.observe(sample("B"), 3500);

        recovery = baseline(); recovery.observe(sample("B"), 1000);
        assert recovery.observe(sample("B"), 2500);
        assert !recovery.observe(sample("B"), 12499);
        assert !recovery.observe(sample("B"), 12500) : "failed manager has bounded retry cooldown";
        assert !recovery.observe(sample("B"), 32499);
        assert recovery.observe(sample("B"), 32500);
        assert !recovery.observe(sample("B"), 42500);
        assert recovery.observe(sample("B"), 62500);
        assert !recovery.observe(sample("B"), 72500);
        assert !recovery.observe(sample("B"), 1000000) : "three failed attempts stop, no reset loop";
        assert recovery.status().equals("retry-exhausted");

        recovery = new OutputDeviceRecovery();
        assert !recovery.observe(new OutputDeviceRecovery.Sample(CLIENT, null, "", "A", true, false, false), 0);
        assert !recovery.observe(new OutputDeviceRecovery.Sample(CLIENT, null, "", "B", true, false, false), 999999)
                : "normal SVC startup is not owned by this observer extension";
        assert !recovery.observe(sample("B"), 1000000);
        System.out.println("OutputDeviceRecovery: default change, stable output, debounce, actual manager, explicit device, disable, disconnect, missing device, bounded retries and startup passed");
    }
}
