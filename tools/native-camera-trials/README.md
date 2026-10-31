# Optional native camera laboratory

This Fabric 1.21.1 companion compares the exact pinned Free Camera 2.2.0,
VCam 1.0.1 (internal mod version 1.0.0), and FPVcraft 0.1.0 release components
on **one existing observer**. It is disabled without an explicit
`config/mcvisual-camera-trials.json` with `enabled`, exact `server`, `observer`
and allowed `targets`. It creates no player, game goal, login or model loop.

Yield the normal selector at a known terminal boundary and request native
`first_person` on the original subject before starting a trial. The native
drone must report inactive. The trial request in
`config/mcvisual-camera-trial-request.json` binds `targetUuid`, `observerUuid`,
`connectionEpoch`, `nativeWorldEpoch` and `nativeRequestId` to a fresh authenticated
attachment. Every request has bounded `id`, `lease`, `issuedAt`, `expiresAt`
(at most 90 seconds), `mode` (`freecamera`, `vcam`, `fpvcraft`), `shot`
(`tripod`, `orbit`), `radius` (1–10), `height` (0–9), `azimuthDeg`, and
`orbitDegPerSecond` (at most 12). Manual screens/perspectives hold that lease.
World, connection or subject changes stop it. An explicit `mode: off` releases
the components. Restore the normal selector only after a known release.

`diagnostics/mcvisual-camera-trials.json` separates requested composition from
the actual camera pose sampled after native rendering, render time and cadence.
It does not claim that acceptance equals visible rendering, that an FPS sample
is a benchmark, or that a prepared skill is used. A live trial still requires
native frame inspection and a successful return to the original camera.

VCam's original initializer starts all-interface web/WS listeners. The build
produces a clearly labelled derivative changing **only** `fabric.mod.json` to
suppress that initializer; all original class/resource bytes remain identical.
The companion starts an ephemeral **loopback-only**, single-client WS while a
VCam trial is active. Every input binds request/lease, expires with its request,
requires finite bounded numeric sensor values, and is applied on the client
thread. `sensor` inputs use the original released parser and camera Mixin.
`request_world` is rate-limited to once per five seconds and uses the released
world sender. That sender centres on the **observer** and emits colour-category
blocks, not a subject UUID map, original block state IDs or exact collision
geometry. Do not describe it as a complete voxel/sensor API. No optional capture
launcher or video streamer is started.

FPV trials require JVM property `-Dfpvcore.noservermod=true` **and** actual
`Session.serverMod()==false`. Physical controllers abort this unarmed trial.
The first comparison is a kinematic native FPV camera reset in already loaded
space; it does not claim autonomous physical flight, a position-hold controller,
an independent full gimbal, or a server-visible drone. Full flight/chunk-following
needs separate server capability and authorization. Free Camera and VCam can
separate optical rotation and translation; FPVcraft ties them to the drone body
and native camera uptilt. This distinction should remain visible in acceptance.

Build with `build.py --game-dir ... --java-home ... --camera-artifacts ...
--output-dir ...`. Original release hashes are checked before compiling against
the matching game cache. The finished production JAR is consumed by an independent
policy test. Original/derived JARs, game configuration, screenshots and live
receipts stay outside Git. Do not enable all camera owners simultaneously or
interrupt another maintenance operation on the same live instance.

An explicit request `capture: true` saves one native screenshot after at least
five rendered frames, at most once per five seconds and twenty per client run.
The generated filename uses only the bounded request identifier under the existing
game screenshots folder. Diagnostics distinguish the requested path from the
actual saved PNG; inspect the file before claiming a visual result.
