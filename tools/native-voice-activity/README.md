# Optional local game-voice activity

Receive-only NeoForge 1.21.1 / Simple Voice Chat 2.6.27 integration for a broadcaster's existing listening client. This does not create a player, send voice, start a microphone, change sound settings or supply game observations to an Agent. Disabled unless explicitly configured. It reports only short-lived anonymous audio-device activity to a loopback coordinator, never PCM, ASR, chat or player identities.

Build using the listening client's installed SVC, NeoForge loader and LWJGL dependencies:

```sh
node tools/native-voice-activity/build.mjs --profile /path/to/client --jdk /path/to/jdk-21 --out /external/artifacts
```

Install the resulting JAR in that client's `mods` directory and create `config/mcvisual-voice-activity.properties`:

```properties
enabled=true
endpoint=http://127.0.0.1:18580/v1/game-audio
```

The client needs a restart to load a new mod. Preserve any operator pause or independent observer identity. This optional mod does not modify the native camera, observer account binding, GPU selection or HUD.

## Evidence and wire contract

`ClientReceiveSoundEvent.EntitySound`, `.LocationalSound` and `.StaticSound` reduce a decoded frame to level and duration; SVC dispatches these exact interfaces. A frame alone never opens the gate. `OpenALSoundEvent.Post` must also identify a real audio channel/source with unprocessed device buffers and audible effective gain. Microphone testing events have no channel and are ignored.

SVC 2.6.27's native source actually selects `AL_LINEAR_DISTANCE` (0xD003), which is distinct from `AL_LINEAR_DISTANCE_CLAMPED` (0xD004). Both native linear variants are supported. Its alternate mixing path can apply distance in SVC and use `AL_NONE`; that path reads the already attenuated gain without applying distance again. Silent frames, zero player/category/master volume, voice disabled/disconnected, processed buffers and out-of-range gain do not extend activity. Other audio backends/distance models have no activity proof. Long-lived channels are never treated as continuous speech. The plugin logs the actual model and at most eight anonymous rejection diagnostics to make runtime incompatibility distinguishable from silence.

The metadata POST uses HTTP/1.1 and an 800 ms deadline. It is asynchronous, limited to ten updates/second while active and one/second when idle. No request owns a Minecraft or model execution queue. A new producer identity is created per JVM; `sequence` increases per report:

```json
{"protocol":"game-audio-activity/v1","source":"observer-random-uuid","sequence":1,"observedAt":1794310000000,"active":true,"holdMs":100,"receivedFrames":50,"deviceFrames":49,"audibleFrames":48}
```

`holdMs` reflects bounded unprocessed device audio, maximum 1,500 ms. The local receiver must reject old/invalid reports, expire the signal, and add a short release tail. An unreachable activity bridge is unknown, never permission to claim that all players heard a sentence. Counters distinguish receive frames, device frames and qualified audible frames; they do not prove intelligibility, an utterance's completion, or another recipient's playback.

The broadcast player should pause/resume its **same** speech audio graph, retain the current lease and actual start/end receipts, and duck music. Muting speech while its sample clock advances loses words. Dropping/releasing a still-audible broadcast owner can cause a second speaker to start. Do not block Agent thinking or game movement on this signal.

## Verification

The builder compiles against real installed API classes and runs dependency-free range, silence, stale-frame, buffering and endpoint tests. Verify plugin loading and metadata delivery in an isolated disconnected client, then obtain authorization before interrupting a live observer. A real game voice sample is still required to verify natural SVC events and timing. A metadata fixture or `HTTP 200` alone cannot establish audible playback.

Primary API documentation: [receive sound events](https://voicechat.modrepo.de/de/maxhenkel/voicechat/api/events/ClientReceiveSoundEvent.html), [OpenAL events](https://voicechat.modrepo.de/de/maxhenkel/voicechat/api/events/OpenALSoundEvent.html), [NeoForge registration](https://dev.modrepo.de/minecraft/voicechat/api/getting_started).
