# Vanilla maid compatibility view

Source candidate, 2026-10-31. Updating this repository does not install it in a website or worker.

The server's explicit vanilla projection maps a Touhou Little Maid to `minecraft:allay` and a hostile fairy to `minecraft:vex`. These remain the original server UUIDs and positions. This renderer follows those received types; it does not guess a maid from a name, invent an original TLM model, or replace the server entity.

Allay/Vex geometry uses the existing original 1.21.1 LayerDefinition export and original 32×32 textures. Wing, hover, arm, charge and item-holding transition calculations have 48 numeric reference poses from the unmodified original client JAR, SHA256 `499f6897d1837516680f3114072d8106e11c9adcd933fe5cf051b551089b0c99`. `tools/ProbeVanillaFlyingModels.java` records the original CPU reference; the fixture stores numeric results, not a redistributed client JAR.

Motion consumes the same connection's actual ticks, position, body/head angles and metadata. Source equipment can be a Map before snapshots and an array afterward. Unknown motion is unavailable rather than an invented walk cycle. Names use the actual visible custom-name metadata, bounded component decoding and a canvas label; interactive fields are never executed. Browser system fonts are explicitly not the original game's font rendering.

Complete Java scene parity remains false. Original lightmap, Allay dance/spin state and held-item layers are explicitly reported unavailable where applicable. Original native TLM rigs and its entire model catalog are not claimed by this compatibility renderer.

The real loopback Youer scene was exported by WorldObserver, decoded by the shared observation host and rendered in headless Edge at 1280×800 and 390×844. Original entity UUIDs, advancing wing ticks, stone terrain and Chinese role labels were observed. This is not a production WAN latency measurement or a physical phone test. Shared tests: 1,409 passed, 39 conditional skips.

Actual Mineflayer viewer connections declare the existing `mcagent:appearance` / `mcagent:ysm_asset` decoders in PLAY and after reconnect. The read-only Paper observation facade declares no game channel and never opens another Minecraft connection. Consumers must freeze matching host and browser source/build digests before activation.
