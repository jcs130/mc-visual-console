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

## Display and inventory boundary

The adapter consumes the UUID-bearing SpectatorPlus 1.2.1 display protocol using
the actual connection registry and original compressed item NBT. It exposes native
hotbar, health, food and experience displays, an explicit E-key inventory request,
and mirrored container screens. Unknown or unreceived items stay unavailable;
packets from another target, world, connection or epoch cannot supply current data.
An unchanged hotbar remains valid while that exact target's authoritative heartbeat
is current, since the protocol sends only changed slots. Full inventory additionally
requires a recent receipt or an actually owned mirrored window; closing the window
does not create a permanent full-inventory subscription.
Inventory screens are read-only: slot, recipe, creative and pick-item mutations are
blocked while an owned screen is open. Changing target or losing the scoped snapshot
closes it. There is no automatic inventory polling or second observation account.

This is an independently maintained NeoForge adapter, not the Fabric SpectatorPlus
binary. The combined native visual artifact is GPL-3.0-only with shared MIT notices;
see [NOTICE.md](NOTICE.md) and [LICENSE-SPECTATORPLUS](LICENSE-SPECTATORPLUS).
The consumed `agent-mc-world` platform and SDK remain separate MIT artifacts.

## Actual acceptance, 2026-11-01

- 438 Java policy/display checks pass from classes and from the packaged consumer,
  including target ownership, read-only windows, expiry and request-rate cases.
- 41 JavaScript scene/recovery/shot checks pass. The Fabric path is retained.
- The actual NeoForge candidate reaches the rendered title screen with official
  TLM 1.5.3 / YSM2.6.5 / Sodium and reports the AMD D3D12 renderer.
- Both native mod metadata entries load (director0.1.21, observer0.1.6).
- The explicit disconnected `-Dmcvisual.offlineContractCheck=true` diagnostic loads
  the ten actual transformed Minecraft/YSM target classes, covering camera, HUD,
  keyboard and container hooks. This is a title-screen check, not server acceptance.
- Production gameplay/render parity is **not accepted**. The deployment's vanilla
  authentication stage rejects required TLM payloads before the modded backend;
  removing TLM reaches authentication but the backend correctly rejects its
  missing registry entries. Do not skip these checks or use a private backend to
  bypass login. Server entry compatibility is being verified separately.
- E-key, menu and mirrored vanilla HUD integration is implemented and its actual
  target classes load. Real same-target packet delivery, menu contents and native
  GUI pixels have **not** yet been accepted on the production server. The original
  F9 read-only target inventory remains available. Source/compile checks do not
  establish parity with every server or mod-specific menu.
- Native projection and YSM hooks compiled and initialized, but live finite shots,
  original maid entities, mod menus and target-switch pixels still need validation
  after a compatible authenticated modded entry exists.

Offline readiness, installation and actual spectator behavior remain separate.
