# Native 1.21.1 observer audio

The observer plays the action player's received sound packets. It does not send
game messages, create another bot, call a model or synthesize voice. Effects and
music default **off**; opening the page does not create an AudioContext. The
preview plays the original UI click only in that browser. The separate playlist
button starts a continuous original `music.game` playlist for the observer, not
a claim that the server is playing music. Tracks remain compressed; they continue
after a short 2–8 second gap. Loading errors back off for 30 seconds. Disconnect,
mute and page disposal cancel scheduled playback. The viewer remembers local
enable/volume choices, but restores them only after a browser gesture. The panel
separately counts effects and music, and exposes the last failed sound and reason.

## Original inputs and preparation

`asset-packs/java-1.21.1-sounds` contains 3707 exact OGG objects, the original
sounds JSON and index, the exported 1611-entry sound registry and 1060 block sound
types. `pack.json` records every file's byte count and SHA-256. Inputs are Mojang
launcher resources: index17 SHA-1 `e5cb391af96038a8af638bf7cc7f2be44bc4b843`,
sounds JSON SHA-1 `09eab141cce7550f9a74c65db0e9abbb342cf50f`, and client SHA-256
`499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99`.
These original game resources remain separate from the renderer's own license.

From the repository root:

```sh
node tools/prepare-viewer-assets.mjs --verify java-1.21.1-sounds
node tools/prepare-viewer-assets.mjs vanilla-1.21.1 /absolute/output --sounds
```

Native modded packs may use the same original base sound objects, but their
numeric registry must not be aliased to vanilla IDs. The host enables numeric
vanilla sounds only for the exact original block/entity registry hash pair.
Otherwise only actually received inline names can select existing sound assets;
missing mod sounds remain unavailable. A missing audio pack disables audio alone.

## Playback and lifetime

- Packet sound positions use eighth-block coordinates; entity sounds follow the
  actual entity UUID/spawn identity. Removal or ID reuse stops that source.
- The bounded ephemeral channel requires the same player/epoch and snapshot.
  It is not retained in snapshots and is never replayed on reconnect. Sound
  traffic is limited to128 events/second; stop packets bypass that limit.
- Original seeded Java random draws choose weighted variants, including recursive
  references. `gvg.getSound` consumes a draw even for one entry; `gvf$a$1`
  references use child total weight and consume another draw. Reference volume
  and pitch multiply with float rounding. No flattened reference RNG is used.
- `gti` stores a SoundEvent's location; `gvc` attenuation uses selected Sound
  distance times max(volume,1). A wire SoundEvent.fixedRange is a server audience
  bound, not a replacement client attenuation distance.
- Effects use Web Audio positional sources, pitch and separate category/master
  gains. The browser checks SHA-1, SHA-256 and length before decoding. Original
  streamed tracks use compressed Blob-backed media, avoiding whole-track PCM
  expansion. PCM cache is capped at64MiB/32 entries; active sources at48, with one
  streamed source. Stops and disable/reconnect also invalidate pending decodes.
- Pickup sounds use the original item/XP volume and pitch rules only on an actual
  received collect event. Their random stream is the observer's local client
  phase, not an invented server seed.

Web Audio/HRTF is not OpenAL scene parity. Full engine timing, streaming, missing
mod sounds and unreceived client ambience remain separate limitations.
For the matched vanilla registries, original client SoundTypes also supply the
body's observed digging hits, confirmed digging completions and grounded
footsteps. Actual sent slot clicks/attacks supply local click/swing sounds, never
assumed task success. Retained activity is not replayed on joining a view;
stale/unknown surfaces and mod registries do not produce substitute sounds.
The listener follows the action body, so an elevated 2.5D camera cannot mute its
nearby sounds. This is still partial client sound-engine coverage.
`completeAudioParityVerified` stays false. HTTP success and an offline decoder
double are not real browser playback acceptance.
