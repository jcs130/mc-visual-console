package org.mcvisual.voiceactivity;

import java.net.URI;
import java.util.Arrays;
import java.util.UUID;

public final class ActivityWindowTest {
    public static void main(String[] args) {
        UUID channel = UUID.randomUUID();
        short[] speech = new short[960]; Arrays.fill(speech, (short)4000);
        ActivityWindow window = new ActivityWindow();
        assert window.remainingMs(1000) == 0 : "open channels do not imply playback";
        window.receive(channel, speech, 1000);
        assert window.remainingMs(1000) == 0 : "received audio is not yet device audio";
        window.rendered(channel, 1, 5, 1, false, 1010);
        assert window.remainingMs(1010) == 80 : "count only unprocessed device frames";
        assert window.remainingMs(1091) == 0 : "channel lifetime cannot hold the gate";
        for (int scenario = 0; scenario < 5; scenario++) {
            window.receive(channel, scenario == 0 ? new short[960] : speech, 2000);
            window.rendered(channel, scenario == 1 ? 0 : 1, 3, scenario == 2 ? 3 : 0, scenario == 3, scenario == 4 ? 2601 : 2010);
            assert window.remainingMs(2010) == 0 : "silence/mute/empty/disabled/stale must not gate";
        }
        window.receive(channel, speech, 3000);
        window.rendered(channel, 1, 500, 0, false, 3010);
        assert window.remainingMs(3010) == 1200 : "bounded stalled device";
        assert ActivityWindow.linearGain(1, 1, 0, 1, 20, 0, 20, 1) == 0 : "out of range";
        assert ActivityWindow.linearGain(1, 0, 0, 1, 1, 0, 20, 1) == 0 : "listener muted";
        assert ActivityWindow.linearGain(1, 1, 0, 1, 10, 0, 20, 1) == .5 : "native linear attenuation";
        assert ActivityWindow.flatGain(.5, 1, 0, 1) == .5 : "stereo already attenuated in SVC";
        assert ActivityWindow.flatGain(0, 1, 0, 1) == 0 : "stereo distant or muted";
        assert VoiceActivityPlugin.deviceGain(org.lwjgl.openal.AL11.AL_LINEAR_DISTANCE, 1, 1, 0, 1, 10, 0, 20, 1) == .5 : "actual SVC unclamped linear enum";
        assert VoiceActivityPlugin.deviceGain(org.lwjgl.openal.AL11.AL_LINEAR_DISTANCE_CLAMPED, 1, 1, 0, 1, 10, 0, 20, 1) == .5 : "clamped linear enum";
        assert VoiceActivityPlugin.deviceGain(org.lwjgl.openal.AL10.AL_NONE, .5, 1, 0, 1, 1000, 0, 20, 1) == .5 : "already positioned mixing";
        assert VoiceActivityPlugin.deviceGain(-99, 1, 1, 0, 1, 10, 0, 20, 1) == 0 : "unknown distance model";
        assert VoiceActivityPlugin.isLocalEndpoint(URI.create("http://127.0.0.1:18580/v1/game-audio"));
        assert !VoiceActivityPlugin.isLocalEndpoint(URI.create("http://example.com:18580/v1/game-audio"));
        assert !VoiceActivityPlugin.isLocalEndpoint(URI.create("http://127.0.0.1:18580/v1/game-audio?audio=1"));
        System.out.println("ActivityWindow: receive/device/range/expiry/stereo/endpoint assertions passed");
    }
}
