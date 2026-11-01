# Native NeoForge observer candidate

This is a separate loader adapter for Minecraft 1.21.1 / NeoForge 21.1.252.
It consumes the core's `agentmc_client_platform` companion and canonical client
source translator. The existing Fabric builders and installed profiles stay
independent. No Fabric loader, Connector, agent host or model loop is bundled.

The shared director policy, target ownership, finite camera scripts, near-wall
fallback, transitions, original native screenshot capture, compact HUD and
UUID/world/epoch-bound inventory policies are compiled from their existing source.
The native projection backend preserves the OrthoCamera configuration boundary;
it does not claim that the original Fabric-only OrthoCamera JAR runs on NeoForge.
Terrain near/far planes stay -32/96: no world-wide cutaway or fabricated floors.

The original NeoForge YSM JAR stays untouched. Its camera-subject/yaw integration
is owned by the core companion. Original TLM/YSM assets are separate installations.
This adapter has no server scanning, graphics replacement, account list or model
credential. Hosts choose the actual source feeds and decision endpoint explicitly.

Build using a completed core native build report and the package's shipped mapper:

```
node tools/native-client-neoforge/build.mjs --platform-report <core-build-report.json> --mapper <agent-mc-world/scripts/client-source-mappings.mjs> --mappings <1.21.1-tiny> --java-home <JDK21> --output-dir <private-dir>
```

The builder compiles against the report's exact installed original client inputs,
executes the shared Java checks, then recompiles/runs consumers against the finished
JAR. Separate mixin-only namespaces avoid treating entrypoints or policies as mixins.

## Actual acceptance, 2026-11-01

- 390 Java policy/display checks pass from classes and from the packaged consumer.
- 41 JavaScript scene/recovery/shot checks pass. The Fabric path is retained.
- The actual NeoForge candidate reaches the rendered title screen with official
  TLM 1.5.3 / YSM2.6.5 / Sodium and reports the AMD D3D12 renderer.
- Both native mod metadata entries load (director0.1.20, observer0.1.5).
- Production gameplay/render parity is **not accepted**. The deployment's vanilla
  authentication stage rejects required TLM payloads before the modded backend;
  removing TLM reaches authentication but the backend correctly rejects its
  missing registry entries. Do not skip these checks or use a private backend to
  bypass login. A working original observer was restored pending gateway support.
- NeoForge inventory support currently consumes the exact passive SpectatorPlus
  1.2.1 UUID-bearing 9/36-item packets with original compressed NBT and the actual
  connection registry. The full original SpectatorPlus E-key/menu/mirrored vanilla
  food/experience UI is **not ported**. The F9 read-only target inventory is available;
  no operation or GUI parity beyond this is claimed. Do not deploy as a full
  replacement before the missing controls and real same-target receipt are accepted.
- Native projection and YSM hooks compiled and initialized, but live finite shots,
  original maid entities, mod menus and target-switch pixels still need validation
  after a compatible authenticated modded entry exists.

Offline readiness, installation and actual spectator behavior remain separate.
