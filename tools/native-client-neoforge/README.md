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

## First-person rendering, 0.1.22

The native observer now renders the actual camera subject's original main/offhand
ItemStacks and player arms through the original Minecraft item renderer. It keeps
equip interpolation, swings, use animations, maps and bow/crossbow hand selection.
The hooks are adapted from the reviewed upstream version recorded in NOTICE.md.
Renderer-owned cached references are the only item state changed by these hooks.
They do not send gameplay input or mutate the target's inventory.

Rendering requires the explicit native observer scope, a fresh authoritative target,
an exact camera UUID match and a hand tick from the same connection/world/entity
scope. Third-person, hidden GUI and open menus do not draw an extra foreground pair.
The optional diagnostic `diagnostics/mcvisual-first-person.json` reports the current
target, original item IDs, last draw time and render failures. A draw receipt is not
proof of model fidelity or of every animation being available over the network.

The builder resolves MixinExtras from the exact original NeoForge universal JAR
already supplied in the core build report, records both hashes, and uses it only
for compilation. It does not download or bundle another copy of that library.

## Optional Iris hand path, 0.1.23

Iris owns separate solid/translucent hand passes and excludes spectator accounts
from them. Calling the vanilla hand renderer can produce a draw receipt while the
shader pipeline discards the result. The optional pseudo-mixin therefore changes
only the shader display gate for the exact fresh native target and supplies that
target's item for Iris's existing material classification. It never changes the
actual game mode. Original detached-camera, hidden-GUI and sleeping checks remain.

Inside Iris's active hand pass the adapter invokes the original item renderer with
the same target, cached equipment, swing/use state and shader-owned buffer. With
shaders enabled it suppresses the duplicate vanilla pass; with shaders disabled or
Iris absent the existing vanilla path remains. Original Iris binaries and notices
stay separate; the adapter does not package their code. Unsupported optional API
shapes fail closed and report the incompatibility rather than drawing fake hands.

The scope/pipeline regression has 28 hand cases (466 total source and packaged
checks). Real disconnected NeoForge with the official Iris1.8.12, Sodium0.6.13,
ImmediatelyFast1.6.15, FerriteCore7.0.3, NotEnoughAnimations1.12.7, TLM and YSM loads
all twelve transformed targets, including Iris HandRenderer, on RTX5090. Actual
shader hand pixels and animations still require live acceptance after installation.

## Scoped final-frame capture, 0.1.24

The existing one-shot `mcvisual-vision-request.json` accepts optional
`"stage":"composited"` on the NeoForge adapter. It captures the final Minecraft
framebuffer, including original hands and GUI, on RenderFrameEvent.Post. The
default stage remains world-only for existing visual decision consumers. All
current server/observer/connection/world/target/camera request bindings, 5-second
expiry and 512-pixel budgets remain mandatory. Explicit final-frame requests can
include a scoped menu; transitions and stale/wrong camera scopes are refused.
The receipt declares `captureStage` and the exact output hash. No window focus,
desktop pixels, key press, gameplay input or extra connection is used. Hosts whose
adapter lacks the final-frame hook reject this stage instead of silently returning
a world-only image. Eight additional admission checks cover these boundaries.

## Actual acceptance, 2026-11-02

- The installed 0.1.21 client passed an authenticated same-target audit of native
  first/third-person cameras, orthographic isometric/top/overview/close projection,
  and a genuine 36-slot read-only target inventory. Third-person equipment was
  visible; first-person hands/items were missing, which prompted 0.1.22.
- Finite motion remains bounded: one pull-out completed, while an obstructed orbit
  and a moving-subject push-in stopped conservatively. Accepted requests are not
  counted as completed shots. Near-wall low shots can fall back to first-person.
- The 0.1.22 candidate passes 458 source checks and the same 458 checks from an
  independently compiled packaged consumer, including 20 hand scope/use cases.
  The 84 JavaScript camera/decision/motion/adapter/shot regressions also pass.
- The final 0.1.22 JAR reaches the real disconnected NeoForge title screen with
  original TLM1.5.3, YSM2.6.5 and Sodium. Eleven actual transformed target classes
  load, including GameRenderer and ItemInHandRenderer; no game connection exists.
- This candidate has not been installed into the live observer. Actual first-person
  sword/shield, map/use animation and YSM arm pixels require a separate live check.
  Workbench/furnace/mod-specific mirrored menus are also not yet accepted. Their
  server window delivery cannot be inferred from an E-key inventory snapshot.
- A server-side YSM readiness failure is tracked separately from item rendering.
  Original model selection, assets and server bindings stay untouched. A bright
  blurred menu backdrop was observed and is not claimed fixed by the hand patch.

Private screenshots, logs and binaries remain outside Git. Source, build, live
installation and actual rendered acceptance are recorded separately.

## Historical acceptance, 2026-11-01

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
