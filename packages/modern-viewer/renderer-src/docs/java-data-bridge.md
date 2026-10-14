# Real Java client to browser data bridge

The browser consumes world data from the action player's own Java client. This is a separate data path from optional framebuffer capture:

```text
Fabric ClientWorld / ClientPlayer
  -> authenticated agent-mc-visual/v1 observations
  -> shared native registry / chunk / motion adapter
  -> existing Socket.IO viewer protocol
  -> existing browser WebGL renderer and independent cameras
```

`createJavaDataViewer` from `mc-visual-console/java-data-viewer` accepts an injected `rpc(method, params)`, expected player UUID/server, matched assets directory, loopback port, and bounded chunk radius (default 2, maximum 4). The host owns credentials and lifecycle. The viewer cannot issue game actions, launch/reconnect a client, or call a model. It only calls `visual_registry`, `visual_frame`, `visual_chunk`, and on demand `visual_skin`.

## v1 observation contract (Minecraft 1.20.6)

Every response includes `protocol`, `minecraftVersion`, `uuid`, `server`, `dimension`, world `epoch`, monotonic `sequence`, and native `sampledAt` in Unix milliseconds. World replacement invalidates all cached chunks/entities. Missing/old data disconnects the view; history is never presented as current.

- Registry: native block ID, namespaced name and canonical property values; dynamic biome ID and namespaced name. Conversion uses full name/properties, never assumes matching ordinal IDs.
- Frame: own position, native degree yaw/pitch/head yaw, velocity, dimensions, pose, equipment, health/food, skin resource/model, observed entities, world time/weather, loaded column indices and revisions. Maximum 256 observed entities / 81 columns. Initial renderer slice draws the own vanilla player only.
- Chunk: loaded column only, native section serialization (base64 **binary game data**, not image bytes), actual minY/height, native sky/block light arrays, revision. Absent light storage is sampled through native propagation rather than guessed as zero. Block entity support is explicitly false.

Chunks update only when changed or entering view. Position/avatar/entity events retain order; three consecutive volatile Socket.IO emits drop later packets while the first packet is writing. Slow clients have a bounded queue and are disconnected. Movement does not recreate equipment or emit hurt effects repeatedly. Hurt effects follow actual hurt tick rising edges.

Visual polling runs only while an admitted browser/capture session needs it. HTTP page/health requests and an idle viewer host perform no native observations. Concurrent first sessions share one fresh sample, and reconnecting after idle refreshes facts before delivering the scene. Registry data is cached per native world epoch; only changed/entering chunks are fetched. `/healthz` exposes `state: idle|streaming|unavailable|closed` and `sampling`, separating ready-but-idle from a verified live scene. A bounded in-flight request may finish after the last session disconnects; no new sample is scheduled. Existing two ordinary/one capture session limits remain unchanged.

## Current coverage and limits

Implemented and isolated-game tested: loaded vanilla terrain, block changes, native light, time/weather, actual own vanilla skin, own movement/turning/vitals, browser camera independence. Native registry rejection is explicit for unsupported blocks/biomes/items/skins. `/healthz` and the page show partial coverage.

Custom online skins use a bounded `visual_skin {resource}` read from the action client's actual current skin texture (64x32 or 64x64 PNG). The native side verifies current resource, UUID and server, restores the texture binding after readback, and never accepts arbitrary file paths or remote URLs. The web host validates the response identity/resource/dimensions and caches the exact pixels, with a maximum of 32 skin resources. Old clients without this observation explicitly report unsupported custom skins.

Not complete: other entity variants/metadata, inventories/container interfaces, block entities, HD skins, modded resource priority, YSM model/animation state, shader parity. Do not select this preview as a complete modpack viewer. Java mods do not become WebGL implementations simply by forwarding their identifiers; port their exact assets and current state through explicit shared adapters. No alternate observer account, fake vanilla model or hidden screenshot fallback is used.

The bridge and converter are generic. Server gameplay belongs in optional integration packs. Cormy's identity/model files stay in her private profile. Host adapters wire lifecycle and configuration only.

## Reproducible consumer bundle

Run `node tools/build-java-data-host.mjs <explicit-output>/java-data-viewer.mjs` from the renderer source package. The emitted provenance file records shared source commit, each input SHA-256 and output SHA-256. Consumers ship this generated module and its declared external dependencies, not hand-maintained forks. No generated game assets or private captures belong in Git.

Targeted checks: `node --test test/java-visual-data.test.mjs test/java-data-viewer.test.mjs`. They cover registry/lighting, identity/epoch/revision boundaries, movement delivery, no screenshot/control RPC, origin checks, session limits and disconnect behavior. Full visual parity still requires matched real Java and browser samples.

Native biome palettes preserve custom names and IDs. Grass, foliage and water RGB come from the actual client biome methods, including resource color maps; they are carried inside the chunk JSON to the shared mesher. Grass is sampled at biome coordinates (0,0), without position-dependent blending/noise parity. This supports data-pack biomes without renaming them to vanilla biomes. Missing native colors remain unsupported; old meshers are explicitly rejected.
